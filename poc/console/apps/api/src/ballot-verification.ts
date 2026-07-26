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
  provisional_counted: boolean;
  counted: boolean;
  capability_eligible: boolean;
};

export type RankedBallotRecord = {
  event_hash: string;
  payer_account_id: string;
  nominee_ids: [string, string, string] | null;
  sequence_number: number;
  event_type: "INITIAL" | "UPDATE" | "WITHDRAW";
  verification: BallotVerificationFold;
};

export type CapabilityBallotRecord = {
  room_id: string;
  event_hash: string;
  payer_account_id: string;
  nullifier_commitment: string | null;
  sequence_number: number;
  event_type: "INITIAL" | "UPDATE" | "WITHDRAW";
  verification: BallotVerificationFold;
};

export type BallotCapabilityStatus =
  | "CAPABILITY_GRANTED"
  | "EVIDENCE_NOT_VERIFIED"
  | "UNIQUENESS_UNVERIFIABLE"
  | "NULLIFIER_CONFLICT"
  | "PAYER_CONFLICT"
  | "NULLIFIER_AND_PAYER_CONFLICT";

export type BallotCapabilityOutcome = CapabilityBallotRecord & {
  status: BallotCapabilityStatus;
  capability_granted: boolean;
  conflicts_with: string[];
};

export type RankingPolicy = {
  policy_id: string;
  position_points: [number, number, number];
};

export type RankingEntry = {
  nominee_id: string;
  rank: number;
  points: number;
  first_place_count: number;
  second_place_count: number;
  third_place_count: number;
  tied: boolean;
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
    provisional_counted: status !== "INVALID",
    counted: status === "VERIFIED",
    capability_eligible: status === "VERIFIED",
  };
}

export function foldBallotCapabilities(records: CapabilityBallotRecord[]): BallotCapabilityOutcome[] {
  const nullifierClaims = new Map<string, string>();
  const payerClaims = new Map<string, string>();
  return [...records]
    .sort((left, right) =>
      left.room_id.localeCompare(right.room_id) ||
      left.sequence_number - right.sequence_number ||
      left.event_hash.localeCompare(right.event_hash),
    )
    .map((record) => {
      if (record.event_type !== "INITIAL" || !record.verification.capability_eligible) {
        return { ...record, status: "EVIDENCE_NOT_VERIFIED" as const, capability_granted: false, conflicts_with: [] };
      }
      if (!record.nullifier_commitment) {
        return { ...record, status: "UNIQUENESS_UNVERIFIABLE" as const, capability_granted: false, conflicts_with: [] };
      }

      const nullifierKey = `${record.room_id}\0${record.nullifier_commitment}`;
      const payerKey = `${record.room_id}\0${record.payer_account_id}`;
      const nullifierConflict = nullifierClaims.get(nullifierKey);
      const payerConflict = payerClaims.get(payerKey);
      const conflictsWith = [...new Set([nullifierConflict, payerConflict].filter((value): value is string => Boolean(value)))].sort();
      const status = nullifierConflict && payerConflict
        ? "NULLIFIER_AND_PAYER_CONFLICT"
        : nullifierConflict
          ? "NULLIFIER_CONFLICT"
          : payerConflict
            ? "PAYER_CONFLICT"
            : "CAPABILITY_GRANTED";
      if (status === "CAPABILITY_GRANTED") {
        nullifierClaims.set(nullifierKey, record.event_hash);
        payerClaims.set(payerKey, record.event_hash);
      }
      return {
        ...record,
        status,
        capability_granted: status === "CAPABILITY_GRANTED",
        conflicts_with: conflictsWith,
      };
    });
}

export function rankBallots(
  nomineeIds: string[],
  records: RankedBallotRecord[],
  policy: RankingPolicy,
  mode: "PROVISIONAL" | "VERIFIED",
): RankingEntry[] {
  const eligible = records.filter((record) =>
    mode === "PROVISIONAL" ? record.verification.provisional_counted : record.verification.counted,
  );
  const currentByPayer = new Map<string, RankedBallotRecord>();
  for (const record of [...eligible].sort((left, right) => left.sequence_number - right.sequence_number)) {
    currentByPayer.set(record.payer_account_id, record);
  }

  const totals = new Map(nomineeIds.map((nomineeId) => [nomineeId, {
    nominee_id: nomineeId,
    points: 0,
    first_place_count: 0,
    second_place_count: 0,
    third_place_count: 0,
  }]));
  for (const record of currentByPayer.values()) {
    if (record.event_type === "WITHDRAW" || !record.nominee_ids) continue;
    record.nominee_ids.forEach((nomineeId, index) => {
      const entry = totals.get(nomineeId);
      if (!entry) return;
      entry.points += policy.position_points[index] ?? 0;
      if (index === 0) entry.first_place_count += 1;
      if (index === 1) entry.second_place_count += 1;
      if (index === 2) entry.third_place_count += 1;
    });
  }

  const manifestOrder = new Map(nomineeIds.map((nomineeId, index) => [nomineeId, index]));
  const ordered = [...totals.values()].sort((left, right) =>
    right.points - left.points ||
    right.first_place_count - left.first_place_count ||
    right.second_place_count - left.second_place_count ||
    (manifestOrder.get(left.nominee_id) ?? 0) - (manifestOrder.get(right.nominee_id) ?? 0),
  );
  let rank = 1;
  return ordered.map((entry, index) => {
    const previous = ordered[index - 1];
    const tiedWithPrevious = Boolean(previous && previous.points === entry.points && previous.first_place_count === entry.first_place_count && previous.second_place_count === entry.second_place_count);
    if (index > 0 && !tiedWithPrevious) rank = index + 1;
    const tied = ordered.some((candidate) => candidate.nominee_id !== entry.nominee_id && candidate.points === entry.points && candidate.first_place_count === entry.first_place_count && candidate.second_place_count === entry.second_place_count);
    return { ...entry, rank, tied };
  });
}