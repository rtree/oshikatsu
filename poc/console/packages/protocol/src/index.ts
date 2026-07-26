import { createHash } from "node:crypto";

export const MAX_EVENT_BYTES = 900;
export const MAX_SHOUT_BYTES = 600;
export const MAX_SHOUT_CODE_POINTS = 200;
export const MAX_ARTIFACT_REFERENCE_BYTES = 180;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const ACCOUNT_PATTERN = /^0\.0\.\d+$/;

export const reactionIds = [
  "peak",
  "cried",
  "precious",
  "next",
  "week",
  "dead",
  "melted",
  "wrecked",
  "losing",
] as const;

export type ReactionId = (typeof reactionIds)[number];

export type GrooveEventInput = {
  roomId: string;
  eventId: string;
  manifestHash: string;
  workId: string;
  accountId: string;
  reactionId: ReactionId;
  shout?: string;
};

export type GrooveEvent = {
  v: 1;
  t: "r" | "s";
  r: string;
  i: string;
  m: string;
  n: string;
  a: string;
  s: ReactionId;
  c?: string;
  e: string;
};

export type BallotEventInput = {
  ballotId: string;
  roomId: string;
  manifestHash: string;
  nomineeIds: [string, string, string];
  accountId: string;
  worldEvidenceHash: string;
};

export type BallotEvent = {
  v: 1;
  t: "b";
  r: string;
  i: string;
  m: string;
  n: [string, string, string];
  a: string;
  w: string;
  e: string;
};

export type WorldArtifactV1 = {
  schema: "oshikatsu-world-artifact-v1";
  room_id: string;
  manifest_hash: string;
  nominee_ids: [string, string, string];
  account_id: string;
  action: string;
  signal: string;
  anchor: { block_number: string; block_hash: string; block_timestamp: string };
  proof: {
    protocol_version: "4.0";
    nonce: string;
    action: string;
    responses: [{ identifier: "proof_of_human"; signal_hash: string; proof: [string, string, string, string, string]; nullifier: string; issuer_schema_id: 1; expires_at_min: number }];
    user_presence_completed: boolean;
    environment: "production";
  };
};

export type BallotEventV2Input = {
  ballotId: string;
  roomId: string;
  manifestHash: string;
  nomineeIds: [string, string, string];
  accountId: string;
  artifactHash: string;
  artifactReference: string;
  worldBlockNumber: string;
  worldBlockHash: string;
};

export type BallotEventV2 = {
  v: 2; t: "b"; r: string; i: string; m: string; n: [string, string, string]; a: string;
  d: string; u: string; b: string; h: string; e: string;
};

export type BallotUpdateEventInput = {
  roomId: string;
  manifestHash: string;
  capabilityEventHash: string;
  accountId: string;
  nomineeIds: [string, string, string];
};

export type BallotWithdrawEventInput = Omit<BallotUpdateEventInput, "nomineeIds">;

export type BallotSealEventInput = {
  roomId: string;
  manifestHash: string;
  authorityAccountId: string;
  deadline: string;
  cutoffSequence: number;
  policyId: string;
  resultHash: string;
};

export type BallotUpdateEvent = {
  v: 1; t: "u"; r: string; m: string; c: string; a: string;
  n: [string, string, string]; e: string;
};

export type BallotWithdrawEvent = {
  v: 1; t: "w"; r: string; m: string; c: string; a: string; e: string;
};

export type BallotSealEvent = {
  v: 1; t: "z"; r: string; m: string; a: string; d: string;
  q: number; p: string; x: string; e: string;
};

function fail(message: string): never {
  throw new Error(message);
}

function assertKeys(value: Record<string, unknown>, expected: string[]) {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
    fail("Event contains unknown or missing fields.");
  }
}

