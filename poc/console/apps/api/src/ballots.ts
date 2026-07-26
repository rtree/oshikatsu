import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { signRequest } from "@worldcoin/idkit-server";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { decodeWorldArtifact, domainHash, encodeBallotEvent, encodeBallotEventV2, worldArtifactSha256 } from "@oshikatsu/protocol";
import { z } from "zod";
import { getWorldIdEnvironment } from "./config.js";
import { getFirestore } from "./firestore.js";
import { getRoom, requireRoomAction, roomIdSchema } from "./rooms.js";
import { recordUnverifiedBallot } from "./ballot-projection.js";

const accountIdSchema = z.string().regex(/^0\.0\.\d+$/);
const nomineeIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,31}$/);
const proofSchema = z.object({
  protocol_version: z.literal("4.0"), nonce: z.string().min(1), action: z.string().min(1),
  action_description: z.string().min(1).optional(),
  responses: z.array(z.object({ identifier: z.literal("proof_of_human"), signal_hash: z.string().min(1), proof: z.array(z.string().min(1)).length(5), nullifier: z.string().min(1), issuer_schema_id: z.literal(1), expires_at_min: z.number().int() })).min(1),
  user_presence_completed: z.boolean(), environment: z.literal("production"),
});

export const ballotRequestSchema = z.object({
  room_id: roomIdSchema,
  account_id: accountIdSchema,
  nominee_ids: z.tuple([nomineeIdSchema, nomineeIdSchema, nomineeIdSchema]),
}).strict();

export const ballotPrepareSchema = z.object({
  context_token: z.string().min(1), signal: z.string().min(1).max(512), proof: proofSchema,
}).strict();

export const ballotV2ArtifactPrepareSchema = z.object({
  artifact_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  artifact_reference: z.string().url().max(180),
}).strict();

const contextSchema = z.object({
  room_id: roomIdSchema, manifest_hash: z.string().regex(/^[0-9a-f]{64}$/), account_id: accountIdSchema,
  nominee_ids: z.tuple([nomineeIdSchema, nomineeIdSchema, nomineeIdSchema]), signal: z.string().min(1),
  action: z.string().min(1), nonce: z.string().min(1), expires_at: z.number().int(),
});
type BallotContext = z.infer<typeof contextSchema>;

function signContext(context: BallotContext, key: string) {
  const payload = Buffer.from(JSON.stringify(context)).toString("base64url");
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
}

function verifyContext(token: string, key: string) {
  const [payload, supplied, ...extra] = token.split(".");
  if (!payload || !supplied || extra.length) return null;
  const expected = createHmac("sha256", key).update(payload).digest("base64url");
  const left = Buffer.from(supplied); const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try { return contextSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString())); } catch { return null; }
}

function assertNominees(roomWorks: Array<{ id: string }>, nominees: [string, string, string]) {
  if (new Set(nominees).size !== 3 || nominees.some((id) => !roomWorks.some((work) => work.id === id))) {
    throw new Error("Ballot requires three distinct works from this Room.");
  }
}

function getBallotAction(roomId: string) {
  return `oshikatsu-ballot-v1:${roomId}`;
}

export async function createBallotRequest(input: z.infer<typeof ballotRequestSchema>) {
  const room = await getRoom(input.room_id);
  if (!room) throw new Error("Room not found.");
  await requireRoomAction(room.id, "BALLOT_V1");
  if (room.phase !== "LIVE") throw new Error("Room is not live.");
  assertNominees(room.works, input.nominee_ids);
  const world = getWorldIdEnvironment(); const action = getBallotAction(room.id);
  const signature = signRequest({ action, signingKeyHex: world.signingKey, ttl: 300 });
  const intentHash = domainHash("oshikatsu:ballot-intent:v1", { r: room.id, m: room.manifest_hash, n: input.nominee_ids, a: input.account_id });
  const signal = `oshikatsu:ballot:v1:${intentHash}`;
  const context: BallotContext = { room_id: room.id, manifest_hash: room.manifest_hash, account_id: input.account_id, nominee_ids: input.nominee_ids, signal, action, nonce: signature.nonce, expires_at: signature.expiresAt };
  return { app_id: world.appId, action, action_description: `Verify humanity for ballot in ${room.name}`, signal, context_token: signContext(context, world.signingKey), rp_context: { rp_id: world.rpId, nonce: signature.nonce, created_at: signature.createdAt, expires_at: signature.expiresAt, signature: signature.sig } };
}

