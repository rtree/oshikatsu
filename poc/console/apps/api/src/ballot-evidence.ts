import {
  decodeBallotEventV2,
  decodeWorldArtifact,
  worldArtifactSha256,
} from "@oshikatsu/protocol";
import { foldBallotCapabilities, foldBallotVerification } from "./ballot-verification.js";

export type BallotEvidenceRoom = {
  id: string;
  manifest_hash: string;
  topic_id: string;
};

export type BallotEvidenceMirrorRecord = {
  message_bytes: Uint8Array;
  payer_account_id: string;
  topic_id: string;
  sequence_number: number;
  consensus_timestamp: string;
  transaction_id: string;
  chunk_total: number;
};

export type BallotEvidenceReceipt = {
  schema: "oshikatsu-ballot-v2-optimistic-evidence-v1";
  room_id: string;
  manifest_hash: string;
  artifact: { sha256: string; reference: string };
  hedera: {
    payer_account_id: string;
    transaction_id: string;
    topic_id: string;
    sequence_number: number;
    consensus_timestamp: string;
    message_base64: string;
    message_bytes: number;
  };
  world_anchor: { block_number: string; block_hash: string };
  event_hash: string;
  projection: {
    status: "RECORDED_UNVERIFIED";
    counted: false;
    capability_granted: false;
  };
};

type FetchResponse = {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  json(): Promise<unknown>;
};

type FetchLike = (url: string) => Promise<FetchResponse>;

type MirrorTransaction = {
  transaction_id: string;
  consensus_timestamp: string;
  entity_id: string;
  name: string;
  result: string;
};

