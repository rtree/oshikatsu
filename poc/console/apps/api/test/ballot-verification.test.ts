import assert from "node:assert/strict";
import test from "node:test";
import {
  foldBallotVerification,
  rankBallots,
  type BallotVerificationObservation,
  type RankedBallotRecord,
} from "../src/ballot-verification.js";

const unavailable: BallotVerificationObservation = {
  report_hash: "a".repeat(64),
  outcome: "UNVERIFIABLE",
  reasons: ["ARTIFACT_UNAVAILABLE"],
};
const verified: BallotVerificationObservation = {
  report_hash: "b".repeat(64),
  outcome: "VERIFIED",
  reasons: [],
};
const invalid: BallotVerificationObservation = {
  report_hash: "c".repeat(64),
  outcome: "INVALID",
  reasons: ["WORLD_PROOF_REJECTED"],
};

test("Mirror receipt starts unverified and is not counted", () => {
  assert.deepEqual(foldBallotVerification([]), {
    status: "RECORDED_UNVERIFIED",
    reasons: [],
    provisional_counted: true,
    counted: false,
    capability_eligible: false,
  });
});

test("unverifiable evidence may later become verified", () => {
  assert.equal(foldBallotVerification([unavailable]).status, "UNVERIFIABLE");
  assert.deepEqual(foldBallotVerification([unavailable, verified]), {
    status: "VERIFIED",
    reasons: [],
    provisional_counted: true,
    counted: true,
    capability_eligible: true,
  });
});

test("deterministic invalid evidence is not counted", () => {
  const result = foldBallotVerification([unavailable, invalid]);
  assert.equal(result.status, "INVALID");
  assert.equal(result.counted, false);
  assert.deepEqual(result.reasons, ["WORLD_PROOF_REJECTED"]);
});

test("conflicting conclusive observations fail closed independent of order", () => {
  const first = foldBallotVerification([verified, invalid, unavailable]);
  const second = foldBallotVerification([unavailable, invalid, verified]);
  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    status: "UNVERIFIABLE",
    reasons: ["VERIFICATION_CONFLICT"],
    provisional_counted: true,
    counted: false,
    capability_eligible: false,
  });
});

test("duplicate observations are idempotent", () => {
  assert.deepEqual(
    foldBallotVerification([unavailable, unavailable]),
    foldBallotVerification([unavailable]),
  );
});

function record(overrides: Partial<RankedBallotRecord>): RankedBallotRecord {
  return {
    event_hash: "a".repeat(64),
    payer_account_id: "0.0.1",
    nominee_ids: ["a", "b", "c"],
    sequence_number: 1,
    event_type: "INITIAL",
    verification: foldBallotVerification([]),
    ...overrides,
  };
}

const previewPolicy = {
  policy_id: "ordered-borda-3-2-1-preview-v1",
  position_points: [3, 2, 1] as [number, number, number],
};

test("provisional ranking includes unverified and verified but excludes invalid", () => {
  const records = [
    record({ payer_account_id: "0.0.1", nominee_ids: ["a", "b", "c"], verification: foldBallotVerification([]) }),
    record({ payer_account_id: "0.0.2", nominee_ids: ["b", "a", "c"], sequence_number: 2, verification: foldBallotVerification([verified]) }),
    record({ payer_account_id: "0.0.3", nominee_ids: ["c", "a", "b"], sequence_number: 3, verification: foldBallotVerification([invalid]) }),
  ];
  assert.deepEqual(rankBallots(["a", "b", "c"], records, previewPolicy, "PROVISIONAL").map(({ nominee_id, points }) => [nominee_id, points]), [["a", 5], ["b", 5], ["c", 2]]);
  assert.deepEqual(rankBallots(["a", "b", "c"], records, previewPolicy, "VERIFIED").map(({ nominee_id, points }) => [nominee_id, points]), [["b", 3], ["a", 2], ["c", 1]]);
});

test("provisional and verified folds choose the latest eligible payer intent independently", () => {
  const records = [
    record({ sequence_number: 10, nominee_ids: ["a", "b", "c"], verification: foldBallotVerification([verified]) }),
    record({ sequence_number: 12, nominee_ids: ["c", "b", "a"], verification: foldBallotVerification([unavailable]) }),
  ];
  assert.equal(rankBallots(["a", "b", "c"], records, previewPolicy, "PROVISIONAL")[0]?.nominee_id, "c");
  assert.equal(rankBallots(["a", "b", "c"], records, previewPolicy, "VERIFIED")[0]?.nominee_id, "a");
});

test("withdraw removes only the matching projection mode current intent", () => {
  const records = [
    record({ sequence_number: 10, verification: foldBallotVerification([verified]) }),
    record({ sequence_number: 12, event_type: "WITHDRAW", nominee_ids: null, verification: foldBallotVerification([]) }),
  ];
  assert.ok(rankBallots(["a", "b", "c"], records, previewPolicy, "PROVISIONAL").every(({ points }) => points === 0));
  assert.equal(rankBallots(["a", "b", "c"], records, previewPolicy, "VERIFIED")[0]?.points, 3);
});