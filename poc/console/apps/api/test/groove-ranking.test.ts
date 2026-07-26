import assert from "node:assert/strict";
import test from "node:test";
import { demoWorldGateAllows, grooveWindowStatus, isConsensusWithinPreparation, rankRoomWorks, type ConfirmedShout } from "../src/groove.js";

function shout(overrides: Partial<ConfirmedShout>): ConfirmedShout {
  return {
    status: "CONFIRMED",
    prepare_id: "groove-a",
    room_id: "room-a",
    work_id: "work-a",
    transaction_id: "0.0.1@1.1",
    topic_id: "0.0.1",
    payer_account_id: "0.0.1",
    sequence_number: 1,
    consensus_timestamp: "1.000000001",
    message_base64: "e30=",
    message_bytes: 2,
    event_hash: "a".repeat(64),
    ...overrides,
  };
}

test("one payer contributes only the latest HCS-confirmed Shout in a Room", () => {
  const events = [
    shout({ prepare_id: "later", work_id: "work-b", sequence_number: 20 }),
    shout({ prepare_id: "earlier", work_id: "work-a", sequence_number: 10 }),
    shout({ prepare_id: "other-room", room_id: "room-b", work_id: "work-b", sequence_number: 5 }),
  ];
  assert.deepEqual(rankRoomWorks("room-a", ["work-a", "work-b"], events), [
    { rank: 1, work_id: "work-b", shout_count: 1, tied: false },
    { rank: 2, work_id: "work-a", shout_count: 0, tied: false },
  ]);
});

test("current Shout selection is deterministic when sequence numbers tie", () => {
  const events = [
    shout({ prepare_id: "older-timestamp", work_id: "work-a", sequence_number: 10, consensus_timestamp: "1.000000001" }),
    shout({ prepare_id: "lower-hash", work_id: "work-a", sequence_number: 10, consensus_timestamp: "2.000000001", event_hash: "a".repeat(64) }),
    shout({ prepare_id: "higher-hash", work_id: "work-b", sequence_number: 10, consensus_timestamp: "2.000000001", event_hash: "b".repeat(64) }),
  ];
  assert.deepEqual(rankRoomWorks("room-a", ["work-a", "work-b"], events), [
    { rank: 1, work_id: "work-b", shout_count: 1, tied: false },
    { rank: 2, work_id: "work-a", shout_count: 0, tied: false },
  ]);
});

test("ranking preserves ties as competition ranks", () => {
  const events = [
    shout({ payer_account_id: "0.0.1", work_id: "work-a", sequence_number: 1 }),
    shout({ payer_account_id: "0.0.2", work_id: "work-b", sequence_number: 2 }),
  ];
  assert.deepEqual(rankRoomWorks("room-a", ["work-a", "work-b", "work-c"], events), [
    { rank: 1, work_id: "work-a", shout_count: 1, tied: true },
    { rank: 1, work_id: "work-b", shout_count: 1, tied: true },
    { rank: 3, work_id: "work-c", shout_count: 0, tied: false },
  ]);
});

test("preparation expiry limits consensus time rather than delayed Mirror observation", () => {
  const preparation = {
    created_at: "2026-07-26T03:00:00.000Z",
    expires_at: "2026-07-26T03:10:00.000Z",
  };

  assert.equal(isConsensusWithinPreparation(preparation, "1785034799.999999999"), false);
  assert.equal(isConsensusWithinPreparation(preparation, "1785034800.000000000"), true);
  assert.equal(isConsensusWithinPreparation(preparation, "1785035400.000000000"), true);
  assert.equal(isConsensusWithinPreparation(preparation, "1785035400.000000001"), false);
  assert.equal(isConsensusWithinPreparation(preparation, "not-a-timestamp"), false);
});

test("DEMO first Shout requires a Room, manifest, and payer-bound World grant", () => {
  const input = { demo_room: true, confirmed_claim: false, room_id: "room-a", manifest_hash: "a".repeat(64), account_id: "0.0.1" };
  assert.equal(demoWorldGateAllows(input), false);
  assert.equal(demoWorldGateAllows({ ...input, demo_room: false }), true);
  assert.equal(demoWorldGateAllows({ ...input, confirmed_claim: true }), true);
  assert.equal(demoWorldGateAllows({ ...input, grant: { room_id: "room-a", manifest_hash: "a".repeat(64), account_id: "0.0.1" } }), true);
  assert.equal(demoWorldGateAllows({ ...input, grant: { room_id: "room-a", manifest_hash: "b".repeat(64), account_id: "0.0.1" } }), false);
  assert.equal(demoWorldGateAllows({ ...input, grant: { room_id: "room-a", manifest_hash: "a".repeat(64), account_id: "0.0.2" } }), false);
});

test("Room deadline uses inclusive HCS consensus time and excludes late events from ranking", () => {
  const opensAt = "2026-07-26T03:00:00.000Z";
  const deadline = "2026-07-26T03:02:00.000Z";
  assert.equal(grooveWindowStatus("1785034800.000000000", opensAt, deadline), "IN_WINDOW");
  assert.equal(grooveWindowStatus("1785034920.000000000", opensAt, deadline), "IN_WINDOW");
  assert.equal(grooveWindowStatus("1785034920.000000001", opensAt, deadline), "LATE");
  const events = [
    shout({ sequence_number: 10, work_id: "work-a", projection_state: "CURRENT" }),
    shout({ sequence_number: 20, work_id: "work-b", projection_state: "LATE" }),
  ];
  assert.deepEqual(rankRoomWorks("room-a", ["work-a", "work-b"], events), [
    { rank: 1, work_id: "work-a", shout_count: 1, tied: false },
    { rank: 2, work_id: "work-b", shout_count: 0, tied: false },
  ]);
});