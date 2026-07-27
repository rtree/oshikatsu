import { randomUUID } from "node:crypto";
import {
  decodeBallotUpdateEvent,
  decodeBallotWithdrawEvent,
  encodeBallotUpdateEvent,
  encodeBallotWithdrawEvent,
  type BallotUpdateEvent,
  type BallotWithdrawEvent,
} from "@oshikatsu/protocol";
import { z } from "zod";
import { getFirestore } from "./firestore.js";
import { projectBallotRankings } from "./ballot-projection.js";
import { replayBallotLifecycle, type BallotLifecycleRecord, type GrantedBallotCapability } from "./ballot-replay.js";
import { getRoom, requireActiveRoom, roomIdSchema } from "./rooms.js";

const accountIdSchema = z.string().regex(/^0\.0\.\d+$/);
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const nomineeIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,31}$/);

export const ballotLifecyclePrepareSchema = z.discriminatedUnion("event_type", [
  z.object({ event_type: z.literal("UPDATE"), room_id: roomIdSchema, capability_event_hash: hashSchema, account_id: accountIdSchema, nominee_ids: z.tuple([nomineeIdSchema, nomineeIdSchema, nomineeIdSchema]) }).strict(),
  z.object({ event_type: z.literal("WITHDRAW"), room_id: roomIdSchema, capability_event_hash: hashSchema, account_id: accountIdSchema }).strict(),
]);

type LifecyclePreparation = {
  id: string;
  event_type: "UPDATE" | "WITHDRAW";
  room_id: string;
  manifest_hash: string;
  capability_event_hash: string;
  topic_id: string;
  account_id: string;
  nominee_ids?: [string, string, string];
  message_base64: string;
  message_bytes: number;
  event_hash: string;
  created_at: string;
  expires_at: string;
};

type MirrorMessage = {
  message: string;
  payer_account_id: string;
  sequence_number: number;
  consensus_timestamp: string;
  topic_id: string;
  chunk_info: null | { total: number; number: number; initial_transaction_id?: { account_id: string; transaction_valid_start: string; nonce: number; scheduled: boolean } };
};

function transactionKey(value: string) {
  const match = /^(0\.0\.\d+)[@-](\d+)[.-](\d+)$/.exec(decodeURIComponent(value));
  if (!match) throw new Error("Invalid Hedera transaction id.");
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function assertNominees(roomWorks: Array<{ id: string }>, nominees: [string, string, string]) {
  if (new Set(nominees).size !== 3 || nominees.some((id) => !roomWorks.some((work) => work.id === id))) throw new Error("Ballot update requires three distinct Room nominees.");
}

export async function prepareBallotLifecycle(input: z.infer<typeof ballotLifecyclePrepareSchema>) {
  const room = await getRoom(input.room_id);
  if (!room) throw new Error("ROOM_NOT_FOUND");
  await requireActiveRoom(room.id);
  if (room.phase !== "LIVE") throw new Error("ROOM_NOT_LIVE");
  const projection = await projectBallotRankings(room.id, room.works.map((work) => work.id));
  const capability = projection.capabilities.find((item) => item.event_hash === input.capability_event_hash);
  if (!capability || !capability.capability_granted || capability.status !== "CAPABILITY_GRANTED") throw new Error("CAPABILITY_NOT_GRANTED");
  if (capability.payer_account_id !== input.account_id) throw new Error("CAPABILITY_PAYER_MISMATCH");
  if (input.event_type === "UPDATE") assertNominees(room.works, input.nominee_ids);
  const bytes = input.event_type === "UPDATE"
    ? encodeBallotUpdateEvent({ roomId: room.id, manifestHash: room.manifest_hash, capabilityEventHash: capability.event_hash, accountId: input.account_id, nomineeIds: input.nominee_ids })
    : encodeBallotWithdrawEvent({ roomId: room.id, manifestHash: room.manifest_hash, capabilityEventHash: capability.event_hash, accountId: input.account_id });
  const event = input.event_type === "UPDATE" ? decodeBallotUpdateEvent(bytes) : decodeBallotWithdrawEvent(bytes);
  const now = Date.now();
  const preparation: LifecyclePreparation = {
    id: `lifecycle-${randomUUID().replaceAll("-", "")}`,
    event_type: input.event_type,
    room_id: room.id,
    manifest_hash: room.manifest_hash,
    capability_event_hash: capability.event_hash,
    topic_id: room.topic_id,
    account_id: input.account_id,
    ...(input.event_type === "UPDATE" ? { nominee_ids: input.nominee_ids } : {}),
    message_base64: Buffer.from(bytes).toString("base64"),
    message_bytes: bytes.length,
    event_hash: event.e,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 10 * 60_000).toISOString(),
  };
  await getFirestore().collection("ballot_lifecycle_preparations").doc(preparation.id).create(preparation);
  return preparation;
}

