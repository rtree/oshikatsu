import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeBallotEventV2,
  encodeWorldArtifact,
  worldArtifactSha256,
  type WorldArtifactV1,
} from "@oshikatsu/protocol";
import { rebuildBallotCapability } from "../src/ballot-capability-rebuild.js";
import { foldBallotCapabilities } from "../src/ballot-verification.js";

const artifact: WorldArtifactV1 = {
  schema: "oshikatsu-world-artifact-v1",
  room_id: "room-a",
  manifest_hash: "4".repeat(64),
  nominee_ids: ["level-up", "cadet", "divine"],
  account_id: "0.0.9706029",
  action: "oshikatsu-room:room-a",
  signal: "public-signal",
  anchor: { block_number: "32845156", block_hash: `0x${"a".repeat(64)}`, block_timestamp: "1785025951" },
  proof: {
    protocol_version: "4.0",
    nonce: "public-nonce",
    action: "oshikatsu-room:room-a",
    responses: [{ identifier: "proof_of_human", signal_hash: "public-signal-hash", proof: ["1", "2", "3", "4", "5"], nullifier: "private-nullifier", issuer_schema_id: 1, expires_at_min: 1785025889 }],
    user_presence_completed: true,
    environment: "production",
  },
};

const artifactBytes = encodeWorldArtifact(artifact);
const artifactReference = `https://raw.githubusercontent.com/rtree/oshikatsu/${"a".repeat(40)}/a/${worldArtifactSha256(artifactBytes)}.json`;
const messageBytes = encodeBallotEventV2({
  ballotId: "ballot-public",
  roomId: artifact.room_id,
  manifestHash: artifact.manifest_hash,
  nomineeIds: artifact.nominee_ids,
  accountId: artifact.account_id,
  artifactHash: worldArtifactSha256(artifactBytes),
  artifactReference,
  worldBlockNumber: artifact.anchor.block_number,
  worldBlockHash: artifact.anchor.block_hash,
});
const verified = [{ report_hash: "b".repeat(64), outcome: "VERIFIED" as const, reasons: [] }];

test("rebuilds a fold-consumable capability from public Ballot v2 evidence", () => {
  const record = rebuildBallotCapability({
    mirror: { message_bytes: messageBytes, payer_account_id: artifact.account_id, sequence_number: 11, consensus_timestamp: "1785027653.123456789" },
    artifact_bytes: artifactBytes,
    artifact_reference: artifactReference,
    verification_observations: verified,
  });

  assert.equal(foldBallotCapabilities([record])[0]?.status, "CAPABILITY_GRANTED");
  assert.equal(record.nullifier_commitment, "7474f94ff9924cacd4a4b2464c064c3fd106b9d152bab69a73494204a4fb4ac6");
  assert.equal(JSON.stringify(record).includes("private-nullifier"), false);
});

test("fails closed when public evidence does not bind exactly", () => {
  assert.throws(() => rebuildBallotCapability({
    mirror: { message_bytes: messageBytes, payer_account_id: "0.0.1", sequence_number: 11, consensus_timestamp: "1785027653.123456789" },
    artifact_bytes: artifactBytes,
    artifact_reference: artifactReference,
    verification_observations: verified,
  }), /binding is invalid/);

  const changedArtifact = encodeWorldArtifact({ ...artifact, signal: "changed" });
  assert.throws(() => rebuildBallotCapability({
    mirror: { message_bytes: messageBytes, payer_account_id: artifact.account_id, sequence_number: 11, consensus_timestamp: "1785027653.123456789" },
    artifact_bytes: changedArtifact,
    artifact_reference: artifactReference,
    verification_observations: verified,
  }), /binding is invalid/);

  assert.throws(() => rebuildBallotCapability({
    mirror: { message_bytes: messageBytes, payer_account_id: artifact.account_id, sequence_number: 11, consensus_timestamp: "1785027653.123456789" },
    artifact_bytes: artifactBytes,
    artifact_reference: `${artifactReference}?mutable=true`,
    verification_observations: verified,
  }), /binding is invalid/);
});