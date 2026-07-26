import { createHash, randomUUID } from "node:crypto";
import { decodeGrooveEvent, encodeGrooveEvent, reactionIds } from "@oshikatsu/protocol";
import { z } from "zod";
import { getFirestore } from "./firestore.js";
import { getRoom, isDemoRoom, requireActiveRoom, roomIdSchema } from "./rooms.js";

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

export type ConfirmedShout = {
  status: "CONFIRMED";
  prepare_id: string;
  room_id: string;
  work_id: string;
  transaction_id: string;
  topic_id: string;
  payer_account_id: string;
  sequence_number: number;
  consensus_timestamp: string;
  message_base64: string;
  message_bytes: number;
  event_hash: string;
  window_status?: "IN_WINDOW" | "LATE";
  projection_state?: "CURRENT" | "LATE";
};

function claimId(roomId: string, accountId: string) {
  return createHash("sha256").update(`${roomId}\0${accountId}`).digest("hex");
}

type GrooveWorldGrant = {
  room_id: string;
  manifest_hash: string;
  account_id: string;
  nullifier_commitment: string;
  verified_at: string;
};

export function demoWorldGateAllows(input: {
  demo_room: boolean;
  confirmed_claim: boolean;
  grant?: Pick<GrooveWorldGrant, "room_id" | "manifest_hash" | "account_id">;
  room_id: string;
  manifest_hash: string;
  account_id: string;
}) {
  if (!input.demo_room || input.confirmed_claim) return true;
  return input.grant?.room_id === input.room_id && input.grant.manifest_hash === input.manifest_hash && input.grant.account_id === input.account_id;
}

export async function recordGrooveWorldGrant(roomId: string, manifestHash: string, accountId: string, nullifier: string) {
  const store = getFirestore();
  const grantReference = store.collection("groove_world_grants").doc(claimId(roomId, accountId));
  const nullifierCommitment = createHash("sha256").update(`oshikatsu:groove-world-nullifier:v1\0${roomId}\0${nullifier}`).digest("hex");
  const nullifierReference = store.collection("groove_world_nullifiers").doc(nullifierCommitment);
  const grant: GrooveWorldGrant = { room_id: roomId, manifest_hash: manifestHash, account_id: accountId, nullifier_commitment: nullifierCommitment, verified_at: new Date().toISOString() };
  await store.runTransaction(async (transaction) => {
    const existing = await transaction.get(nullifierReference);
    if (existing.exists && (existing.data() as { account_id?: string }).account_id !== accountId) throw new Error("WORLD_NULLIFIER_ALREADY_BOUND");
    transaction.set(nullifierReference, { room_id: roomId, account_id: accountId, verified_at: grant.verified_at }, { merge: false });
    transaction.set(grantReference, grant, { merge: false });
  });
  return grant;
}

async function requireDemoWorldGrant(roomId: string, manifestHash: string, accountId: string) {
  const demoRoom = await isDemoRoom(roomId);
  if (!demoRoom) return;
  const store = getFirestore();
  const key = claimId(roomId, accountId);
  const [claim, grantSnapshot] = await Promise.all([
    store.collection("groove_shout_claims").doc(key).get(),
    store.collection("groove_world_grants").doc(key).get(),
  ]);
  const grant = grantSnapshot.data() as GrooveWorldGrant | undefined;
  if (!demoWorldGateAllows({ demo_room: demoRoom, confirmed_claim: claim.exists, ...(grant ? { grant } : {}), room_id: roomId, manifest_hash: manifestHash, account_id: accountId })) throw new Error("WORLD_PROOF_REQUIRED");
}

function laterShout(left: ConfirmedShout, right: ConfirmedShout) {
  if (left.sequence_number !== right.sequence_number) return left.sequence_number > right.sequence_number ? left : right;
  if (left.consensus_timestamp !== right.consensus_timestamp) return left.consensus_timestamp > right.consensus_timestamp ? left : right;
  return left.event_hash >= right.event_hash ? left : right;
}

function isoNanoseconds(value: string) {
  return BigInt(Date.parse(value)) * 1_000_000n;
}

function consensusNanoseconds(value: string) {
  const match = /^(\d+)\.(\d{1,9})$/.exec(value);
  const seconds = match?.[1];
  const fractional = match?.[2];
  if (!seconds || !fractional) return null;
  return BigInt(seconds) * 1_000_000_000n + BigInt(fractional.padEnd(9, "0"));
}

