export type BallotVerificationStatus =
  | "RECORDED_UNVERIFIED"
  | "VERIFIED"
  | "INVALID"
  | "UNVERIFIABLE";

export type VerificationReason =
  | "WAITING_WORLD_FINALITY"
  | "ARTIFACT_UNAVAILABLE"
  | "COMMITTED_BYTES_UNAVAILABLE"
  | "ARTIFACT_BINDING_INVALID"
  | "ANCHOR_NON_CANONICAL"
  | "HISTORICAL_STATE_UNAVAILABLE"
  | "WORLD_PROOF_REJECTED"
  | "BALLOT_BINDING_INVALID"
  | "OUTSIDE_WINDOW"
  | "PROVIDER_DISAGREEMENT"
  | "VERIFICATION_CONFLICT";

export type BallotVerificationObservation = {
  report_hash: string;
  outcome: "VERIFIED" | "INVALID" | "UNVERIFIABLE";
  reasons: VerificationReason[];
};

export type BallotVerificationFold = {
  status: BallotVerificationStatus;
  reasons: VerificationReason[];
  counted: boolean;
  capability_eligible: boolean;
};

export function foldBallotVerification(
  observations: BallotVerificationObservation[],
): BallotVerificationFold {
  const unique = new Map(observations.map((observation) => [observation.report_hash, observation]));
  const values = [...unique.values()];
  const conclusive = new Set(
    values
      .filter((observation) => observation.outcome !== "UNVERIFIABLE")
      .map((observation) => observation.outcome),
  );

  let status: BallotVerificationStatus;
  let reasons: VerificationReason[];
  if (conclusive.size > 1) {
    status = "UNVERIFIABLE";
    reasons = ["VERIFICATION_CONFLICT"];
  } else if (conclusive.has("INVALID")) {
    status = "INVALID";
    reasons = values.flatMap((observation) => observation.outcome === "INVALID" ? observation.reasons : []);
  } else if (conclusive.has("VERIFIED")) {
    status = "VERIFIED";
    reasons = [];
  } else if (values.length > 0) {
    status = "UNVERIFIABLE";
    reasons = values.flatMap((observation) => observation.reasons);
  } else {
    status = "RECORDED_UNVERIFIED";
    reasons = [];
  }

  const deduplicatedReasons = [...new Set(reasons)].sort();
  return {
    status,
    reasons: deduplicatedReasons,
    counted: status === "VERIFIED",
    capability_eligible: status === "VERIFIED",
  };
}