function canonicalTransactionId(value: string) {
  const match = /^(0\.0\.\d+)[@-](\d+)[.-](\d+)$/.exec(decodeURIComponent(value));
  if (!match) throw new Error("Invalid Hedera transaction id.");
  return `${match[1]}@${match[2]}.${match[3]}`;
}

function messageTransactionId(message: MirrorMessage) {
  const initial = message.chunk_info?.initial_transaction_id;
  return initial ? `${initial.account_id}@${initial.transaction_valid_start}` : null;
}

function isoToHcsTimestamp(value: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error("Invalid Room opening timestamp.");
  return `${Math.floor(milliseconds / 1000)}.${String(milliseconds % 1000).padStart(3, "0")}000000`;
}

function hcsNanoseconds(value: string) {
  const match = /^(\d+)\.(\d{1,9})$/.exec(value);
  if (!match?.[1] || !match[2]) throw new Error("Invalid HCS consensus timestamp.");
  return BigInt(match[1]) * 1_000_000_000n + BigInt(match[2].padEnd(9, "0"));
}

function isoNanoseconds(value: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error("Invalid preparation timestamp.");
  return BigInt(milliseconds) * 1_000_000n;
}

async function fetchMirrorLifecycle(roomId: string, topicId: string, opensAt: string) {
  const records: BallotLifecycleRecord[] = [];
  let url: string | null = `https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages?limit=100&order=asc&timestamp=gte:${isoToHcsTimestamp(opensAt)}`;
  for (let page = 0; url && page < 100; page += 1) {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error("Mirror lifecycle history fetch failed.");
    const payload = await response.json() as { messages?: MirrorMessage[]; links?: { next?: string | null } };
    for (const message of payload.messages ?? []) {
      const bytes = Buffer.from(message.message, "base64");
      let event: BallotUpdateEvent | BallotWithdrawEvent | null = null;
      try { event = decodeBallotUpdateEvent(bytes); } catch {
        try { event = decodeBallotWithdrawEvent(bytes); } catch { event = null; }
      }
      if (!event || event.r !== roomId) continue;
      records.push({ event, payer_account_id: message.payer_account_id, sequence_number: message.sequence_number, consensus_timestamp: message.consensus_timestamp, chunk_count: message.chunk_info?.total ?? 1 });
    }
    const next = payload.links?.next;
    url = next ? new URL(next, "https://testnet.mirrornode.hedera.com").toString() : null;
    if (page === 99 && url) throw new Error("BALLOT_LIFECYCLE_HISTORY_LIMIT_EXCEEDED");
  }
  return records;
}

async function lifecycleReplay(roomId: string) {
  const store = getFirestore();
  const room = await getRoom(roomId);
  if (!room) throw new Error("ROOM_NOT_FOUND");
  const [ballots, lifecycleRecords] = await Promise.all([
    store.collection("ballot_records").where("room_id", "==", roomId).limit(501).get(),
    fetchMirrorLifecycle(roomId, room.topic_id, room.opens_at),
  ]);
  if (ballots.size > 500) throw new Error("BALLOT_REPLAY_LIMIT_EXCEEDED");
  const projection = await projectBallotRankings(room.id, room.works.map((work) => work.id));
  const grantedByHash = new Map(projection.capabilities.filter((item) => item.capability_granted).map((item) => [item.event_hash, item]));
  const capabilities: GrantedBallotCapability[] = ballots.docs.flatMap((document) => {
    const value = document.data() as Record<string, unknown>;
    const granted = grantedByHash.get(String(value.event_hash));
    const nominees = value.nominee_ids;
    if (!granted || !Array.isArray(nominees) || nominees.length !== 3) return [];
    return [{ room_id: room.id, manifest_hash: room.manifest_hash, capability_event_hash: granted.event_hash, payer_account_id: granted.payer_account_id, nominee_ids: nominees.map(String) as [string, string, string], sequence_number: granted.sequence_number, consensus_timestamp: String(value.consensus_timestamp) }];
  });
  return replayBallotLifecycle({
    manifest: { room_id: room.id, manifest_hash: room.manifest_hash, opens_at: room.opens_at, deadline: room.deadline, nominee_ids: room.works.map((work) => work.id), authority_account_id: "0.0.0" },
    capabilities,
    lifecycle: lifecycleRecords,
  });
}

