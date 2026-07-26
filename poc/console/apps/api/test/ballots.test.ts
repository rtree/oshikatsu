import assert from "node:assert/strict";
import test from "node:test";
import { assertCommitFixedGitHubReference, ballotV2ManualPrepareSchema } from "../src/ballots.js";

const commit = "a".repeat(40);
const artifactSha256 = "b".repeat(64);
const reference = `https://raw.githubusercontent.com/rtree/oshikatsu/${commit}/a/${artifactSha256}.json`;

test("Ballot v2 accepts only commit-fixed artifact references with a path SHA", () => {
  assert.deepEqual(assertCommitFixedGitHubReference(reference), {
    commit,
    pathHash: artifactSha256,
  });
  assert.throws(
    () => assertCommitFixedGitHubReference(reference.replace(commit, "main")),
    /commit-fixed GitHub raw URL/,
  );
  assert.throws(
    () => assertCommitFixedGitHubReference(`${reference}?mutable=true`),
    /commit-fixed GitHub raw URL/,
  );
  assert.throws(
    () => assertCommitFixedGitHubReference(reference.replace("raw.githubusercontent.com", "example.com")),
    /commit-fixed GitHub raw URL/,
  );
});

test("manual Ballot v2 preparation requires the selected Room, ordered Top3, and payer", () => {
  const input = {
    artifact_sha256: artifactSha256,
    artifact_reference: reference,
    room_id: "room-demo",
    account_id: "0.0.9706029",
    nominee_ids: ["level-up", "cadet", "divine"],
  };
  assert.equal(ballotV2ManualPrepareSchema.safeParse(input).success, true);
  assert.equal(ballotV2ManualPrepareSchema.safeParse({ ...input, account_id: undefined }).success, false);
  assert.equal(ballotV2ManualPrepareSchema.safeParse({ ...input, nominee_ids: ["level-up", "cadet"] }).success, false);
  assert.equal(ballotV2ManualPrepareSchema.safeParse({ ...input, unexpected: true }).success, false);
});