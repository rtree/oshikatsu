import assert from "node:assert/strict";
import test from "node:test";
import { createBallotSealEvent, createBallotUpdateEvent, createBallotWithdrawEvent } from "@oshikatsu/protocol";
import {
  replayBallotLifecycle,
  sealedBallotResultHash,
  sealedRankingPolicy,
  type BallotLifecycleRecord,
  type BallotReplayManifest,
  type GrantedBallotCapability,
} from "../src/ballot-replay.js";

const manifest: BallotReplayManifest = {
  room_id: "room-a",
  manifest_hash: "4".repeat(64),
  opens_at: "2026-07-26T00:00:00.000Z",
  deadline: "2026-07-26T01:00:00.000Z",
  nominee_ids: ["alpha", "beta", "gamma"],
  authority_account_id: "0.0.42",
};

const capability: GrantedBallotCapability = {
  room_id: manifest.room_id,
  manifest_hash: manifest.manifest_hash,
  capability_event_hash: "a".repeat(64),
  payer_account_id: "0.0.1",
  nominee_ids: ["alpha", "beta", "gamma"],
  sequence_number: 10,
  consensus_timestamp: "1785024000.000000000",
};

function update(sequenceNumber: number, nomineeIds: [string, string, string], overrides: Partial<BallotLifecycleRecord> = {}): BallotLifecycleRecord {
  return {
    event: createBallotUpdateEvent({ roomId: manifest.room_id, manifestHash: manifest.manifest_hash, capabilityEventHash: capability.capability_event_hash, accountId: capability.payer_account_id, nomineeIds }),
    payer_account_id: capability.payer_account_id,
    sequence_number: sequenceNumber,
    consensus_timestamp: `178502${sequenceNumber === 13 ? "7600.000000000" : "5000.000000000"}`,
    chunk_count: 1,
    ...overrides,
  };
}

function withdraw(sequenceNumber: number): BallotLifecycleRecord {
  return {
    event: createBallotWithdrawEvent({ roomId: manifest.room_id, manifestHash: manifest.manifest_hash, capabilityEventHash: capability.capability_event_hash, accountId: capability.payer_account_id }),
    payer_account_id: capability.payer_account_id,
    sequence_number: sequenceNumber,
    consensus_timestamp: "1785026000.000000000",
    chunk_count: 1,
  };
}

test("HCS-order replay applies update, withdraw, and re-update independent of ingestion order", () => {
  const replay = replayBallotLifecycle({ capabilities: [capability], manifest, lifecycle: [update(13, ["gamma", "alpha", "beta"]), withdraw(12), update(11, ["beta", "alpha", "gamma"])] });
  assert.deepEqual(replay.current_intents, [{ capability_event_hash: capability.capability_event_hash, nominee_ids: ["gamma", "alpha", "beta"] }]);
  assert.deepEqual(replay.ranking.map(({ nominee_id, points }) => [nominee_id, points]), [["gamma", 3], ["alpha", 2], ["beta", 1]]);
  assert.deepEqual(replay.rejections, []);
});

test("window endpoints are inclusive and post-deadline events are rejected", () => {
  const atOpen = update(11, ["beta", "alpha", "gamma"], { consensus_timestamp: "1785024000.000000000" });
  const atDeadline = update(12, ["gamma", "beta", "alpha"], { consensus_timestamp: "1785027600.000000000" });
  const late = update(13, ["alpha", "gamma", "beta"], { consensus_timestamp: "1785027600.000000001" });
  const replay = replayBallotLifecycle({ capabilities: [capability], manifest, lifecycle: [late, atDeadline, atOpen] });
  assert.deepEqual(replay.current_intents[0]?.nominee_ids, ["gamma", "beta", "alpha"]);
  assert.deepEqual(replay.rejections.map(({ sequence_number, reason }) => [sequence_number, reason]), [[13, "OUTSIDE_WINDOW"]]);
});

test("payer and capability bindings fail closed without changing current intent", () => {
  const wrongMirror = update(11, ["gamma", "beta", "alpha"], { payer_account_id: "0.0.2" });
  const wrongCapability = update(12, ["beta", "gamma", "alpha"]);
  wrongCapability.event = createBallotUpdateEvent({ roomId: manifest.room_id, manifestHash: manifest.manifest_hash, capabilityEventHash: "b".repeat(64), accountId: capability.payer_account_id, nomineeIds: ["beta", "gamma", "alpha"] });
  const replay = replayBallotLifecycle({ capabilities: [capability], manifest, lifecycle: [wrongCapability, wrongMirror] });
  assert.deepEqual(replay.current_intents[0]?.nominee_ids, capability.nominee_ids);
  assert.deepEqual(replay.rejections.map(({ reason }) => reason), ["MIRROR_PAYER_MISMATCH", "CAPABILITY_NOT_GRANTED"]);
});

test("wrong Room, manifest, and out-of-window capability grants cannot authorize updates", () => {
  const lifecycle = [update(11, ["gamma", "beta", "alpha"] )];
  for (const invalidCapability of [
    { ...capability, room_id: "room-b" },
    { ...capability, manifest_hash: "b".repeat(64) },
    { ...capability, consensus_timestamp: "1785023999.999999999" },
  ]) {
    const replay = replayBallotLifecycle({ capabilities: [invalidCapability], manifest, lifecycle });
    assert.deepEqual(replay.current_intents, []);
    assert.equal(replay.rejections[0]?.reason, "CAPABILITY_NOT_GRANTED");
  }
});

