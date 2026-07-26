import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeBallotEventV2,
  decodeBallotEvent,
  decodeBallotSealEvent,
  decodeBallotUpdateEvent,
  decodeBallotWithdrawEvent,
  decodeGrooveEvent,
  decodeWorldArtifact,
  domainHash,
  encodeBallotEventV2,
  encodeBallotEvent,
  encodeBallotSealEvent,
  encodeBallotUpdateEvent,
  encodeBallotWithdrawEvent,
  encodeGrooveEvent,
  encodeWorldArtifact,
  MAX_ARTIFACT_REFERENCE_BYTES,
  MAX_EVENT_BYTES,
  worldArtifactSha256,
  type WorldArtifactV1,
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

const worldArtifact: WorldArtifactV1 = {
  schema: "oshikatsu-world-artifact-v1",
  room_id: "lisbon-main",
  manifest_hash: "4".repeat(64),
  nominee_ids: ["level-up", "cadet", "divine"],
  account_id: "0.0.9706029",
  action: "oshikatsu-room:lisbon-main",
  signal: "oshikatsu:ballot:v2:fixture",
  anchor: { block_number: "32841860", block_hash: `0x${"a".repeat(64)}`, block_timestamp: "1785000000" },
  proof: {
    protocol_version: "4.0",
    nonce: "fixture-nonce",
    action: "oshikatsu-room:lisbon-main",
    responses: [{ identifier: "proof_of_human", signal_hash: "fixture-signal-hash", proof: ["1", "2", "3", "4", "5"], nullifier: "fixture-nullifier", issuer_schema_id: 1, expires_at_min: 123456 }],
    user_presence_completed: true,
    environment: "production",
  },
};

test("World artifact canonical bytes and raw SHA-256 are stable", () => {
  const bytes = encodeWorldArtifact(worldArtifact);
  assert.deepEqual(decodeWorldArtifact(bytes), worldArtifact);
  assert.equal(worldArtifactSha256(bytes), "0c59c1bac98b6e55f87d858e5aff6a93ec8bb38694b22176c95bc7c34cc1b34c");
  const reordered = new TextEncoder().encode(JSON.stringify({ room_id: worldArtifact.room_id, ...worldArtifact }));
  assert.throws(() => decodeWorldArtifact(reordered), /not canonical/);
  const unknown = new TextEncoder().encode(new TextDecoder().decode(bytes).replace('"anchor":{', '"anchor":{"unknown":true,'));
  assert.throws(() => decodeWorldArtifact(unknown), /unknown/);
});

test("Ballot v2 commits artifact bytes, immutable reference, and World anchor", () => {
  const input = {
    ballotId: "ballot-0002",
    roomId: "lisbon-main",
    manifestHash: "4".repeat(64),
    nomineeIds: ["level-up", "cadet", "divine"] as [string, string, string],
    accountId: "0.0.9706029",
    artifactHash: worldArtifactSha256(encodeWorldArtifact(worldArtifact)),
    artifactReference: "https://storage.googleapis.com/o/a?generation=1",
    worldBlockNumber: "32841860",
    worldBlockHash: `0x${"a".repeat(64)}`,
  };
  const bytes = encodeBallotEventV2(input);
  const event = decodeBallotEventV2(bytes);
  assert.equal(event.e, "8427df09eb157879bcac9c46c02ca5e9e30ff8f3dc81b9a191d57150bbf24723");
  assert.equal(event.d, input.artifactHash);
  assert.throws(() => decodeBallotEventV2(new TextEncoder().encode(new TextDecoder().decode(bytes).replace(input.artifactHash, "0".repeat(64)))), /hash is invalid/);
});

test("Ballot v2 enforces reference and 900-byte boundaries", () => {
  const baseV2 = {
    ballotId: "b".repeat(64), roomId: "r".repeat(64), manifestHash: "4".repeat(64),
    nomineeIds: ["a".repeat(64), "b".repeat(64), "c".repeat(64)] as [string,string,string],
    accountId: `0.0.${"9".repeat(20)}`, artifactHash: "d".repeat(64),
    worldBlockNumber: "99999999999999999999", worldBlockHash: `0x${"e".repeat(64)}`,
  };
  const reference = `https://x/${"u".repeat(MAX_ARTIFACT_REFERENCE_BYTES - "https://x/".length)}`;
  const bytes = encodeBallotEventV2({ ...baseV2, artifactReference: reference });
  assert.ok(bytes.length <= MAX_EVENT_BYTES, `worst-case Ballot v2 is ${bytes.length} bytes`);
  assert.throws(() => encodeBallotEventV2({ ...baseV2, artifactReference: `${reference}x` }), /180 bytes/);
  assert.throws(() => decodeBallotEventV2(new Uint8Array(MAX_EVENT_BYTES + 1)), /1-900/);
});

const lifecycleBinding = {
  roomId: "lisbon-main",
  manifestHash: "4".repeat(64),
  capabilityEventHash: "a".repeat(64),
  accountId: "0.0.9706029",
};

test("Ballot UPDATE and WITHDRAW codecs bind capability and payer canonically", () => {
  const updateBytes = encodeBallotUpdateEvent({ ...lifecycleBinding, nomineeIds: ["cadet", "divine", "level-up"] });
  const withdrawBytes = encodeBallotWithdrawEvent(lifecycleBinding);
  assert.equal(new TextDecoder().decode(updateBytes), `{"v":1,"t":"u","r":"lisbon-main","m":"${"4".repeat(64)}","c":"${"a".repeat(64)}","a":"0.0.9706029","n":["cadet","divine","level-up"],"e":"7ddc9081a417849d60f6761ca012e32586ad2bec53f0b722675de45a4b6c6d94"}`);
  assert.deepEqual(decodeBallotUpdateEvent(updateBytes), JSON.parse(new TextDecoder().decode(updateBytes)));
  assert.deepEqual(decodeBallotWithdrawEvent(withdrawBytes), JSON.parse(new TextDecoder().decode(withdrawBytes)));
  assert.notEqual(decodeBallotUpdateEvent(updateBytes).e, decodeBallotWithdrawEvent(withdrawBytes).e);
  assert.throws(() => encodeBallotUpdateEvent({ ...lifecycleBinding, accountId: "0.0.2", nomineeIds: ["cadet", "divine", "level-up"] }), /identity binding/);
  const unknown = new TextEncoder().encode(new TextDecoder().decode(withdrawBytes).replace('"e":', '"unknown":true,"e":'));
  assert.throws(() => decodeBallotWithdrawEvent(unknown), /unknown/);
});

test("Ballot SEAL codec commits authority, deadline, cutoff, policy, and result", () => {
  const input = {
    roomId: "lisbon-main",
    manifestHash: "4".repeat(64),
    authorityAccountId: "0.0.42",
    deadline: "1785008000.000000000",
    cutoffSequence: 17,
    policyId: "ordered-borda-3-2-1-v1",
    resultHash: "b".repeat(64),
  };
  const bytes = encodeBallotSealEvent(input);
  assert.deepEqual(decodeBallotSealEvent(bytes), JSON.parse(new TextDecoder().decode(bytes)));
  assert.throws(() => decodeBallotSealEvent(new TextEncoder().encode(new TextDecoder().decode(bytes).replace('"q":17', '"q":18'))), /hash is invalid/);
  assert.throws(() => encodeBallotSealEvent({ ...input, deadline: "1785008000" }), /Hedera timestamp/);
  assert.throws(() => encodeBallotSealEvent({ ...input, cutoffSequence: -1 }), /cutoff/);
});