import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeBallotEventV2,
  encodeWorldArtifact,
  worldArtifactSha256,
  type WorldArtifactV1,
} from "@oshikatsu/protocol";
import { captureSanitizedBallotEvidence, createSanitizedBallotEvidence } from "../src/ballot-evidence.js";

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
    nonce: "sensitive-nonce",
    action: "oshikatsu-room:room-a",
    responses: [{ identifier: "proof_of_human", signal_hash: "public-signal-hash", proof: ["secret-proof", "2", "3", "4", "5"], nullifier: "raw-nullifier", issuer_schema_id: 1, expires_at_min: 1785025889 }],
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
const room = { id: artifact.room_id, manifest_hash: artifact.manifest_hash, topic_id: "0.0.9745676" };
const mirror = {
  message_bytes: messageBytes,
  payer_account_id: artifact.account_id,
  topic_id: room.topic_id,
  sequence_number: 11,
  consensus_timestamp: "1785030098.655889104",
  transaction_id: "0.0.9706029@1785030088.123456789",
  chunk_total: 1,
};

test("creates a sanitized optimistic Ballot v2 evidence receipt", () => {
  const receipt = createSanitizedBallotEvidence({ room, artifact_bytes: artifactBytes, artifact_reference: artifactReference, mirror });
  assert.deepEqual(receipt.projection, { status: "RECORDED_UNVERIFIED", counted: false, capability_granted: false });
  assert.equal(receipt.artifact.sha256, worldArtifactSha256(artifactBytes));
  assert.equal(receipt.hedera.message_base64, Buffer.from(messageBytes).toString("base64"));
  assert.deepEqual(receipt.world_anchor, { block_number: artifact.anchor.block_number, block_hash: artifact.anchor.block_hash });
  const output = JSON.stringify(receipt);
  for (const sensitive of ["raw-nullifier", "secret-proof", "sensitive-nonce", "nullifier", "proof"]) {
    assert.equal(output.includes(sensitive), false);
  }
});

test("fails closed for mismatched Room, payer, topic, artifact, and chunking", () => {
  const valid = { room, artifact_bytes: artifactBytes, artifact_reference: artifactReference, mirror };
  for (const changed of [
    { ...valid, room: { ...room, manifest_hash: "f".repeat(64) } },
    { ...valid, mirror: { ...mirror, payer_account_id: "0.0.1" } },
    { ...valid, mirror: { ...mirror, topic_id: "0.0.1" } },
    { ...valid, artifact_reference: `${artifactReference}?mutable=true` },
    { ...valid, mirror: { ...mirror, chunk_total: 2 } },
  ]) {
    assert.throws(() => createSanitizedBallotEvidence(changed), /evidence (binding|metadata) is invalid/);
  }
});

function mirrorMessage() {
  return {
    message: Buffer.from(messageBytes).toString("base64"),
    payer_account_id: artifact.account_id,
    sequence_number: 11,
    consensus_timestamp: mirror.consensus_timestamp,
    chunk_info: null,
  };
}

function mirrorTransaction() {
  return {
    transactions: [{
      transaction_id: mirror.transaction_id,
      consensus_timestamp: mirror.consensus_timestamp,
      entity_id: room.topic_id,
      name: "CONSENSUSSUBMITMESSAGE",
      result: "SUCCESS",
    }],
  };
}

test("captures by transaction and resolves the exact topic message", async () => {
  const requested: string[] = [];
  const receipt = await captureSanitizedBallotEvidence({ room, artifact_bytes: artifactBytes, transaction_id: mirror.transaction_id }, async (url) => {
    requested.push(url);
    return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0), json: async () => url.includes("/transactions/") ? mirrorTransaction() : { messages: [mirrorMessage()] } };
  });
  assert.deepEqual(requested, [
    "https://testnet.mirrornode.hedera.com/api/v1/transactions/0.0.9706029-1785030088-123456789",
    `https://testnet.mirrornode.hedera.com/api/v1/topics/${room.topic_id}/messages?timestamp=${mirror.consensus_timestamp}`,
  ]);
  assert.equal(receipt.hedera.transaction_id, mirror.transaction_id);
  assert.equal(receipt.hedera.sequence_number, 11);
});

test("captures by sequence and reverse-correlates its transaction", async () => {
  const requested: string[] = [];
  const receipt = await captureSanitizedBallotEvidence({ room, artifact_bytes: artifactBytes, sequence_number: 11 }, async (url) => {
    requested.push(url);
    return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0), json: async () => url.includes("/messages/") ? mirrorMessage() : mirrorTransaction() };
  });
  assert.deepEqual(requested, [
    `https://testnet.mirrornode.hedera.com/api/v1/topics/${room.topic_id}/messages/11`,
    `https://testnet.mirrornode.hedera.com/api/v1/transactions?timestamp=${mirror.consensus_timestamp}&transactiontype=CONSENSUSSUBMITMESSAGE`,
  ]);
  assert.equal(receipt.hedera.transaction_id, mirror.transaction_id);
  assert.deepEqual(receipt.projection, { status: "RECORDED_UNVERIFIED", counted: false, capability_granted: false });
});