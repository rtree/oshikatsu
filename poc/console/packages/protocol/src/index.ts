import { createHash } from "node:crypto";

export const MAX_EVENT_BYTES = 900;
export const MAX_SHOUT_BYTES = 600;
export const MAX_SHOUT_CODE_POINTS = 200;

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
  const canonical = encodeGrooveEvent(input);
  if (!Buffer.from(canonical).equals(Buffer.from(bytes))) fail("Event JSON is not canonical.");
  if (event.e !== value.e) fail("Event hash is invalid.");
  return event;
}