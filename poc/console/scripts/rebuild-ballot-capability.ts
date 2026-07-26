import { readFile } from "node:fs/promises";
import { rebuildBallotCapability, rebuildBallotCapabilityFromPublicSources } from "../apps/api/src/ballot-capability-rebuild.js";
import { foldBallotCapabilities } from "../apps/api/src/ballot-verification.js";
import type { BallotVerificationObservation, VerificationReason } from "../apps/api/src/ballot-verification.js";

function option(name: string, required = true) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value && required) throw new Error(`${name} is required.`);
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

const observationsPath = option("--observations");
const observations = parseObservations(JSON.parse(await readFile(observationsPath, "utf8")));
const topicId = option("--topic-id", false);
const sequenceNumber = option("--sequence", false);
const mirrorPath = option("--mirror", false);
let record;
if (topicId || sequenceNumber) {
  if (!topicId || !sequenceNumber || mirrorPath) {
    throw new Error("Public rebuild requires --topic-id and --sequence without --mirror.");
  }
  record = await rebuildBallotCapabilityFromPublicSources({
    mirror_base_url: option("--mirror-base-url", false),
    topic_id: topicId,
    sequence_number: Number(sequenceNumber),
    verification_observations: observations,
  });
} else {
  const mirror = JSON.parse(await readFile(option("--mirror"), "utf8")) as Record<string, unknown>;
  const chunkInfo = mirror.chunk_info as Record<string, unknown> | null | undefined;
  const artifactBytes = await readFile(option("--artifact"));
  record = rebuildBallotCapability({
    mirror: {
      message_bytes: Buffer.from(String(mirror.message), "base64"),
      payer_account_id: String(mirror.payer_account_id),
      sequence_number: Number(mirror.sequence_number),
      consensus_timestamp: String(mirror.consensus_timestamp),
      chunk_total: chunkInfo ? Number(chunkInfo.total) : 1,
    },
    artifact_bytes: artifactBytes,
    artifact_reference: option("--artifact-reference"),
    verification_observations: observations,
  });
}

console.log(JSON.stringify({ record, capability: foldBallotCapabilities([record])[0] }, null, 2));