export async function getBallotLifecycleStatus(prepareId: string, transactionId: string) {
  if (!/^lifecycle-[0-9a-f]{32}$/.test(prepareId)) throw new Error("Invalid lifecycle preparation id.");
  const store = getFirestore();
  const preparationSnapshot = await store.collection("ballot_lifecycle_preparations").doc(prepareId).get();
  if (!preparationSnapshot.exists) throw new Error("Lifecycle preparation not found.");
  const preparation = preparationSnapshot.data() as LifecyclePreparation;
  const suppliedTransactionId = canonicalTransactionId(transactionId);
  const transactionResponse = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/transactions/${transactionKey(transactionId)}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (transactionResponse.status === 404) return { status: "PENDING" as const };
  if (!transactionResponse.ok) throw new Error("Mirror transaction lookup failed.");
  const transactions = (await transactionResponse.json() as { transactions?: Array<{ consensus_timestamp: string; entity_id: string; name: string; result: string }> }).transactions ?? [];
  const matches = transactions.filter((item) => item.name === "CONSENSUSSUBMITMESSAGE" && item.result === "SUCCESS" && item.entity_id === preparation.topic_id);
  if (matches.length !== 1) return { status: "INVALID" as const, reason: "TRANSACTION_MISMATCH" };
  const consensusTimestamp = matches[0]!.consensus_timestamp;
  const consensusTime = hcsNanoseconds(consensusTimestamp);
  if (consensusTime < isoNanoseconds(preparation.created_at) || consensusTime > isoNanoseconds(preparation.expires_at)) return { status: "INVALID" as const, reason: "TRANSACTION_OUTSIDE_PREPARATION_WINDOW" };
  const messageResponse = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/topics/${preparation.topic_id}/messages?timestamp=${consensusTimestamp}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!messageResponse.ok) throw new Error("Mirror message lookup failed.");
  const messages = (await messageResponse.json() as { messages?: MirrorMessage[] }).messages ?? [];
  const expected = Buffer.from(preparation.message_base64, "base64");
  const matching = messages.filter((message) => message.consensus_timestamp === consensusTimestamp && message.topic_id === preparation.topic_id && message.payer_account_id === preparation.account_id && (message.chunk_info === null || (message.chunk_info.total === 1 && message.chunk_info.number === 1)) && (messageTransactionId(message) === null || messageTransactionId(message) === suppliedTransactionId) && Buffer.from(message.message, "base64").equals(expected));
  if (matching.length !== 1) return { status: "INVALID" as const, reason: "MIRROR_EVIDENCE_MISMATCH" };
  const mirror = matching[0]!;
  const event: BallotUpdateEvent | BallotWithdrawEvent = preparation.event_type === "UPDATE" ? decodeBallotUpdateEvent(expected) : decodeBallotWithdrawEvent(expected);
  const record: BallotLifecycleRecord & { room_id: string; transaction_id: string } = { event, room_id: preparation.room_id, payer_account_id: mirror.payer_account_id, transaction_id: suppliedTransactionId, sequence_number: mirror.sequence_number, consensus_timestamp: mirror.consensus_timestamp, chunk_count: 1 };
  const occurrenceId = `${preparation.topic_id.replaceAll(".", "-")}-${mirror.sequence_number}`;
  const recordReference = store.collection("ballot_lifecycle_records").doc(occurrenceId);
  await store.runTransaction(async (transaction) => {
    const existing = await transaction.get(recordReference);
    if (existing.exists) {
      if (JSON.stringify(existing.data()) !== JSON.stringify(record)) throw new Error("LIFECYCLE_RECORD_CONFLICT");
      return;
    }
    transaction.create(recordReference, record);
  });
  const replay = await lifecycleReplay(preparation.room_id);
  const rejection = replay.rejections.find((item) => item.event_hash === event.e && item.sequence_number === mirror.sequence_number);
  const intent = replay.current_intents.find((item) => item.capability_event_hash === preparation.capability_event_hash);
  return { status: "RECORDED" as const, accepted: !rejection, ...(rejection ? { rejection_reason: rejection.reason } : {}), event_hash: event.e, sequence_number: mirror.sequence_number, consensus_timestamp: mirror.consensus_timestamp, payer_account_id: mirror.payer_account_id, current_intent: intent?.nominee_ids ?? null, cutoff_sequence: replay.cutoff_sequence, result_hash: replay.result_hash };
}