export function grooveWindowStatus(consensusTimestamp: string, opensAt: string, deadline: string): "IN_WINDOW" | "LATE" {
  const consensus = consensusNanoseconds(consensusTimestamp);
  if (consensus === null) return "LATE";
  return consensus >= isoNanoseconds(opensAt) && consensus <= isoNanoseconds(deadline) ? "IN_WINDOW" : "LATE";
}

function foldCurrentShouts(events: ConfirmedShout[]) {
  const claims = new Map<string, ConfirmedShout>();
  for (const event of events) {
    const key = `${event.room_id}\0${event.payer_account_id}`;
    const current = claims.get(key);
    claims.set(key, current ? laterShout(current, event) : event);
  }
  return [...claims.values()].sort((left, right) => left.sequence_number - right.sequence_number);
}

export function rankRoomWorks(roomId: string, workIds: string[], events: ConfirmedShout[]) {
  const counts = new Map(workIds.map((id) => [id, 0]));
  for (const event of foldCurrentShouts(events.filter((candidate) => candidate.room_id === roomId && candidate.projection_state !== "LATE"))) {
    if (counts.has(event.work_id)) counts.set(event.work_id, (counts.get(event.work_id) ?? 0) + 1);
  }
  const ordered = workIds.map((workId, manifestIndex) => ({ work_id: workId, shout_count: counts.get(workId) ?? 0, manifestIndex }))
    .sort((left, right) => right.shout_count - left.shout_count || left.manifestIndex - right.manifestIndex);
  let currentRank = 1;
  return ordered.map((entry, index) => {
    if (index > 0 && entry.shout_count !== ordered[index - 1]?.shout_count) currentRank = index + 1;
    return {
      rank: currentRank,
      work_id: entry.work_id,
      shout_count: entry.shout_count,
      tied: ordered.some((candidate) => candidate.work_id !== entry.work_id && candidate.shout_count === entry.shout_count),
    };
  });
}

function transactionKey(transactionId: string) {
  const decoded = decodeURIComponent(transactionId).trim();
  const atMatch = /^(0\.0\.\d+)@(\d+)\.(\d+)$/.exec(decoded);
  if (atMatch) return `${atMatch[1]}-${atMatch[2]}-${atMatch[3]}`;
  const dashMatch = /^(0\.0\.\d+)-(\d+)-(\d+)$/.exec(decoded);
  if (dashMatch) return `${dashMatch[1]}-${dashMatch[2]}-${dashMatch[3]}`;
  throw new Error("Invalid Hedera transaction id.");
}

export function isConsensusWithinPreparation(
  preparation: Pick<GroovePreparation, "created_at" | "expires_at">,
  consensusTimestamp: string,
) {
  const match = /^(\d+)\.(\d{1,9})$/.exec(consensusTimestamp);
  if (!match) return false;
  const [, seconds, fractional] = match;
  if (!seconds || !fractional) return false;
  const consensusNanoseconds = BigInt(seconds) * 1_000_000_000n + BigInt(fractional.padEnd(9, "0"));
  const createdNanoseconds = BigInt(Date.parse(preparation.created_at)) * 1_000_000n;
  const expiresNanoseconds = BigInt(Date.parse(preparation.expires_at)) * 1_000_000n;
  return consensusNanoseconds >= createdNanoseconds && consensusNanoseconds <= expiresNanoseconds;
}

