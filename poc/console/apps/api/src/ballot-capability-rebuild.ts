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

export type PublicCapabilityRebuildInput = {
  mirror_base_url?: string;
  topic_id: string;
  sequence_number: number;
  verification_observations: BallotVerificationObservation[];
};

type FetchResponse = {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  json(): Promise<unknown>;
};

type FetchLike = (url: string) => Promise<FetchResponse>;

function parseMirrorMessage(value: unknown): MirrorBallotMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Mirror ballot response is invalid.");
  }
  const message = value as Record<string, unknown>;
  const chunkInfo = message.chunk_info as Record<string, unknown> | null | undefined;
  return {
    message_bytes: Buffer.from(String(message.message), "base64"),
    payer_account_id: String(message.payer_account_id),
    sequence_number: Number(message.sequence_number),
    consensus_timestamp: String(message.consensus_timestamp),
    chunk_total: chunkInfo ? Number(chunkInfo.total) : 1,
  };
}

export async function rebuildBallotCapabilityFromPublicSources(
  input: PublicCapabilityRebuildInput,
  fetcher: FetchLike = fetch,
): Promise<CapabilityBallotRecord> {
  if (!/^0\.0\.\d+$/.test(input.topic_id) ||
      !Number.isSafeInteger(input.sequence_number) || input.sequence_number < 1) {
    throw new Error("Public capability rebuild target is invalid.");
  }
  const mirrorBaseUrl = (input.mirror_base_url ?? "https://testnet.mirrornode.hedera.com").replace(/\/$/, "");
  const mirrorResponse = await fetcher(`${mirrorBaseUrl}/api/v1/topics/${input.topic_id}/messages/${input.sequence_number}`);
  if (!mirrorResponse.ok) throw new Error(`Mirror ballot fetch failed with HTTP ${mirrorResponse.status}.`);
  const mirror = parseMirrorMessage(await mirrorResponse.json());
  if (mirror.sequence_number !== input.sequence_number) throw new Error("Mirror ballot sequence is invalid.");

  const artifactReference = decodeBallotEventV2(mirror.message_bytes).u;
  const artifactResponse = await fetcher(artifactReference);
  if (!artifactResponse.ok) throw new Error(`Ballot artifact fetch failed with HTTP ${artifactResponse.status}.`);
  const artifactBytes = new Uint8Array(await artifactResponse.arrayBuffer());
  return rebuildBallotCapability({
    mirror,
    artifact_bytes: artifactBytes,
    artifact_reference: artifactReference,
    verification_observations: input.verification_observations,
  });
}

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