function eventWithoutHash(input: GrooveEventInput) {
  const base = {
    v: 1 as const,
    t: input.shout === undefined ? ("r" as const) : ("s" as const),
    r: input.roomId,
    i: input.eventId,
    m: input.manifestHash,
    n: input.workId,
    a: input.accountId,
    s: input.reactionId,
  };
  return input.shout === undefined ? base : { ...base, c: input.shout };
}

function canonicalJson(value: unknown) {
  return JSON.stringify(value);
}

export function domainHash(domain: string, value: unknown) {
  return createHash("sha256")
    .update(domain, "utf8")
    .update(Buffer.from([0]))
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

function validateInput(input: GrooveEventInput) {
  if (!ID_PATTERN.test(input.roomId) || !ID_PATTERN.test(input.eventId) || !ID_PATTERN.test(input.workId)) {
    fail("Room, event, and work ids must be canonical lowercase ids.");
  }
  if (!HASH_PATTERN.test(input.manifestHash)) fail("Manifest hash must be lowercase SHA-256 hex.");
  if (!ACCOUNT_PATTERN.test(input.accountId)) fail("Account id must be a Hedera account id.");
  if (!reactionIds.includes(input.reactionId)) fail("Reaction id is not supported.");
  if (input.shout !== undefined) {
    if ([...input.shout].length > MAX_SHOUT_CODE_POINTS) fail("Shout exceeds 200 Unicode code points.");
    if (encoder.encode(input.shout).length > MAX_SHOUT_BYTES) fail("Shout exceeds 600 UTF-8 bytes.");
  }
}

export function createGrooveEvent(input: GrooveEventInput): GrooveEvent {
  validateInput(input);
  const body = eventWithoutHash(input);
  const domain = input.shout === undefined ? "oshikatsu:reaction:v1" : "oshikatsu:shout:v1";
  return { ...body, e: domainHash(domain, body) };
}

export function encodeGrooveEvent(input: GrooveEventInput) {
  const event = createGrooveEvent(input);
  const bytes = encoder.encode(canonicalJson(event));
  if (bytes.length > MAX_EVENT_BYTES) fail(`Event is ${bytes.length} bytes; maximum is 900.`);
  return bytes;
}

export function decodeGrooveEvent(bytes: Uint8Array): GrooveEvent {
  if (bytes.length === 0 || bytes.length > MAX_EVENT_BYTES) fail("Event must contain 1-900 UTF-8 bytes.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
  } catch {
    return fail("Event is not strict UTF-8 JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("Event must be an object.");
  const value = parsed as Record<string, unknown>;
  const type = value.t;
  if (type !== "r" && type !== "s") fail("Event type is unsupported.");
  assertKeys(value, type === "s" ? ["v", "t", "r", "i", "m", "n", "a", "s", "c", "e"] : ["v", "t", "r", "i", "m", "n", "a", "s", "e"]);
  const input: GrooveEventInput = {
    roomId: String(value.r),
    eventId: String(value.i),
    manifestHash: String(value.m),
    workId: String(value.n),
    accountId: String(value.a),
    reactionId: String(value.s) as ReactionId,
    ...(type === "s" ? { shout: String(value.c) } : {}),
  };
  if (value.v !== 1 || typeof value.e !== "string") fail("Event version or hash is invalid.");
  const event = createGrooveEvent(input);
  if (event.e !== value.e) fail("Event hash is invalid.");
  const canonical = encodeGrooveEvent(input);
  if (!Buffer.from(canonical).equals(Buffer.from(bytes))) fail("Event JSON is not canonical.");
  return event;
}

function validateBallotInput(input: BallotEventInput) {
  if (!ID_PATTERN.test(input.roomId) || !ID_PATTERN.test(input.ballotId)) {
    fail("Room and ballot ids must be canonical lowercase ids.");
  }
  if (!HASH_PATTERN.test(input.manifestHash) || !HASH_PATTERN.test(input.worldEvidenceHash)) {
    fail("Manifest and World evidence hashes must be lowercase SHA-256 hex.");
  }
  if (!ACCOUNT_PATTERN.test(input.accountId)) fail("Account id must be a Hedera account id.");
  if (input.nomineeIds.some((id) => !ID_PATTERN.test(id)) || new Set(input.nomineeIds).size !== 3) {
    fail("Ballot requires three distinct canonical nominee ids.");
  }
}

export function createBallotEvent(input: BallotEventInput): BallotEvent {
  validateBallotInput(input);
  const body = {
    v: 1 as const,
    t: "b" as const,
    r: input.roomId,
    i: input.ballotId,
    m: input.manifestHash,
    n: input.nomineeIds,
    a: input.accountId,
    w: input.worldEvidenceHash,
  };
  return { ...body, e: domainHash("oshikatsu:ballot:v1", body) };
}

export function encodeBallotEvent(input: BallotEventInput) {
  const bytes = encoder.encode(canonicalJson(createBallotEvent(input)));
  if (bytes.length > MAX_EVENT_BYTES) fail(`Event is ${bytes.length} bytes; maximum is 900.`);
  return bytes;
}

export function decodeBallotEvent(bytes: Uint8Array): BallotEvent {
  if (bytes.length === 0 || bytes.length > MAX_EVENT_BYTES) fail("Event must contain 1-900 UTF-8 bytes.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
  } catch {
    return fail("Event is not strict UTF-8 JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("Event must be an object.");
  const value = parsed as Record<string, unknown>;
  assertKeys(value, ["v", "t", "r", "i", "m", "n", "a", "w", "e"]);
  if (value.v !== 1 || value.t !== "b" || !Array.isArray(value.n) || value.n.length !== 3 || typeof value.e !== "string") {
    fail("Ballot event shape is invalid.");
  }
  const input: BallotEventInput = {
    roomId: String(value.r),
    ballotId: String(value.i),
    manifestHash: String(value.m),
    nomineeIds: value.n.map(String) as [string, string, string],
    accountId: String(value.a),
    worldEvidenceHash: String(value.w),
  };
  const event = createBallotEvent(input);
  if (event.e !== value.e) fail("Event hash is invalid.");
  if (!Buffer.from(encodeBallotEvent(input)).equals(Buffer.from(bytes))) fail("Event JSON is not canonical.");
  return event;
}

function validateWorldArtifact(input: WorldArtifactV1) {
  assertKeys(input as unknown as Record<string, unknown>, ["schema", "room_id", "manifest_hash", "nominee_ids", "account_id", "action", "signal", "anchor", "proof"]);
  assertKeys(input.anchor as unknown as Record<string, unknown>, ["block_number", "block_hash", "block_timestamp"]);
  assertKeys(input.proof as unknown as Record<string, unknown>, ["protocol_version", "nonce", "action", "responses", "user_presence_completed", "environment"]);
  if (input.proof.responses.length !== 1) fail("World artifact requires exactly one proof response.");
  assertKeys(input.proof.responses[0] as unknown as Record<string, unknown>, ["identifier", "signal_hash", "proof", "nullifier", "issuer_schema_id", "expires_at_min"]);
  if (input.schema !== "oshikatsu-world-artifact-v1" || input.proof.protocol_version !== "4.0" || input.proof.environment !== "production" || input.proof.responses[0].identifier !== "proof_of_human" || input.proof.responses[0].issuer_schema_id !== 1 || input.proof.responses[0].proof.length !== 5) fail("World artifact proof shape is invalid.");
  if (!ID_PATTERN.test(input.room_id) || !HASH_PATTERN.test(input.manifest_hash) || !ACCOUNT_PATTERN.test(input.account_id)) fail("World artifact binding is invalid.");
  if (input.nominee_ids.some((id) => !ID_PATTERN.test(id)) || new Set(input.nominee_ids).size !== 3) fail("World artifact requires three distinct nominees.");
  if (!/^(0|[1-9]\d*)$/.test(input.anchor.block_number) || !/^0x[0-9a-f]{64}$/.test(input.anchor.block_hash) || !/^(0|[1-9]\d*)$/.test(input.anchor.block_timestamp)) fail("World anchor is invalid.");
  if (input.action !== input.proof.action) fail("World artifact action mismatch.");
}

export function encodeWorldArtifact(input: WorldArtifactV1) {
  validateWorldArtifact(input);
  const response = input.proof.responses[0];
  return encoder.encode(canonicalJson({
    schema: input.schema,
    room_id: input.room_id,
    manifest_hash: input.manifest_hash,
    nominee_ids: input.nominee_ids,
    account_id: input.account_id,
    action: input.action,
    signal: input.signal,
    anchor: { block_number: input.anchor.block_number, block_hash: input.anchor.block_hash, block_timestamp: input.anchor.block_timestamp },
    proof: {
      protocol_version: input.proof.protocol_version,
      nonce: input.proof.nonce,
      action: input.proof.action,
      responses: [{ identifier: response.identifier, signal_hash: response.signal_hash, proof: response.proof, nullifier: response.nullifier, issuer_schema_id: response.issuer_schema_id, expires_at_min: response.expires_at_min }],
      user_presence_completed: input.proof.user_presence_completed,
      environment: input.proof.environment,
    },
  }));
}

export function decodeWorldArtifact(bytes: Uint8Array): WorldArtifactV1 {
  let value: unknown;
  try { value = JSON.parse(decoder.decode(bytes)); } catch { return fail("World artifact is not strict UTF-8 JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("World artifact must be an object.");
  const artifact = value as WorldArtifactV1;
  validateWorldArtifact(artifact);
  if (!Buffer.from(encodeWorldArtifact(artifact)).equals(Buffer.from(bytes))) fail("World artifact JSON is not canonical.");
  return artifact;
}

export function worldArtifactSha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateBallotV2Input(input: BallotEventV2Input) {
  if (!ID_PATTERN.test(input.roomId) || !ID_PATTERN.test(input.ballotId) || !ACCOUNT_PATTERN.test(input.accountId)) fail("Ballot v2 identity binding is invalid.");
  if (![input.manifestHash, input.artifactHash].every((hash) => HASH_PATTERN.test(hash))) fail("Ballot v2 SHA-256 is invalid.");
  if (input.nomineeIds.some((id) => !ID_PATTERN.test(id)) || new Set(input.nomineeIds).size !== 3) fail("Ballot v2 requires three distinct nominees.");
  if (encoder.encode(input.artifactReference).length > MAX_ARTIFACT_REFERENCE_BYTES || !/^https:\/\//.test(input.artifactReference)) fail("Artifact reference must be an HTTPS URL of at most 180 bytes.");
  if (!/^(0|[1-9]\d*)$/.test(input.worldBlockNumber) || !/^0x[0-9a-f]{64}$/.test(input.worldBlockHash)) fail("Ballot v2 World anchor is invalid.");
}

export function createBallotEventV2(input: BallotEventV2Input): BallotEventV2 {
  validateBallotV2Input(input);
  const body = { v: 2 as const, t: "b" as const, r: input.roomId, i: input.ballotId, m: input.manifestHash, n: input.nomineeIds, a: input.accountId, d: input.artifactHash, u: input.artifactReference, b: input.worldBlockNumber, h: input.worldBlockHash };
  return { ...body, e: domainHash("oshikatsu:ballot:v2", body) };
}

export function encodeBallotEventV2(input: BallotEventV2Input) {
  const bytes = encoder.encode(canonicalJson(createBallotEventV2(input)));
  if (bytes.length > MAX_EVENT_BYTES) fail(`Event is ${bytes.length} bytes; maximum is 900.`);
  return bytes;
}

export function decodeBallotEventV2(bytes: Uint8Array): BallotEventV2 {
  if (bytes.length === 0 || bytes.length > MAX_EVENT_BYTES) fail("Event must contain 1-900 UTF-8 bytes.");
  let value: unknown;
  try { value = JSON.parse(decoder.decode(bytes)); } catch { return fail("Event is not strict UTF-8 JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Event must be an object.");
  const event = value as Record<string, unknown>;
  assertKeys(event, ["v", "t", "r", "i", "m", "n", "a", "d", "u", "b", "h", "e"]);
  if (event.v !== 2 || event.t !== "b" || !Array.isArray(event.n) || event.n.length !== 3 || typeof event.e !== "string") fail("Ballot v2 shape is invalid.");
  const input: BallotEventV2Input = { roomId: String(event.r), ballotId: String(event.i), manifestHash: String(event.m), nomineeIds: event.n.map(String) as [string,string,string], accountId: String(event.a), artifactHash: String(event.d), artifactReference: String(event.u), worldBlockNumber: String(event.b), worldBlockHash: String(event.h) };
  const canonical = createBallotEventV2(input);
  if (canonical.e !== event.e) fail("Event hash is invalid.");
  if (!Buffer.from(encodeBallotEventV2(input)).equals(Buffer.from(bytes))) fail("Event JSON is not canonical.");
  return canonical;
}

function validateLifecycleBinding(input: BallotWithdrawEventInput) {
  if (!ID_PATTERN.test(input.roomId) || !ACCOUNT_PATTERN.test(input.accountId)) fail("Ballot lifecycle identity binding is invalid.");
  if (!HASH_PATTERN.test(input.manifestHash) || !HASH_PATTERN.test(input.capabilityEventHash)) fail("Ballot lifecycle hash binding is invalid.");
}

function validateLifecycleNominees(nomineeIds: [string, string, string]) {
  if (nomineeIds.some((id) => !ID_PATTERN.test(id)) || new Set(nomineeIds).size !== 3) fail("Ballot update requires three distinct nominees.");
}

export function createBallotUpdateEvent(input: BallotUpdateEventInput): BallotUpdateEvent {
  validateLifecycleBinding(input);
  validateLifecycleNominees(input.nomineeIds);
  const body = { v: 1 as const, t: "u" as const, r: input.roomId, m: input.manifestHash, c: input.capabilityEventHash, a: input.accountId, n: input.nomineeIds };
  return { ...body, e: domainHash("oshikatsu:ballot-update:v1", body) };
}

export function encodeBallotUpdateEvent(input: BallotUpdateEventInput) {
  const bytes = encoder.encode(canonicalJson(createBallotUpdateEvent(input)));
  if (bytes.length > MAX_EVENT_BYTES) fail(`Event is ${bytes.length} bytes; maximum is 900.`);
  return bytes;
}

export function decodeBallotUpdateEvent(bytes: Uint8Array): BallotUpdateEvent {
  const value = decodeLifecycleJson(bytes);
  assertKeys(value, ["v", "t", "r", "m", "c", "a", "n", "e"]);
  if (value.v !== 1 || value.t !== "u" || !Array.isArray(value.n) || value.n.length !== 3 || typeof value.e !== "string") fail("Ballot update shape is invalid.");
  const input: BallotUpdateEventInput = { roomId: String(value.r), manifestHash: String(value.m), capabilityEventHash: String(value.c), accountId: String(value.a), nomineeIds: value.n.map(String) as [string, string, string] };
  const canonical = createBallotUpdateEvent(input);
  assertCanonicalLifecycle(bytes, canonical, encodeBallotUpdateEvent(input));
  return canonical;
}

export function createBallotWithdrawEvent(input: BallotWithdrawEventInput): BallotWithdrawEvent {
  validateLifecycleBinding(input);
  const body = { v: 1 as const, t: "w" as const, r: input.roomId, m: input.manifestHash, c: input.capabilityEventHash, a: input.accountId };
  return { ...body, e: domainHash("oshikatsu:ballot-withdraw:v1", body) };
}

export function encodeBallotWithdrawEvent(input: BallotWithdrawEventInput) {
  const bytes = encoder.encode(canonicalJson(createBallotWithdrawEvent(input)));
  if (bytes.length > MAX_EVENT_BYTES) fail(`Event is ${bytes.length} bytes; maximum is 900.`);
  return bytes;
}

export function decodeBallotWithdrawEvent(bytes: Uint8Array): BallotWithdrawEvent {
  const value = decodeLifecycleJson(bytes);
  assertKeys(value, ["v", "t", "r", "m", "c", "a", "e"]);
  if (value.v !== 1 || value.t !== "w" || typeof value.e !== "string") fail("Ballot withdraw shape is invalid.");
  const input: BallotWithdrawEventInput = { roomId: String(value.r), manifestHash: String(value.m), capabilityEventHash: String(value.c), accountId: String(value.a) };
  const canonical = createBallotWithdrawEvent(input);
  assertCanonicalLifecycle(bytes, canonical, encodeBallotWithdrawEvent(input));
  return canonical;
}

export function createBallotSealEvent(input: BallotSealEventInput): BallotSealEvent {
  if (!ID_PATTERN.test(input.roomId) || !ID_PATTERN.test(input.policyId) || !ACCOUNT_PATTERN.test(input.authorityAccountId)) fail("Ballot SEAL identity binding is invalid.");
  if (!HASH_PATTERN.test(input.manifestHash) || !HASH_PATTERN.test(input.resultHash)) fail("Ballot SEAL hash binding is invalid.");
  if (!/^(0|[1-9]\d*)\.\d{9}$/.test(input.deadline)) fail("Ballot SEAL deadline must be a Hedera timestamp.");
  if (!Number.isSafeInteger(input.cutoffSequence) || input.cutoffSequence < 0) fail("Ballot SEAL cutoff sequence is invalid.");
  const body = { v: 1 as const, t: "z" as const, r: input.roomId, m: input.manifestHash, a: input.authorityAccountId, d: input.deadline, q: input.cutoffSequence, p: input.policyId, x: input.resultHash };
  return { ...body, e: domainHash("oshikatsu:ballot-seal:v1", body) };
}

export function encodeBallotSealEvent(input: BallotSealEventInput) {
  const bytes = encoder.encode(canonicalJson(createBallotSealEvent(input)));
  if (bytes.length > MAX_EVENT_BYTES) fail(`Event is ${bytes.length} bytes; maximum is 900.`);
  return bytes;
}

export function decodeBallotSealEvent(bytes: Uint8Array): BallotSealEvent {
  const value = decodeLifecycleJson(bytes);
  assertKeys(value, ["v", "t", "r", "m", "a", "d", "q", "p", "x", "e"]);
  if (value.v !== 1 || value.t !== "z" || typeof value.e !== "string") fail("Ballot SEAL shape is invalid.");
  const input: BallotSealEventInput = { roomId: String(value.r), manifestHash: String(value.m), authorityAccountId: String(value.a), deadline: String(value.d), cutoffSequence: Number(value.q), policyId: String(value.p), resultHash: String(value.x) };
  const canonical = createBallotSealEvent(input);
  assertCanonicalLifecycle(bytes, canonical, encodeBallotSealEvent(input));
  return canonical;
}

function decodeLifecycleJson(bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > MAX_EVENT_BYTES) fail("Event must contain 1-900 UTF-8 bytes.");
  let value: unknown;
  try { value = JSON.parse(decoder.decode(bytes)); } catch { return fail("Event is not strict UTF-8 JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Event must be an object.");
  return value as Record<string, unknown>;
}

function assertCanonicalLifecycle(bytes: Uint8Array, canonical: { e: string }, encoded: Uint8Array) {
  const value = JSON.parse(decoder.decode(bytes)) as { e?: unknown };
  if (canonical.e !== value.e) fail("Event hash is invalid.");
  if (!Buffer.from(encoded).equals(Buffer.from(bytes))) fail("Event JSON is not canonical.");
}