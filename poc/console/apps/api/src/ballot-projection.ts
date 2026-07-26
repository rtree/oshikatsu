import { createHash } from "node:crypto";
import { getFirestore } from "./firestore.js";
import {
  foldBallotVerification,
  rankBallots,
  type BallotVerificationObservation,
  type RankedBallotRecord,
} from "./ballot-verification.js";
import type { VerificationReason } from "./ballot-verification.js";
import { z } from "zod";

export const verificationObservationSchema = z.object({
  report_hash: z.string().regex(/^[0-9a-f]{64}$/),
  outcome: z.enum(["VERIFIED", "INVALID", "UNVERIFIABLE"]),
  reasons: z.array(z.enum([
    "WAITING_WORLD_FINALITY", "ARTIFACT_UNAVAILABLE", "COMMITTED_BYTES_UNAVAILABLE",
    "ARTIFACT_BINDING_INVALID", "ANCHOR_NON_CANONICAL", "HISTORICAL_STATE_UNAVAILABLE",
    "WORLD_PROOF_REJECTED", "BALLOT_BINDING_INVALID", "OUTSIDE_WINDOW",
    "PROVIDER_DISAGREEMENT", "VERIFICATION_CONFLICT",
  ] satisfies VerificationReason[])),
}).strict();

export const previewRankingPolicy = {
  policy_id: "ordered-borda-3-2-1-preview-v1",
  position_points: [3, 2, 1] as [number, number, number],
};

type StoredBallotRecord = Omit<RankedBallotRecord, "verification"> & {
  room_id: string;
  topic_id: string;
  consensus_timestamp: string;
  artifact_sha256?: string;
  artifact_reference?: string;
  world_block_number?: string;
  world_block_hash?: string;
};

export async function recordUnverifiedBallot(record: StoredBallotRecord) {
  await getFirestore().collection("ballot_records").doc(record.event_hash).create(record);
  return {
    status: "RECORDED_UNVERIFIED" as const,
    counted: false,
    capability_granted: false,
    event_hash: record.event_hash,
    sequence_number: record.sequence_number,
    consensus_timestamp: record.consensus_timestamp,
    payer_account_id: record.payer_account_id,
  };
}

export async function addVerificationObservation(eventHash: string, observation: BallotVerificationObservation) {
  const recordReference = getFirestore().collection("ballot_records").doc(eventHash);
  if (!(await recordReference.get()).exists) throw new Error("BALLOT_RECORD_NOT_FOUND");
  await recordReference.collection("verification_observations").doc(observation.report_hash).set(observation);
}

export async function projectBallotRankings(roomId: string, nomineeIds: string[]) {
  const snapshot = await getFirestore().collection("ballot_records").where("room_id", "==", roomId).limit(500).get();
  const records = await Promise.all(snapshot.docs.map(async (document) => {
    const stored = document.data() as StoredBallotRecord;
    const observations = await document.ref.collection("verification_observations").limit(100).get();
    return {
      ...stored,
      verification: foldBallotVerification(observations.docs.map((item) => item.data() as BallotVerificationObservation)),
    } satisfies RankedBallotRecord;
  }));
  const provisional = rankBallots(nomineeIds, records, previewRankingPolicy, "PROVISIONAL");
  const verified = rankBallots(nomineeIds, records, previewRankingPolicy, "VERIFIED");
  const summary = {
    recorded_unverified: records.filter((record) => record.verification.status === "RECORDED_UNVERIFIED").length,
    unverifiable: records.filter((record) => record.verification.status === "UNVERIFIABLE").length,
    verified: records.filter((record) => record.verification.status === "VERIFIED").length,
    invalid: records.filter((record) => record.verification.status === "INVALID").length,
  };
  const resultHash = (kind: string, ranking: unknown) => createHash("sha256").update(JSON.stringify({ kind, policy: previewRankingPolicy.policy_id, room_id: roomId, ranking, summary })).digest("hex");
  return {
    policy: { ...previewRankingPolicy, binding: "PREVIEW" as const },
    provisional: { label: "Provisional ranking", includes: ["RECORDED_UNVERIFIED", "UNVERIFIABLE", "VERIFIED"], result_hash: resultHash("PROVISIONAL", provisional), entries: provisional },
    verified: { label: "Verified preview", includes: ["VERIFIED"], result_hash: resultHash("VERIFIED", verified), entries: verified },
    summary,
  };
}