export async function prepareBallot(input: z.infer<typeof ballotPrepareSchema>) {
  const world = getWorldIdEnvironment(); const context = verifyContext(input.context_token, world.signingKey);
  const room = context ? await getRoom(context.room_id) : null; const response = input.proof.responses[0];
  if (room) await requireRoomAction(room.id, "BALLOT_V1");
  if (!context || !room || room.manifest_hash !== context.manifest_hash || context.expires_at < Math.floor(Date.now() / 1000) || input.signal !== context.signal || input.proof.nonce !== context.nonce || input.proof.action !== context.action || response?.signal_hash !== hashSignal(input.signal)) throw new Error("Ballot proof context mismatch.");
  assertNominees(room.works, context.nominee_ids);
  const verificationResponse = await fetch(`https://developer.world.org/api/v4/verify/${encodeURIComponent(world.rpId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.proof) });
  const verification = await verificationResponse.json() as { success?: boolean; code?: string };
  if (!verificationResponse.ok || verification.success !== true || !response) throw new Error(verification.code ?? "World verification failed.");
  const nullifierCommitment = domainHash("oshikatsu:world-nullifier:v1", { r: room.id, n: response.nullifier });
  const worldEvidenceHash = domainHash("oshikatsu:world-evidence:v1", { p: input.proof.protocol_version, r: room.id, m: room.manifest_hash, n: context.nominee_ids, a: context.account_id, s: response.signal_hash, u: nullifierCommitment });
  const id = `ballot-${randomUUID().replaceAll("-", "")}`;
  const bytes = encodeBallotEvent({ ballotId: id, roomId: room.id, manifestHash: room.manifest_hash, nomineeIds: context.nominee_ids, accountId: context.account_id, worldEvidenceHash });
  const event = JSON.parse(new TextDecoder().decode(bytes)) as { e: string };
  const preparation = { id, room_id: room.id, nominee_ids: context.nominee_ids, topic_id: room.topic_id, account_id: context.account_id, nullifier_commitment: nullifierCommitment, world_evidence_hash: worldEvidenceHash, message_base64: Buffer.from(bytes).toString("base64"), message_bytes: bytes.length, event_hash: event.e, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() };
  await getFirestore().collection("ballot_preparations").doc(id).create(preparation);
  return preparation;
}

function assertCommitFixedGitHubReference(reference: string) {
  const url = new URL(reference);
  const match = /^\/rtree\/oshikatsu\/([0-9a-f]{40})\/a\/([0-9a-f]{64})\.json$/.exec(url.pathname);
  if (url.protocol !== "https:" || url.hostname !== "raw.githubusercontent.com" || !match || url.search || url.hash) {
    throw new Error("Artifact reference must be a commit-fixed GitHub raw URL.");
  }
  return { commit: match[1], pathHash: match[2] };
}

export async function prepareBallotV2FromArtifact(input: z.infer<typeof ballotV2ArtifactPrepareSchema>) {
  const reference = assertCommitFixedGitHubReference(input.artifact_reference);
  if (reference.pathHash !== input.artifact_sha256) throw new Error("Artifact path hash mismatch.");
  const response = await fetch(input.artifact_reference, { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("Artifact is unavailable.");
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > 64 * 1024) throw new Error("Artifact is too large.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 64 * 1024) throw new Error("Artifact is too large.");
  if (worldArtifactSha256(bytes) !== input.artifact_sha256) throw new Error("Artifact digest mismatch.");
  const artifact = decodeWorldArtifact(bytes);
  if (artifact.proof.responses[0].signal_hash.toLowerCase() !== hashSignal(artifact.signal).toLowerCase()) throw new Error("Artifact signal hash mismatch.");
  const room = await getRoom(artifact.room_id);
  if (!room) throw new Error("Room not found.");
  await requireRoomAction(room.id, "BALLOT_V1");
  if (room.phase !== "LIVE" || room.manifest_hash !== artifact.manifest_hash || room.world_action !== artifact.action) throw new Error("Artifact Room binding mismatch.");
  assertNominees(room.works, artifact.nominee_ids);
  const nullifierCommitment = domainHash("oshikatsu:world-nullifier:v1", { r: room.id, n: artifact.proof.responses[0].nullifier });
  const id = `ballot-${input.artifact_sha256.slice(0, 32)}`;
  const ballotBytes = encodeBallotEventV2({ ballotId: id, roomId: room.id, manifestHash: room.manifest_hash, nomineeIds: artifact.nominee_ids, accountId: artifact.account_id, artifactHash: input.artifact_sha256, artifactReference: input.artifact_reference, worldBlockNumber: artifact.anchor.block_number, worldBlockHash: artifact.anchor.block_hash });
  const event = JSON.parse(new TextDecoder().decode(ballotBytes)) as { e: string };
  const preparation = { id, version: 2, room_id: room.id, nominee_ids: artifact.nominee_ids, topic_id: room.topic_id, account_id: artifact.account_id, nullifier_commitment: nullifierCommitment, artifact_sha256: input.artifact_sha256, artifact_reference: input.artifact_reference, world_block_number: artifact.anchor.block_number, world_block_hash: artifact.anchor.block_hash, message_base64: Buffer.from(ballotBytes).toString("base64"), message_bytes: ballotBytes.length, event_hash: event.e, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() };
  const referenceDocument = getFirestore().collection("ballot_preparations").doc(id);
  await getFirestore().runTransaction(async (transaction) => {
    const existing = await transaction.get(referenceDocument);
    if (existing.exists) {
      const data = existing.data() as typeof preparation;
      if (data.artifact_sha256 !== input.artifact_sha256 || data.artifact_reference !== input.artifact_reference) throw new Error("Artifact preparation conflict.");
      return;
    }
    transaction.create(referenceDocument, preparation);
  });
  return (await referenceDocument.get()).data() as typeof preparation;
}

export async function getBallotPreparation(id: string) {
  if (!/^ballot-[0-9a-f]{32}$/.test(id)) throw new Error("Invalid ballot preparation id.");
  const snapshot = await getFirestore().collection("ballot_preparations").doc(id).get();
  if (!snapshot.exists) return null;
  const preparation = snapshot.data() as Record<string, unknown>;
  if (typeof preparation.expires_at !== "string" || Date.parse(preparation.expires_at) < Date.now()) throw new Error("Ballot preparation expired.");
  return preparation;
}

function transactionKey(id: string) { const match = /^(0\.0\.\d+)[@-](\d+)[.-](\d+)$/.exec(decodeURIComponent(id)); if (!match) throw new Error("Invalid Hedera transaction id."); return `${match[1]}-${match[2]}-${match[3]}`; }

export async function getBallotStatus(prepareId: string, transactionId: string) {
  const store = getFirestore(); const snapshot = await store.collection("ballot_preparations").doc(prepareId).get();
  if (!snapshot.exists) throw new Error("Ballot preparation not found."); const preparation = snapshot.data() as Record<string, any>;
  const txResponse = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/transactions/${encodeURIComponent(transactionKey(transactionId))}`);
  if (txResponse.status === 404) return { status: "PENDING" } as const;
  const tx = (await txResponse.json() as any).transactions?.find((item: any) => item.name === "CONSENSUSSUBMITMESSAGE" && item.result === "SUCCESS");
  if (!tx || tx.entity_id !== preparation.topic_id) return { status: "INVALID", reason: "TRANSACTION_MISMATCH" } as const;
  const messageResponse = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/topics/${preparation.topic_id}/messages?timestamp=${tx.consensus_timestamp}`);
  const message = (await messageResponse.json() as any).messages?.[0]; const expected = Buffer.from(preparation.message_base64, "base64");
  if (!message || message.payer_account_id !== preparation.account_id || !Buffer.from(message.message, "base64").equals(expected) || (message.chunk_info && message.chunk_info.total !== 1)) return { status: "INVALID", reason: "MIRROR_EVIDENCE_MISMATCH" } as const;
  try {
    return await recordUnverifiedBallot({
      room_id: preparation.room_id,
      topic_id: preparation.topic_id,
      event_hash: preparation.event_hash,
      payer_account_id: preparation.account_id,
      nominee_ids: preparation.nominee_ids,
      sequence_number: message.sequence_number,
      consensus_timestamp: message.consensus_timestamp,
      event_type: "INITIAL",
      ...(preparation.version === 2 ? { nullifier_commitment: preparation.nullifier_commitment, artifact_sha256: preparation.artifact_sha256, artifact_reference: preparation.artifact_reference, world_block_number: preparation.world_block_number, world_block_hash: preparation.world_block_hash } : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("ALREADY_EXISTS")) {
      return { status: "RECORDED_UNVERIFIED", counted: false, capability_granted: false, event_hash: preparation.event_hash, sequence_number: message.sequence_number, consensus_timestamp: message.consensus_timestamp, payer_account_id: preparation.account_id } as const;
    }
    throw error;
  }
}