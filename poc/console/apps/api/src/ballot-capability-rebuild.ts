import { decodeBallotEventV2, decodeWorldArtifact, domainHash, worldArtifactSha256 } from "@oshikatsu/protocol";
import {
  foldBallotVerification,
  type BallotVerificationObservation,
  type CapabilityBallotRecord,
} from "./ballot-verification.js";

export type MirrorBallotMessage = {
  message_bytes: Uint8Array;
  payer_account_id: string;
  sequence_number: number;
  consensus_timestamp: string;
  chunk_total: number;
};

export type RebuildBallotCapabilityInput = {
  mirror: MirrorBallotMessage;
  artifact_bytes: Uint8Array;
  artifact_reference: string;
  verification_observations: BallotVerificationObservation[];
};

export function rebuildBallotCapability(
  input: RebuildBallotCapabilityInput,
): CapabilityBallotRecord {
  const event = decodeBallotEventV2(input.mirror.message_bytes);
  const artifact = decodeWorldArtifact(input.artifact_bytes);
  if (!/^0\.0\.\d+$/.test(input.mirror.payer_account_id) ||
      !Number.isSafeInteger(input.mirror.sequence_number) || input.mirror.sequence_number < 1 ||
      !/^\d+\.\d{9}$/.test(input.mirror.consensus_timestamp) ||
      input.mirror.chunk_total !== 1) {
    throw new Error("Mirror ballot metadata is invalid.");
  }
  if (worldArtifactSha256(input.artifact_bytes) !== event.d ||
      input.artifact_reference !== event.u ||
      artifact.room_id !== event.r ||
      artifact.manifest_hash !== event.m ||
      artifact.account_id !== event.a ||
      artifact.account_id !== input.mirror.payer_account_id ||
      artifact.anchor.block_number !== event.b ||
      artifact.anchor.block_hash !== event.h ||
      artifact.nominee_ids.some((nomineeId, index) => nomineeId !== event.n[index])) {
    throw new Error("Ballot public evidence binding is invalid.");
  }

  return {
    room_id: event.r,
    event_hash: event.e,
    payer_account_id: input.mirror.payer_account_id,
    nullifier_commitment: domainHash("oshikatsu:world-nullifier:v1", {
      r: event.r,
      n: artifact.proof.responses[0].nullifier,
    }),
    sequence_number: input.mirror.sequence_number,
    event_type: "INITIAL",
    verification: foldBallotVerification(input.verification_observations),
  };
}
