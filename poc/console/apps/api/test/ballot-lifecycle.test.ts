import assert from "node:assert/strict";
import test from "node:test";
import { ballotLifecyclePrepareSchema } from "../src/ballot-lifecycle.js";
import { decodeBallotUpdateEvent, encodeBallotUpdateEvent } from "@oshikatsu/protocol";

const base = { room_id: "room-a", capability_event_hash: "a".repeat(64), account_id: "0.0.1" };

test("lifecycle preparation schema binds UPDATE and WITHDRAW strictly", () => {
  assert.equal(ballotLifecyclePrepareSchema.safeParse({ ...base, event_type: "UPDATE", nominee_ids: ["work-a", "work-b", "work-c"] }).success, true);
  assert.equal(ballotLifecyclePrepareSchema.safeParse({ ...base, event_type: "WITHDRAW" }).success, true);
  assert.equal(ballotLifecyclePrepareSchema.safeParse({ ...base, event_type: "UPDATE", nominee_ids: ["work-a", "work-b"] }).success, false);
  assert.equal(ballotLifecyclePrepareSchema.safeParse({ ...base, event_type: "WITHDRAW", nominee_ids: ["work-a", "work-b", "work-c"] }).success, false);
});

test("UPDATE bytes retain capability, payer, manifest, and ordered nominees", () => {
  const bytes = encodeBallotUpdateEvent({ roomId: "room-a", manifestHash: "b".repeat(64), capabilityEventHash: base.capability_event_hash, accountId: base.account_id, nomineeIds: ["work-c", "work-a", "work-b"] });
  const event = decodeBallotUpdateEvent(bytes);
  assert.equal(event.c, base.capability_event_hash);
  assert.equal(event.a, base.account_id);
  assert.deepEqual(event.n, ["work-c", "work-a", "work-b"]);
  assert.ok(bytes.length <= 900);
});