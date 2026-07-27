import assert from "node:assert/strict";
import test from "node:test";
import { projectBallotRankingRecords } from "../src/ballot-projection.js";
import { foldBallotVerification, type BallotVerificationObservation } from "../src/ballot-verification.js";

const verifiedObservation: BallotVerificationObservation = {
  report_hash: "f".repeat(64),
  outcome: "VERIFIED",
  reasons: [],
};

function projectionRecord(overrides: Record<string, unknown>) {
  return {
    room_id: "room-a",
    topic_id: "0.0.123",
    consensus_timestamp: "100.000000001",
    event_hash: "a".repeat(64),
    payer_account_id: "0.0.1",
    nominee_ids: ["work-a", "work-b", "work-c"] as [string, string, string],
    nullifier_commitment: "1".repeat(64),
    sequence_number: 1,
    event_type: "INITIAL" as const,
    verification: foldBallotVerification([verifiedObservation]),
    ...overrides,
  };
}

test("Room projection returns H3/H4 outcomes for verified, unverified, conflicting, and missing commitments", () => {
  const projection = projectBallotRankingRecords("room-a", ["work-a", "work-b", "work-c"], [
    projectionRecord({ event_hash: "d".repeat(64), payer_account_id: "0.0.4", nullifier_commitment: undefined, sequence_number: 4 }),
    projectionRecord({ event_hash: "c".repeat(64), payer_account_id: "0.0.3", sequence_number: 3 }),
    projectionRecord({ event_hash: "b".repeat(64), payer_account_id: "0.0.2", nullifier_commitment: "2".repeat(64), sequence_number: 2, verification: foldBallotVerification([]) }),
    projectionRecord({ event_hash: "a".repeat(64), sequence_number: 1 }),
  ]);

  assert.deepEqual(
    projection.capabilities.map(({ event_hash, status, capability_granted, conflicts_with }) => ({ event_hash, status, capability_granted, conflicts_with })),
    [
      { event_hash: "a".repeat(64), status: "CAPABILITY_GRANTED", capability_granted: true, conflicts_with: [] },
      { event_hash: "b".repeat(64), status: "EVIDENCE_NOT_VERIFIED", capability_granted: false, conflicts_with: [] },
      { event_hash: "c".repeat(64), status: "NULLIFIER_CONFLICT", capability_granted: false, conflicts_with: ["a".repeat(64)] },
      { event_hash: "d".repeat(64), status: "UNIQUENESS_UNVERIFIABLE", capability_granted: false, conflicts_with: [] },
    ],
  );
});

test("Room projection fails closed for duplicate topic sequence evidence", () => {
  assert.throws(() => projectBallotRankingRecords("room-a", ["work-a", "work-b", "work-c"], [
    projectionRecord({ event_hash: "a".repeat(64), sequence_number: 1 }),
    projectionRecord({ event_hash: "b".repeat(64), sequence_number: 1 }),
  ]), /DUPLICATE_BALLOT_TOPIC_SEQUENCE/);
});