import assert from "node:assert/strict";
import test from "node:test";
import { createDemoRoomInput } from "../src/rooms.js";

test("DEMO Room manifest is server-generated with three distinct seed works", () => {
  const values = [0.9, 0.1, 0.7, 0.2, 0.5, 0.4];
  let index = 0;
  const input = createDemoRoomInput(() => values[index++] ?? 0, new Date("2026-07-26T00:00:00.000Z"));

  assert.match(input.name, /^DEMO · /);
  assert.equal(input.room_type, "MANGA");
  assert.equal(input.opens_at, "2026-07-26T00:00:00.000Z");
  assert.equal(input.deadline, "2026-07-27T00:00:00.000Z");
  assert.equal(input.topic_id, "0.0.9745676");
  assert.equal(input.works.length, 3);
  assert.equal(new Set(input.works.map(({ id }) => id)).size, 3);
  assert.equal(input.acceptance_run_id, "reader-demo");
});

test("DEMO Room durations produce immutable absolute deadlines", () => {
  const now = new Date("2026-07-26T00:00:00.000Z");
  const expected = { "2m": 120_000, "3m": 180_000, "5m": 300_000, "10m": 600_000, "1h": 3_600_000, "1d": 86_400_000 } as const;
  for (const [duration, milliseconds] of Object.entries(expected)) {
    const input = createDemoRoomInput(() => 0, now, duration as keyof typeof expected);
    assert.equal(Date.parse(input.deadline) - Date.parse(input.opens_at), milliseconds);
  }
});