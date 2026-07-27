import { createHash } from "node:crypto";
import { getFirestore } from "./firestore.js";
import {
  foldBallotCapabilities,
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
  nullifier_commitment?: string;
  artifact_sha256?: string;
  artifact_reference?: string;
  world_block_number?: string;
  world_block_hash?: string;
};

export async function recordUnverifiedBallot(record: StoredBallotRecord) {
  const store = getFirestore();
  const recordReference = store.collection("ballot_records").doc(record.event_hash);
  const roomStateReference = store.collection("ballot_room_state").doc(record.room_id);
  await store.runTransaction(async (transaction) => {
    const roomState = await transaction.get(roomStateReference);
    const revision = Number(roomState.data()?.revision ?? 0);
    transaction.create(recordReference, record);
    transaction.set(roomStateReference, { revision: revision + 1, updated_at: new Date().toISOString() }, { merge: true });
  });
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
  const observationReference = recordReference.collection("verification_observations").doc(observation.report_hash);
  await getFirestore().runTransaction(async (transaction) => {
    const [record, existing] = await Promise.all([transaction.get(recordReference), transaction.get(observationReference)]);
    if (!record.exists) throw new Error("BALLOT_RECORD_NOT_FOUND");
    if (existing.exists) {
      if (JSON.stringify(existing.data()) !== JSON.stringify(observation)) throw new Error("VERIFICATION_OBSERVATION_CONFLICT");
      return;
    }
    let count = Number(record.data()?.verification_observation_count ?? -1);
    if (count < 0) {
      const observations = await transaction.get(recordReference.collection("verification_observations").limit(101));
      count = observations.size;
    }
    if (count >= 100) throw new Error("BALLOT_OBSERVATION_LIMIT_EXCEEDED");
    transaction.create(observationReference, observation);
    transaction.update(recordReference, { verification_observation_count: count + 1 });
  });
}

export async function projectBallotRankings(roomId: string, nomineeIds: string[]) {
  const snapshot = await getFirestore().collection("ballot_records").where("room_id", "==", roomId).limit(501).get();
  if (snapshot.size > 500) throw new Error("BALLOT_RECORD_LIMIT_EXCEEDED");
  const records = await Promise.all(snapshot.docs.map(async (document) => {
    const stored = document.data() as StoredBallotRecord;
    const observations = await document.ref.collection("verification_observations").limit(101).get();
    if (observations.size > 100) throw new Error("BALLOT_OBSERVATION_LIMIT_EXCEEDED");
    return {
      ...stored,
      verification: foldBallotVerification(observations.docs.map((item) => item.data() as BallotVerificationObservation)),
    } satisfies RankedBallotRecord;
  }));
  return projectBallotRankingRecords(roomId, nomineeIds, records);
}

export function projectBallotRankingRecords(roomId: string, nomineeIds: string[], records: Array<StoredBallotRecord & RankedBallotRecord>) {
  const sequenceClaims = new Set<string>();
  for (const record of records) {
    const key = `${record.topic_id}\0${record.sequence_number}`;
    if (sequenceClaims.has(key)) throw new Error("DUPLICATE_BALLOT_TOPIC_SEQUENCE");
    sequenceClaims.add(key);
  }
  const provisional = rankBallots(nomineeIds, records, previewRankingPolicy, "PROVISIONAL");
  const verified = rankBallots(nomineeIds, records, previewRankingPolicy, "VERIFIED");
  const capabilities = foldBallotCapabilities(records.map((record) => ({
    room_id: record.room_id,
    event_hash: record.event_hash,
    payer_account_id: record.payer_account_id,
    nullifier_commitment: record.nullifier_commitment ?? null,
    sequence_number: record.sequence_number,
    event_type: record.event_type,
    verification: record.verification,
  })));
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
    capabilities,
    summary,
  };
}