function object(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function parseTransaction(value: unknown): MirrorTransaction {
  const transaction = object(value, "Mirror transaction evidence is invalid.");
  return {
    transaction_id: String(transaction.transaction_id),
    consensus_timestamp: String(transaction.consensus_timestamp),
    entity_id: String(transaction.entity_id),
    name: String(transaction.name),
    result: String(transaction.result),
  };
}

function successfulTopicTransaction(value: unknown, room: BallotEvidenceRoom) {
  const response = object(value, "Mirror transaction response is invalid.");
  const transactions = Array.isArray(response.transactions) ? response.transactions.map(parseTransaction) : [];
  const matches = transactions.filter((transaction) =>
    transaction.name === "CONSENSUSSUBMITMESSAGE" &&
    transaction.result === "SUCCESS" &&
    transaction.entity_id === room.topic_id,
  );
  if (matches.length !== 1) throw new Error("Mirror transaction correlation is ambiguous or missing.");
  return matches[0]!;
}

function parseMessage(value: unknown, topicId: string, transactionId: string): BallotEvidenceMirrorRecord {
  const message = object(value, "Mirror topic message is invalid.");
  const chunkInfo = message.chunk_info === null || message.chunk_info === undefined
    ? null
    : object(message.chunk_info, "Mirror chunk metadata is invalid.");
  return {
    message_bytes: Buffer.from(String(message.message), "base64"),
    payer_account_id: String(message.payer_account_id),
    topic_id: topicId,
    sequence_number: Number(message.sequence_number),
    consensus_timestamp: String(message.consensus_timestamp),
    transaction_id: transactionId,
    chunk_total: chunkInfo ? Number(chunkInfo.total) : 1,
  };
}

function canonicalTransactionId(value: string) {
  const match = /^(0\.0\.\d+)[@-](\d+)[.-](\d{9})$/.exec(value);
  if (!match) throw new Error("Hedera transaction id is invalid.");
  return `${match[1]}@${match[2]}.${match[3]}`;
}

async function fetchJson(fetcher: FetchLike, url: string, label: string) {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  return response.json();
}

export async function captureSanitizedBallotEvidence(input: {
  room: BallotEvidenceRoom;
  artifact_bytes: Uint8Array;
  transaction_id?: string;
  sequence_number?: number;
  mirror_base_url?: string;
}, fetcher: FetchLike = fetch): Promise<BallotEvidenceReceipt> {
  const transactionSelector = input.transaction_id !== undefined;
  const sequenceSelector = input.sequence_number !== undefined;
  if (transactionSelector === sequenceSelector) throw new Error("Provide exactly one transaction id or sequence number.");
  if (!/^0\.0\.\d+$/.test(input.room.topic_id) ||
      !/^[a-z0-9][a-z0-9-]{2,63}$/.test(input.room.id) ||
      !/^[0-9a-f]{64}$/.test(input.room.manifest_hash)) {
    throw new Error("Room evidence input is invalid.");
  }
  const baseUrl = (input.mirror_base_url ?? "https://testnet.mirrornode.hedera.com").replace(/\/$/, "");
  let transactionId: string;
  let messageValue: unknown;
  if (input.transaction_id !== undefined) {
    transactionId = canonicalTransactionId(input.transaction_id);
    const transactionKey = transactionId.replace("@", "-").replace(/\.(?=\d{9}$)/, "-");
    const transaction = successfulTopicTransaction(
      await fetchJson(fetcher, `${baseUrl}/api/v1/transactions/${transactionKey}`, "Mirror transaction fetch"),
      input.room,
    );
    messageValue = await fetchJson(
      fetcher,
      `${baseUrl}/api/v1/topics/${input.room.topic_id}/messages?timestamp=${transaction.consensus_timestamp}`,
      "Mirror topic message fetch",
    );
    const response = object(messageValue, "Mirror topic message response is invalid.");
    if (!Array.isArray(response.messages) || response.messages.length !== 1) throw new Error("Mirror topic message correlation is ambiguous or missing.");
    messageValue = response.messages[0];
  } else {
    if (!Number.isSafeInteger(input.sequence_number) || input.sequence_number! < 1) throw new Error("Hedera sequence number is invalid.");
    messageValue = await fetchJson(
      fetcher,
      `${baseUrl}/api/v1/topics/${input.room.topic_id}/messages/${input.sequence_number}`,
      "Mirror topic message fetch",
    );
    const message = object(messageValue, "Mirror topic message is invalid.");
    if (Number(message.sequence_number) !== input.sequence_number) throw new Error("Mirror topic sequence does not match.");
    const transaction = successfulTopicTransaction(
      await fetchJson(
        fetcher,
        `${baseUrl}/api/v1/transactions?timestamp=${message.consensus_timestamp}&transactiontype=CONSENSUSSUBMITMESSAGE`,
        "Mirror transaction correlation fetch",
      ),
      input.room,
    );
    transactionId = canonicalTransactionId(transaction.transaction_id);
    if (transaction.consensus_timestamp !== String(message.consensus_timestamp)) throw new Error("Mirror transaction timestamp does not match topic message.");
  }

  const mirror = parseMessage(messageValue, input.room.topic_id, transactionId);
  const artifactReference = decodeBallotEventV2(mirror.message_bytes).u;
  return createSanitizedBallotEvidence({
    room: input.room,
    artifact_bytes: input.artifact_bytes,
    artifact_reference: artifactReference,
    mirror,
  });
}

export function createSanitizedBallotEvidence(input: {
  room: BallotEvidenceRoom;
  artifact_bytes: Uint8Array;
  artifact_reference: string;
  mirror: BallotEvidenceMirrorRecord;
}): BallotEvidenceReceipt {
  const { room, mirror } = input;
  const event = decodeBallotEventV2(mirror.message_bytes);
  const artifact = decodeWorldArtifact(input.artifact_bytes);
  const artifactSha256 = worldArtifactSha256(input.artifact_bytes);
  if (!/^0\.0\.\d+$/.test(mirror.payer_account_id) ||
      !/^0\.0\.\d+$/.test(mirror.topic_id) ||
      !Number.isSafeInteger(mirror.sequence_number) || mirror.sequence_number < 1 ||
      !/^\d+\.\d{9}$/.test(mirror.consensus_timestamp) ||
      !/^0\.0\.\d+@\d+\.\d{9}$/.test(mirror.transaction_id) ||
      mirror.chunk_total !== 1) {
    throw new Error("Mirror Ballot evidence metadata is invalid.");
  }
  if (room.id !== event.r || room.id !== artifact.room_id ||
      room.manifest_hash !== event.m || room.manifest_hash !== artifact.manifest_hash ||
      room.topic_id !== mirror.topic_id ||
      artifactSha256 !== event.d || input.artifact_reference !== event.u ||
      artifact.account_id !== event.a || event.a !== mirror.payer_account_id ||
      artifact.anchor.block_number !== event.b || artifact.anchor.block_hash !== event.h ||
      artifact.nominee_ids.some((nomineeId, index) => nomineeId !== event.n[index])) {
    throw new Error("Ballot evidence binding is invalid.");
  }

  const verification = foldBallotVerification([]);
  const capability = foldBallotCapabilities([{
    room_id: room.id,
    event_hash: event.e,
    payer_account_id: mirror.payer_account_id,
    nullifier_commitment: null,
    sequence_number: mirror.sequence_number,
    event_type: "INITIAL",
    verification,
  }])[0];
  if (verification.status !== "RECORDED_UNVERIFIED" || verification.counted || capability?.capability_granted) {
    throw new Error("Optimistic Ballot evidence invariant failed.");
  }

  return {
    schema: "oshikatsu-ballot-v2-optimistic-evidence-v1",
    room_id: room.id,
    manifest_hash: room.manifest_hash,
    artifact: { sha256: artifactSha256, reference: input.artifact_reference },
    hedera: {
      payer_account_id: mirror.payer_account_id,
      transaction_id: mirror.transaction_id,
      topic_id: mirror.topic_id,
      sequence_number: mirror.sequence_number,
      consensus_timestamp: mirror.consensus_timestamp,
      message_base64: Buffer.from(mirror.message_bytes).toString("base64"),
      message_bytes: mirror.message_bytes.length,
    },
    world_anchor: {
      block_number: artifact.anchor.block_number,
      block_hash: artifact.anchor.block_hash,
    },
    event_hash: event.e,
    projection: {
      status: "RECORDED_UNVERIFIED",
      counted: false,
      capability_granted: false,
    },
  };
}