test("a lifecycle event cannot use a capability granted later in HCS order", () => {
  const futureCapability = { ...capability, sequence_number: 20, consensus_timestamp: "1785026000.000000000" };
  const replay = replayBallotLifecycle({ capabilities: [futureCapability], manifest, lifecycle: [update(11, ["gamma", "beta", "alpha"])] });
  assert.deepEqual(replay.current_intents[0]?.nominee_ids, capability.nominee_ids);
  assert.equal(replay.rejections[0]?.reason, "CAPABILITY_NOT_YET_GRANTED");
});

test("duplicate HCS sequences and multiple SEALs fail closed", () => {
  const first = update(11, ["beta", "alpha", "gamma"]);
  const duplicate = update(11, ["gamma", "beta", "alpha"]);
  const unsealed = replayBallotLifecycle({ capabilities: [capability], manifest, lifecycle: [first, duplicate] });
  assert.deepEqual(unsealed.current_intents[0]?.nominee_ids, first.event.t === "u" ? first.event.n : null);
  assert.equal(unsealed.rejections[0]?.reason, "DUPLICATE_SEQUENCE");
  const sealInput = { roomId: manifest.room_id, manifestHash: manifest.manifest_hash, authorityAccountId: manifest.authority_account_id, deadline: manifest.deadline, cutoffSequence: 11, policyId: sealedRankingPolicy.policy_id, resultHash: unsealed.result_hash };
  const seal = { event: createBallotSealEvent(sealInput), payer_account_id: manifest.authority_account_id, sequence_number: 20, consensus_timestamp: "1785028000.000000000", chunk_count: 1 };
  assert.equal(replayBallotLifecycle({ capabilities: [capability], manifest, lifecycle: [first], seals: [seal, { ...seal, sequence_number: 21 }] }).seal?.reason, "MULTIPLE_SEALS");
});

test("3-2-1 result hash and authority SEAL validate deterministically at the cutoff", () => {
  const lifecycle = [update(11, ["gamma", "alpha", "beta"]), withdraw(12), update(13, ["beta", "gamma", "alpha"], { consensus_timestamp: "1785027000.000000000" })];
  const unsealed = replayBallotLifecycle({ capabilities: [capability], manifest, lifecycle });
  assert.equal(unsealed.result_hash, sealedBallotResultHash(manifest, 13, unsealed.ranking));
  const event = createBallotSealEvent({ roomId: manifest.room_id, manifestHash: manifest.manifest_hash, authorityAccountId: manifest.authority_account_id, deadline: manifest.deadline, cutoffSequence: 13, policyId: sealedRankingPolicy.policy_id, resultHash: unsealed.result_hash });
  const seal = { event, payer_account_id: manifest.authority_account_id, sequence_number: 20, consensus_timestamp: "1785028000.000000000", chunk_count: 1 };
  const first = replayBallotLifecycle({ capabilities: [capability], manifest, lifecycle, seals: [seal] });
  const second = replayBallotLifecycle({ capabilities: [capability], manifest, lifecycle: [...lifecycle].reverse(), seals: [seal] });
  assert.deepEqual(first, second);
  assert.deepEqual(first.seal, { event_hash: event.e, sequence_number: 20, valid: true });
});

test("SEAL rejects wrong authority, cutoff, result hash, and pre-deadline consensus", () => {
  const lifecycle = [update(11, ["gamma", "alpha", "beta"] )];
  const result = replayBallotLifecycle({ capabilities: [capability], manifest, lifecycle });
  const base = { roomId: manifest.room_id, manifestHash: manifest.manifest_hash, authorityAccountId: manifest.authority_account_id, deadline: manifest.deadline, cutoffSequence: 11, policyId: sealedRankingPolicy.policy_id, resultHash: result.result_hash };
  const cases = [
    { event: createBallotSealEvent(base), payer_account_id: "0.0.99", sequence_number: 20, consensus_timestamp: "1785028000.000000000", chunk_count: 1, reason: "SEAL_AUTHORITY_INVALID" },
    { event: createBallotSealEvent({ ...base, cutoffSequence: 10 }), payer_account_id: manifest.authority_account_id, sequence_number: 20, consensus_timestamp: "1785028000.000000000", chunk_count: 1, reason: "SEAL_CUTOFF_INVALID" },
    { event: createBallotSealEvent({ ...base, resultHash: "f".repeat(64) }), payer_account_id: manifest.authority_account_id, sequence_number: 20, consensus_timestamp: "1785028000.000000000", chunk_count: 1, reason: "SEAL_RESULT_HASH_INVALID" },
    { event: createBallotSealEvent(base), payer_account_id: manifest.authority_account_id, sequence_number: 20, consensus_timestamp: "1785027599.999999999", chunk_count: 1, reason: "SEAL_DEADLINE_INVALID" },
  ];
  for (const { reason, ...seal } of cases) {
    const replay = replayBallotLifecycle({ capabilities: [capability], manifest, lifecycle, seals: [seal] });
    assert.equal(replay.seal?.reason, reason);
    assert.equal(replay.cutoff_sequence, 11);
    assert.equal(replay.result_hash, result.result_hash);
  }
});