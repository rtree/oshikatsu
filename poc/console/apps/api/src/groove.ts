import { randomUUID } from "node:crypto";
import { encodeGrooveEvent, reactionIds } from "@oshikatsu/protocol";
import { z } from "zod";
import { getFirestore } from "./firestore.js";
import { getRoom, roomIdSchema } from "./rooms.js";

const accountIdSchema = z.string().regex(/^0\.0\.\d+$/);

export const groovePrepareSchema = z.object({
  room_id: roomIdSchema,
  work_id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,31}$/),
  account_id: accountIdSchema,
  reaction_id: z.enum(reactionIds),
  shout: z.string().optional(),
}).strict();

type GroovePreparation = {
  id: string;
  room_id: string;
  work_id: string;
  topic_id: string;
  account_id: string;
  message_base64: string;
  message_bytes: number;
  event_hash: string;
  created_at: string;
  expires_at: string;
};

type MirrorMessage = {
  chunk_info: null | {
    initial_transaction_id: {
      account_id: string;
      nonce: number;
      scheduled: boolean;
      transaction_valid_start: string;
    };
    number: number;
    total: number;
  };
  consensus_timestamp: string;
  message: string;
  payer_account_id: string;
  sequence_number: number;
  topic_id: string;
};

function transactionKey(transactionId: string) {
  const decoded = decodeURIComponent(transactionId).trim();
  const atMatch = /^(0\.0\.\d+)@(\d+)\.(\d+)$/.exec(decoded);
  if (atMatch) return `${atMatch[1]}-${atMatch[2]}-${atMatch[3]}`;
  const dashMatch = /^(0\.0\.\d+)-(\d+)-(\d+)$/.exec(decoded);
  if (dashMatch) return `${dashMatch[1]}-${dashMatch[2]}-${dashMatch[3]}`;
  throw new Error("Invalid Hedera transaction id.");
}

function messageTransactionKey(message: MirrorMessage) {
  const initial = message.chunk_info?.initial_transaction_id;
  if (!initial) return null;
  const [seconds, nanos] = initial.transaction_valid_start.split(".");
  return seconds && nanos ? `${initial.account_id}-${seconds}-${nanos}` : null;
}

export async function prepareGroove(input: z.infer<typeof groovePrepareSchema>) {
  const room = await getRoom(input.room_id);
  if (!room) throw new Error("Room not found.");
  if (room.phase !== "LIVE") throw new Error("Room is not live.");
  if (!room.works.some((work) => work.id === input.work_id)) throw new Error("Work is not in this Room.");

  const id = `groove-${randomUUID().replaceAll("-", "")}`;
  const bytes = encodeGrooveEvent({
    roomId: room.id,
    eventId: id,
    manifestHash: room.manifest_hash,
    workId: input.work_id,
    accountId: input.account_id,
    reactionId: input.reaction_id,
    ...(input.shout === undefined ? {} : { shout: input.shout }),
  });
  const event = JSON.parse(new TextDecoder().decode(bytes)) as { e: string };
  const now = Date.now();
  const preparation: GroovePreparation = {
    id,
    room_id: room.id,
    work_id: input.work_id,
    topic_id: room.topic_id,
    account_id: input.account_id,
    message_base64: Buffer.from(bytes).toString("base64"),
    message_bytes: bytes.length,
    event_hash: event.e,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 10 * 60_000).toISOString(),
  };
  await getFirestore().collection("groove_preparations").doc(id).create(preparation);
  return preparation;
}

export async function getGrooveStatus(prepareId: string, transactionId: string) {
  const snapshot = await getFirestore().collection("groove_preparations").doc(prepareId).get();
  if (!snapshot.exists) throw new Error("Groove preparation not found.");
  const preparation = snapshot.data() as GroovePreparation;
  if (Date.parse(preparation.expires_at) < Date.now()) {
    return { status: "INVALID", reason: "PREPARATION_EXPIRED" } as const;
  }

  const expectedTransaction = transactionKey(transactionId);
  const response = await fetch(
    `https://testnet.mirrornode.hedera.com/api/v1/topics/${encodeURIComponent(preparation.topic_id)}/messages?limit=100&order=desc`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) throw new Error("Mirror Node is unavailable.");
  const payload = (await response.json()) as { messages?: MirrorMessage[] };
  const transactionMessages = payload.messages?.filter(
    (message) => messageTransactionKey(message) === expectedTransaction,
  ) ?? [];
  if (transactionMessages.length === 0) return { status: "PENDING" } as const;

  const expectedBytes = Buffer.from(preparation.message_base64, "base64");
  const match = transactionMessages.find((message) => {
    const singleMessage = message.chunk_info === null ||
      (message.chunk_info.total === 1 && message.chunk_info.number === 1);
    return message.topic_id === preparation.topic_id &&
      message.payer_account_id === preparation.account_id &&
      singleMessage &&
      Buffer.from(message.message, "base64").equals(expectedBytes);
  });
  if (!match) return { status: "INVALID", reason: "MIRROR_EVIDENCE_MISMATCH" } as const;

  return {
    status: "CONFIRMED",
    prepare_id: preparation.id,
    transaction_id: transactionId,
    topic_id: preparation.topic_id,
    payer_account_id: match.payer_account_id,
    sequence_number: match.sequence_number,
    consensus_timestamp: match.consensus_timestamp,
    message_base64: preparation.message_base64,
    message_bytes: preparation.message_bytes,
    event_hash: preparation.event_hash,
  } as const;
}