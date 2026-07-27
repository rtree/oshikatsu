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
  topic_id?: string;
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
  headers?: { get(name: string): string | null };
  body?: ReadableStream<Uint8Array> | null;
  arrayBuffer(): Promise<ArrayBuffer>;
  json(): Promise<unknown>;
};

type FetchLike = (url: string, init?: RequestInit) => Promise<FetchResponse>;

export type RebuiltCapabilityRecord = CapabilityBallotRecord & {
  topic_id?: string;
  consensus_timestamp: string;
  manifest_hash: string;
  nominee_ids: [string, string, string];
  artifact_sha256: string;
  artifact_reference: string;
  world_block_number: string;
  world_block_hash: string;
};

function assertPublicArtifactReference(reference: string) {
  const url = new URL(reference);
  const match = /^\/rtree\/oshikatsu\/([0-9a-f]{40})\/a\/([0-9a-f]{64})\.json$/.exec(url.pathname);
  if (url.protocol !== "https:" || url.hostname !== "raw.githubusercontent.com" || !match || url.search || url.hash) {
    throw new Error("Ballot artifact reference is not commit-fixed.");
  }
  return { path_hash: match[2]! };
}

async function readBoundedBytes(response: FetchResponse, maximumBytes: number) {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > maximumBytes) throw new Error("Ballot artifact is too large.");
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    length += value.length;
    if (length > maximumBytes) {
      await reader.cancel();
      throw new Error("Ballot artifact is too large.");
    }
    chunks.push(value);
  }
  if (length === 0) throw new Error("Ballot artifact is too large.");
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

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
): Promise<RebuiltCapabilityRecord> {
  if (!/^0\.0\.\d+$/.test(input.topic_id) ||
      !Number.isSafeInteger(input.sequence_number) || input.sequence_number < 1) {
    throw new Error("Public capability rebuild target is invalid.");
  }
  const mirrorBaseUrl = (input.mirror_base_url ?? "https://testnet.mirrornode.hedera.com").replace(/\/$/, "");
  const mirrorResponse = await fetcher(`${mirrorBaseUrl}/api/v1/topics/${input.topic_id}/messages/${input.sequence_number}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!mirrorResponse.ok) throw new Error(`Mirror ballot fetch failed with HTTP ${mirrorResponse.status}.`);
  const mirror = parseMirrorMessage(await mirrorResponse.json());
  if (mirror.sequence_number !== input.sequence_number) throw new Error("Mirror ballot sequence is invalid.");

  const artifactReference = decodeBallotEventV2(mirror.message_bytes).u;
  const reference = assertPublicArtifactReference(artifactReference);
  const artifactResponse = await fetcher(artifactReference, { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!artifactResponse.ok) throw new Error(`Ballot artifact fetch failed with HTTP ${artifactResponse.status}.`);
  const contentLength = Number(artifactResponse.headers?.get("content-length") ?? 0);
  if (contentLength > 64 * 1024) throw new Error("Ballot artifact is too large.");
  const artifactBytes = await readBoundedBytes(artifactResponse, 64 * 1024);
  if (worldArtifactSha256(artifactBytes) !== reference.path_hash) throw new Error("Ballot artifact path digest is invalid.");
  return rebuildBallotCapability({
    mirror,
    topic_id: input.topic_id,
    artifact_bytes: artifactBytes,
    artifact_reference: artifactReference,
    verification_observations: input.verification_observations,
  });
}

export function rebuildBallotCapability(
  input: RebuildBallotCapabilityInput,
): RebuiltCapabilityRecord {
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
    ...(input.topic_id ? { topic_id: input.topic_id } : {}),
    consensus_timestamp: input.mirror.consensus_timestamp,
    manifest_hash: event.m,
    nominee_ids: event.n,
    artifact_sha256: event.d,
    artifact_reference: event.u,
    world_block_number: event.b,
    world_block_hash: event.h,
  };
}
