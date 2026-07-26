import assert from "node:assert/strict";
import test from "node:test";
import { rankRoomWorks, type ConfirmedShout } from "../src/groove.js";

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