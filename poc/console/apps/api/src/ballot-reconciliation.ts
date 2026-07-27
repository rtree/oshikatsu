import { getFirestore } from "./firestore.js";
import { rebuildBallotCapabilityFromPublicSources } from "./ballot-capability-rebuild.js";
import { projectBallotRankings } from "./ballot-projection.js";
import type { BallotVerificationObservation, BallotCapabilityOutcome } from "./ballot-verification.js";
import { getRoom } from "./rooms.js";

type StoredBallot = {
  room_id: string;
  topic_id: string;
  event_hash: string;
  payer_account_id: string;
  nominee_ids: [string, string, string];
  sequence_number: number;
  consensus_timestamp: string;
  event_type: "INITIAL";
  nullifier_commitment?: string;
  artifact_sha256: string;
  artifact_reference: string;
  world_block_number: string;
  world_block_hash: string;
};

function equalNominees(left: [string, string, string], right: [string, string, string]) {
  return left.every((value, index) => value === right[index]);
}

export function assertStoredBallotBinding(stored: StoredBallot, rebuilt: Awaited<ReturnType<typeof rebuildBallotCapabilityFromPublicSources>>) {
  if (stored.event_hash !== rebuilt.event_hash ||
      stored.room_id !== rebuilt.room_id ||
      stored.topic_id !== rebuilt.topic_id ||
      stored.payer_account_id !== rebuilt.payer_account_id ||
      stored.sequence_number !== rebuilt.sequence_number ||
      stored.consensus_timestamp !== rebuilt.consensus_timestamp ||
      stored.event_type !== rebuilt.event_type ||
      !equalNominees(stored.nominee_ids, rebuilt.nominee_ids) ||
      stored.artifact_sha256 !== rebuilt.artifact_sha256 ||
      stored.artifact_reference !== rebuilt.artifact_reference ||
      stored.world_block_number !== rebuilt.world_block_number ||
      stored.world_block_hash !== rebuilt.world_block_hash) {
    throw new Error("BALLOT_RECONCILIATION_BINDING_MISMATCH");
  }
}

export async function reconcileBallotCapability(eventHash: string, actor: string) {
  if (!/^[0-9a-f]{64}$/.test(eventHash)) throw new Error("INVALID_BALLOT_EVENT_HASH");
  const store = getFirestore();
  const recordReference = store.collection("ballot_records").doc(eventHash);
  const snapshot = await recordReference.get();
  if (!snapshot.exists) throw new Error("BALLOT_RECORD_NOT_FOUND");
  const stored = snapshot.data() as StoredBallot;
  if (stored.event_hash !== eventHash || stored.event_type !== "INITIAL") throw new Error("BALLOT_RECORD_INVALID");
  const room = await getRoom(stored.room_id);
  if (!room || room.topic_id !== stored.topic_id) throw new Error("BALLOT_ROOM_BINDING_INVALID");
  const observationsSnapshot = await recordReference.collection("verification_observations").limit(101).get();
  if (observationsSnapshot.size > 100) throw new Error("BALLOT_OBSERVATION_LIMIT_EXCEEDED");
  const observations = observationsSnapshot.docs.map((document) => document.data() as BallotVerificationObservation);
  const rebuilt = await rebuildBallotCapabilityFromPublicSources({
    topic_id: stored.topic_id,
    sequence_number: stored.sequence_number,
    verification_observations: observations,
  });
  assertStoredBallotBinding(stored, rebuilt);
  if (room.manifest_hash !== rebuilt.manifest_hash || !equalNominees(stored.nominee_ids, rebuilt.nominee_ids)) throw new Error("BALLOT_ROOM_BINDING_INVALID");
  await projectBallotRankings(stored.room_id, room.works.map((work) => work.id));
  const roomStateReference = store.collection("ballot_room_state").doc(stored.room_id);
  const roomStateBefore = await roomStateReference.get();
  const expectedRevision = Number(roomStateBefore.data()?.revision ?? 0);
  let replayed = false;
  await store.runTransaction(async (transaction) => {
    const [currentSnapshot, roomState] = await Promise.all([transaction.get(recordReference), transaction.get(roomStateReference)]);
    if (!currentSnapshot.exists) throw new Error("BALLOT_RECORD_NOT_FOUND");
    const currentRevision = Number(roomState.data()?.revision ?? 0);
    if (currentRevision !== expectedRevision) throw new Error("BALLOT_ROOM_CHANGED_DURING_RECONCILIATION");
    const current = currentSnapshot.data() as StoredBallot;
    assertStoredBallotBinding(current, rebuilt);
    if (current.nullifier_commitment) {
      if (current.nullifier_commitment !== rebuilt.nullifier_commitment) throw new Error("NULLIFIER_COMMITMENT_CONFLICT");
      replayed = true;
      return;
    }
    transaction.update(recordReference, { nullifier_commitment: rebuilt.nullifier_commitment });
    transaction.set(roomStateReference, { revision: currentRevision, reconciled_at: new Date().toISOString() }, { merge: true });
    transaction.create(store.collection("admin_audit").doc(), {
      actor,
      operation: "RECONCILE_BALLOT_CAPABILITY",
      target: eventHash,
      room_id: stored.room_id,
      topic_id: stored.topic_id,
      sequence_number: stored.sequence_number,
      created_at: new Date().toISOString(),
    });
  });
  try {
    const projection = await projectBallotRankings(stored.room_id, room.works.map((work) => work.id));
    const capability = projection.capabilities.find((outcome) => outcome.event_hash === eventHash) as BallotCapabilityOutcome | undefined;
    if (!capability) throw new Error("CAPABILITY_PROJECTION_MISSING");
    return { reconciled: true as const, replayed, room_id: stored.room_id, projection_available: true as const, capability, capabilities: projection.capabilities };
  } catch (error) {
    return { reconciled: true as const, replayed, room_id: stored.room_id, projection_available: false as const, projection_error: error instanceof Error ? error.message : "CAPABILITY_PROJECTION_UNAVAILABLE" };
  }
}