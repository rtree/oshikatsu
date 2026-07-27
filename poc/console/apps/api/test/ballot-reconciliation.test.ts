import assert from "node:assert/strict";
import test from "node:test";
import type { RebuiltCapabilityRecord } from "../src/ballot-capability-rebuild.js";
import { assertStoredBallotBinding } from "../src/ballot-reconciliation.js";

const eventHash = "a".repeat(64);
const manifestHash = "b".repeat(64);
const artifactSha256 = "c".repeat(64);
const rebuilt: RebuiltCapabilityRecord = {
  room_id: "room-a",
  topic_id: "0.0.123",
  event_hash: eventHash,
  payer_account_id: "0.0.1",
  nullifier_commitment: "d".repeat(64),
  sequence_number: 11,
  consensus_timestamp: "100.000000001",
  event_type: "INITIAL",
  verification: { status: "VERIFIED", reasons: [], provisional_counted: true, counted: true, capability_eligible: true },
  manifest_hash: manifestHash,
  nominee_ids: ["work-a", "work-b", "work-c"],
  artifact_sha256: artifactSha256,
  artifact_reference: `https://raw.githubusercontent.com/rtree/oshikatsu/${"e".repeat(40)}/a/${artifactSha256}.json`,
  world_block_number: "123",
  world_block_hash: `0x${"f".repeat(64)}`,
};
const stored = {
  room_id: rebuilt.room_id,
  topic_id: rebuilt.topic_id!,
  event_hash: rebuilt.event_hash,
  payer_account_id: rebuilt.payer_account_id,
  nominee_ids: rebuilt.nominee_ids,
  sequence_number: rebuilt.sequence_number,
  consensus_timestamp: rebuilt.consensus_timestamp,
  event_type: "INITIAL" as const,
  artifact_sha256: rebuilt.artifact_sha256,
  artifact_reference: rebuilt.artifact_reference,
  world_block_number: rebuilt.world_block_number,
  world_block_hash: rebuilt.world_block_hash,
};

test("reconciliation requires every immutable stored field to match public evidence", () => {
  assert.doesNotThrow(() => assertStoredBallotBinding(stored, rebuilt));
  for (const changed of [
    { ...stored, topic_id: "0.0.999" },
    { ...stored, event_hash: "9".repeat(64) },
    { ...stored, payer_account_id: "0.0.2" },
    { ...stored, nominee_ids: ["work-b", "work-a", "work-c"] as [string, string, string] },
    { ...stored, sequence_number: 12 },
    { ...stored, consensus_timestamp: "100.000000002" },
    { ...stored, artifact_sha256: "8".repeat(64) },
    { ...stored, artifact_reference: `${stored.artifact_reference}?mutable=true` },
    { ...stored, world_block_number: "124" },
    { ...stored, world_block_hash: `0x${"7".repeat(64)}` },
  ]) assert.throws(() => assertStoredBallotBinding(changed, rebuilt), /BALLOT_RECONCILIATION_BINDING_MISMATCH/);
});