export async function prepareGroove(input: z.infer<typeof groovePrepareSchema>) {
  const room = await getRoom(input.room_id);
  if (!room) throw new Error("Room not found.");
  await requireActiveRoom(room.id);
  const demoRoom = await isDemoRoom(room.id);
  if (room.phase !== "LIVE" && !(demoRoom && room.phase === "CLOSED")) throw new Error("Room is not live.");
  if (!room.works.some((work) => work.id === input.work_id)) throw new Error("Work is not in this Room.");
  if (input.shout === undefined) throw new Error("A Shout is required for the demo vote.");
  await requireDemoWorldGrant(room.id, room.manifest_hash, input.account_id);

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

  const expectedTransaction = transactionKey(transactionId);
  const transactionResponse = await fetch(
    `https://testnet.mirrornode.hedera.com/api/v1/transactions/${encodeURIComponent(expectedTransaction)}`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) },
  );
  if (transactionResponse.status === 404) return { status: "PENDING" } as const;
  if (!transactionResponse.ok) throw new Error("Mirror Node is unavailable.");
  const transactionPayload = (await transactionResponse.json()) as {
    transactions?: Array<{ consensus_timestamp: string; entity_id: string; name: string; result: string }>;
  };
  const transaction = transactionPayload.transactions?.find(
    (candidate) => candidate.name === "CONSENSUSSUBMITMESSAGE" && candidate.result === "SUCCESS",
  );
  if (!transaction) return { status: "INVALID", reason: "TRANSACTION_NOT_SUCCESSFUL" } as const;
  if (transaction.entity_id !== preparation.topic_id) {
    return { status: "INVALID", reason: "TRANSACTION_TOPIC_MISMATCH" } as const;
  }
  if (!isConsensusWithinPreparation(preparation, transaction.consensus_timestamp)) {
    return { status: "INVALID", reason: "TRANSACTION_OUTSIDE_PREPARATION_WINDOW" } as const;
  }

  const messageResponse = await fetch(
    `https://testnet.mirrornode.hedera.com/api/v1/topics/${encodeURIComponent(preparation.topic_id)}/messages?timestamp=${encodeURIComponent(transaction.consensus_timestamp)}`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) },
  );
  if (!messageResponse.ok) throw new Error("Mirror Node message lookup is unavailable.");
  const payload = (await messageResponse.json()) as { messages?: MirrorMessage[] };
  const transactionMessages = payload.messages ?? [];
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

  const decoded = decodeGrooveEvent(expectedBytes);
  if (decoded.t !== "s" || decoded.r !== preparation.room_id || decoded.n !== preparation.work_id || decoded.a !== preparation.account_id) {
    return { status: "INVALID", reason: "CANONICAL_EVENT_MISMATCH" } as const;
  }
  const room = await getRoom(preparation.room_id);
  if (!room) return { status: "INVALID", reason: "ROOM_NOT_FOUND" } as const;
  const windowStatus = grooveWindowStatus(match.consensus_timestamp, room.opens_at, room.deadline);
  const confirmed: ConfirmedShout = {
    status: "CONFIRMED",
    prepare_id: preparation.id,
    room_id: preparation.room_id,
    work_id: preparation.work_id,
    transaction_id: transactionId,
    topic_id: preparation.topic_id,
    payer_account_id: match.payer_account_id,
    sequence_number: match.sequence_number,
    consensus_timestamp: match.consensus_timestamp,
    message_base64: preparation.message_base64,
    message_bytes: preparation.message_bytes,
    event_hash: preparation.event_hash,
    window_status: windowStatus,
    projection_state: windowStatus === "LATE" ? "LATE" : "CURRENT",
  };
  const store = getFirestore();
  const evidenceReference = store.collection("groove_evidence").doc(`${preparation.topic_id}-${match.sequence_number}`);
  const claimReference = store.collection("groove_shout_claims").doc(claimId(preparation.room_id, preparation.account_id));
  await store.runTransaction(async (firestoreTransaction) => {
    const existing = await firestoreTransaction.get(claimReference);
    const current = existing.exists ? existing.data() as ConfirmedShout : null;
    firestoreTransaction.set(evidenceReference, confirmed, { merge: false });
    firestoreTransaction.set(store.collection("groove_events").doc(preparation.id), confirmed, { merge: false });
    if (windowStatus === "IN_WINDOW" && (!current || laterShout(confirmed, current) === confirmed)) firestoreTransaction.set(claimReference, confirmed);
  });
  return confirmed;
}

export async function listConfirmedGroove(roomId: string, opensAt: string, deadline: string) {
  const store = getFirestore();
  const [claims, legacy] = await Promise.all([
    store.collection("groove_shout_claims").where("room_id", "==", roomId).limit(100).get(),
    store.collection("groove_events").where("room_id", "==", roomId).limit(100).get(),
  ]);
  const byHash = new Map<string, ConfirmedShout>();
  for (const event of [...claims.docs, ...legacy.docs].map((document) => document.data() as ConfirmedShout)) byHash.set(event.event_hash, event);
  const events = [...byHash.values()].map((event) => {
    const status = grooveWindowStatus(event.consensus_timestamp, opensAt, deadline);
    return { ...event, window_status: status, projection_state: status === "LATE" ? "LATE" as const : "CURRENT" as const };
  });
  const current = foldCurrentShouts(events.filter((event) => event.projection_state === "CURRENT"));
  const late = events.filter((event) => event.projection_state === "LATE").sort((left, right) => left.sequence_number - right.sequence_number);
  return [...current, ...late];
}