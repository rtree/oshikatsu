import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeBallotEvent,
  decodeGrooveEvent,
  domainHash,
  encodeBallotEvent,
  encodeGrooveEvent,
  MAX_EVENT_BYTES,
} from "../src/index.js";

const base = {
  roomId: "lisbon-main",
  eventId: "event-0001",
  manifestHash: "4".repeat(64),
  workId: "level-up",
  accountId: "0.0.9706029",
  reactionId: "peak" as const,
};

test("golden Reaction bytes and domain-separated hash are stable", () => {
  const bytes = encodeGrooveEvent(base);
  const text = new TextDecoder().decode(bytes);
  assert.equal(text, '{"v":1,"t":"r","r":"lisbon-main","i":"event-0001","m":"4444444444444444444444444444444444444444444444444444444444444444","n":"level-up","a":"0.0.9706029","s":"peak","e":"4487c4d29b9899d125412ff298ddf88a9ddcefad9de3e1226399a9a7c1bfbad3"}');
  assert.deepEqual(decodeGrooveEvent(bytes), JSON.parse(text));
  assert.notEqual(domainHash("oshikatsu:reaction:v1", {}), domainHash("oshikatsu:shout:v1", {}));
});

test("unknown and noncanonical inputs are rejected", () => {
  const canonical = new TextDecoder().decode(encodeGrooveEvent(base));
  assert.throws(() => decodeGrooveEvent(new TextEncoder().encode(canonical.replace('"e":', '"x":true,"e":'))), /unknown/);
  assert.throws(() => decodeGrooveEvent(new TextEncoder().encode(` ${canonical}`)), /canonical/);
  assert.throws(() => decodeGrooveEvent(new TextEncoder().encode(canonical.replace(/"e":"[0-9a-f]+"/, `"e":"${"0".repeat(64)}"`))), /hash is invalid/);
});

test("Shout limits and the 900-byte event boundary are enforced", () => {
  assert.doesNotThrow(() => encodeGrooveEvent({ ...base, shout: "推".repeat(200) }));
  assert.throws(() => encodeGrooveEvent({ ...base, shout: "推".repeat(201) }), /200 Unicode/);
  assert.throws(() => decodeGrooveEvent(new Uint8Array(MAX_EVENT_BYTES + 1)), /1-900/);
});

test("Ballot binds ordered Top 3, payer, Room manifest, and World evidence", () => {
  const input = {
    ballotId: "ballot-0001",
    roomId: "lisbon-main",
    manifestHash: "4".repeat(64),
    nomineeIds: ["level-up", "cadet", "divine"] as [string, string, string],
    accountId: "0.0.9706029",
    worldEvidenceHash: "a".repeat(64),
  };
  const bytes = encodeBallotEvent(input);
  assert.deepEqual(decodeBallotEvent(bytes), JSON.parse(new TextDecoder().decode(bytes)));
  assert.notEqual(
    JSON.parse(new TextDecoder().decode(bytes)).e,
    JSON.parse(new TextDecoder().decode(encodeBallotEvent({ ...input, nomineeIds: ["cadet", "level-up", "divine"] }))).e,
  );
  assert.throws(() => encodeBallotEvent({ ...input, nomineeIds: ["level-up", "level-up", "divine"] }), /three distinct/);
  const text = new TextDecoder().decode(bytes);
  assert.throws(() => decodeBallotEvent(new TextEncoder().encode(text.replace('"e":', '"x":true,"e":'))), /unknown/);
});