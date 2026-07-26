import assert from "node:assert/strict";
import test from "node:test";
import {
  foldBallotVerification,
  type BallotVerificationObservation,
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
    counted: false,
    capability_eligible: false,
  });
});

test("unverifiable evidence may later become verified", () => {
  assert.equal(foldBallotVerification([unavailable]).status, "UNVERIFIABLE");
  assert.deepEqual(foldBallotVerification([unavailable, verified]), {
    status: "VERIFIED",
    reasons: [],
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