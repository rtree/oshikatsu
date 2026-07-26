import { readFile } from "node:fs/promises";
import { rebuildBallotCapability } from "../apps/api/src/ballot-capability-rebuild.js";
import type { BallotVerificationObservation, VerificationReason } from "../apps/api/src/ballot-verification.js";

function option(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const reasons = new Set<VerificationReason>([
  "WAITING_WORLD_FINALITY", "ARTIFACT_UNAVAILABLE", "COMMITTED_BYTES_UNAVAILABLE",
  "ARTIFACT_BINDING_INVALID", "ANCHOR_NON_CANONICAL", "HISTORICAL_STATE_UNAVAILABLE",
  "WORLD_PROOF_REJECTED", "BALLOT_BINDING_INVALID", "OUTSIDE_WINDOW",
  "PROVIDER_DISAGREEMENT", "VERIFICATION_CONFLICT",
]);

function parseObservations(value: unknown): BallotVerificationObservation[] {
  if (!Array.isArray(value) || value.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return true;
    const observation = item as Record<string, unknown>;
    return !/^[0-9a-f]{64}$/.test(String(observation.report_hash)) ||
      !["VERIFIED", "INVALID", "UNVERIFIABLE"].includes(String(observation.outcome)) ||
      !Array.isArray(observation.reasons) || observation.reasons.some((reason) => !reasons.has(reason as VerificationReason));
  })) throw new Error("Verification observations are invalid.");
  return value as BallotVerificationObservation[];
}

const mirror = JSON.parse(await readFile(option("--mirror"), "utf8")) as Record<string, unknown>;
const chunkInfo = mirror.chunk_info as Record<string, unknown> | null | undefined;
const artifactBytes = await readFile(option("--artifact"));
const observations = parseObservations(JSON.parse(await readFile(option("--observations"), "utf8")));
const record = rebuildBallotCapability({
  mirror: {
    message_bytes: Buffer.from(String(mirror.message), "base64"),
    payer_account_id: String(mirror.payer_account_id),
    sequence_number: Number(mirror.sequence_number),
    consensus_timestamp: String(mirror.consensus_timestamp),
    chunk_total: Number(chunkInfo?.total),
  },
  artifact_bytes: artifactBytes,
  artifact_reference: option("--artifact-reference"),
  verification_observations: observations,
});

console.log(JSON.stringify(record, null, 2));