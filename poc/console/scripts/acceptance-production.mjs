import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const apiBase = new URL(
  process.env.ACCEPTANCE_API_BASE ?? "https://ethglobal-lisbon2026-oshikatsu.web.app",
);
const mirrorBase = new URL(
  process.env.ACCEPTANCE_MIRROR_BASE ?? "https://testnet.mirrornode.hedera.com",
);
const runId = randomUUID().replaceAll("-", "");
const failures = [];
const evidence = { api_base: apiBase.href, mirror_base: mirrorBase.href, run_id: runId };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireProductionUrl(url, name) {
  assert(url.protocol === "https:", `${name} must use HTTPS.`);
  assert(!["localhost", "127.0.0.1", "::1"].includes(url.hostname), `${name} cannot be local.`);
}

function required(name) {
  const value = process.env[name];
  assert(value, `${name} is required; missing real evidence is a failure, not a skip.`);
  return value;
}

async function readJsonFixture(name) {
  const path = required(name);
  return JSON.parse(await readFile(path, "utf8"));
}

async function request(path, options = {}) {
  const url = new URL(path, apiBase);
  const response = await fetch(url, {
    ...options,
    headers: { Accept: "application/json", ...options.headers },
    signal: AbortSignal.timeout(30_000),
  });
  const contentType = response.headers.get("content-type") ?? "";
  assert(contentType.includes("application/json"), `${url.pathname} returned non-JSON content.`);
  const body = await response.json();
  assert(response.ok, `${url.pathname} returned HTTP ${response.status}: ${JSON.stringify(body)}`);
  return { body, response };
}

async function mirrorRequest(path) {
  const url = new URL(path, mirrorBase);
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  assert(response.ok, `Mirror returned HTTP ${response.status} for ${url.pathname}.`);
  return response.json();
}

async function check(name, action) {
  try {
    const result = await action();
    console.log(`PASS ${name}`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ name, message });
    console.error(`FAIL ${name}: ${message}`);
    return null;
  }
}

requireProductionUrl(apiBase, "ACCEPTANCE_API_BASE");
requireProductionUrl(mirrorBase, "ACCEPTANCE_MIRROR_BASE");

await check("deployed health", async () => {
  const { body } = await request("/api/health");
  assert(body.ok === true, "Health response did not report ok=true.");
});

const roomEvidence = await check("Room durable create and retrieval", async () => {
  const createBody = {
    name: `Acceptance Room ${runId}`,
    opens_at: new Date(Date.now() - 60_000).toISOString(),
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
    topic_id: "0.0.9745676",
    works: [
      {
        id: "acceptance-a",
        title: "Acceptance Work A",
        chapter: "Chapter 1",
        cover_url: "https://oshikatsu-reader-lisbon26.web.app/assets/sample01.webp",
        hero_url: null,
        reading_url: "https://www.webtoons.com/",
      },
      {
        id: "acceptance-b",
        title: "Acceptance Work B",
        chapter: "Chapter 2",
        cover_url: "https://oshikatsu-reader-lisbon26.web.app/assets/sample02.webp",
        hero_url: null,
        reading_url: "https://www.webtoons.com/",
      },
    ],
    acceptance_run_id: runId,
  };
  const created = await request("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createBody),
  });
  const room = created.body.room;
  assert(typeof room?.id === "string", "Room creation returned no durable id.");
  assert(typeof room?.manifest_hash === "string", "Room creation returned no manifest hash.");

  const retrieved = await request(`/api/rooms/${encodeURIComponent(room.id)}`);
  assert(retrieved.body.room?.manifest_hash === room.manifest_hash, "Retrieved manifest hash changed.");
  assert(retrieved.body.room?.acceptance_run_id === runId, "Retrieved Room lost the unique marker.");

  const historicalRoomId = required("ACCEPTANCE_PERSISTED_ROOM_ID");
  const historical = await request(`/api/rooms/${encodeURIComponent(historicalRoomId)}`);
  assert(historical.body.room?.id === historicalRoomId, "Prior-run Room was not retrievable.");
  assert(
    typeof historical.body.room.manifest_hash === "string",
    "Prior-run Room has no immutable manifest hash.",
  );
  return { historical_manifest_hash: historical.body.room.manifest_hash, room };
});
if (roomEvidence) evidence.room = roomEvidence;

const grooveEvidence = await check("Groove HCS and Mirror correlation", async () => {
  const submission = await readJsonFixture("ACCEPTANCE_GROOVE_EVIDENCE_FILE");
  for (const key of ["prepare_id", "topic_id", "transaction_id", "payer_account_id", "message_base64"]) {
    assert(typeof submission[key] === "string" && submission[key], `Groove evidence lacks ${key}.`);
  }
  const expectedBytes = Buffer.from(submission.message_base64, "base64");
  assert(expectedBytes.length > 0 && expectedBytes.length <= 900, "Groove message must be 1-900 bytes.");

  const transactionId = encodeURIComponent(submission.transaction_id);
  const status = await request(
    `/api/groove/status/${transactionId}?prepare_id=${encodeURIComponent(submission.prepare_id)}`,
  );
  assert(status.body.status === "CONFIRMED", "API did not report Groove as CONFIRMED.");
  assert(status.body.payer_account_id === submission.payer_account_id, "API Groove payer mismatch.");

  const transactionKey = submission.transaction_id.replace("@", "-").replace(/\.(?=\d+$)/, "-");
  const transaction = await mirrorRequest(`/api/v1/transactions/${encodeURIComponent(transactionKey)}`);
  const consensusTimestamp = transaction.transactions?.find(
    (candidate) => candidate.name === "CONSENSUSSUBMITMESSAGE" && candidate.result === "SUCCESS",
  )?.consensus_timestamp;
  assert(consensusTimestamp, "Mirror has no successful HCS transaction evidence.");
  const mirror = await mirrorRequest(
    `/api/v1/topics/${encodeURIComponent(submission.topic_id)}/messages?timestamp=${encodeURIComponent(consensusTimestamp)}`,
  );
  const match = mirror.messages?.find(
    (message) =>
      message.payer_account_id === submission.payer_account_id &&
      Buffer.from(message.message, "base64").equals(expectedBytes),
  );
  assert(match, "Mirror has no exact topic/payer/message match.");
  assert(
    match.chunk_info === null ||
      (match.chunk_info.number === 1 && match.chunk_info.total === 1),
    "Groove evidence used more than one HCS message.",
  );
  return {
    consensus_timestamp: match.consensus_timestamp,
    message_bytes: expectedBytes.length,
    payer_account_id: match.payer_account_id,
    sequence_number: match.sequence_number,
    topic_id: submission.topic_id,
    transaction_id: submission.transaction_id,
  };
});
if (grooveEvidence) evidence.groove = grooveEvidence;

const worldEvidence = await check("World production verification", async () => {
  const fixture = await readJsonFixture("ACCEPTANCE_WORLD_VERIFY_FILE");
  assert(fixture.context_token && fixture.signal && fixture.proof, "World fixture is incomplete.");
  assert(fixture.proof.environment === "production", "World proof is not production.");
  const verified = await request("/api/world-id/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fixture),
  });
  assert(verified.body.success === true, "World verification did not return success=true.");
  assert(verified.body.signal_matches === true, "World verification did not bind the signal.");
  assert(typeof verified.body.room_id === "string", "World verification did not bind a Room.");
  assert(
    typeof verified.body.nullifier_hash === "string" ||
      verified.body.responses?.some((response) => typeof response.nullifier === "string"),
    "World verification returned no nullifier evidence.",
  );
  return {
    room_id: verified.body.room_id,
    signal_matches: verified.body.signal_matches,
  };
});
if (worldEvidence) evidence.world = worldEvidence;

const projectionEvidence = await check("durable public projection", async () => {
  assert(roomEvidence, "Room evidence is unavailable.");
  assert(grooveEvidence, "Groove evidence is unavailable.");
  assert(worldEvidence, "World evidence is unavailable.");
  const roomId = roomEvidence.room.id;
  const projected = await request(`/api/projection/rooms/${encodeURIComponent(roomId)}`);
  assert(projected.body.room?.manifest_hash === roomEvidence.room.manifest_hash, "Projection Room mismatch.");
  assert(
    projected.body.groove?.some(
      (event) =>
        event.topic_id === grooveEvidence.topic_id &&
        event.sequence_number === grooveEvidence.sequence_number &&
        event.status === "CONFIRMED",
    ),
    "Projection does not contain independently confirmed Groove evidence.",
  );
  assert(
    !["SUCCESS", "CONFIRMED", "CAPABILITY_GRANTED"].includes(projected.body.ballot?.status) ||
      projected.body.ballot?.world_room_id === worldEvidence.room_id,
    "Projection reports formal success without Room-bound World evidence.",
  );
  return { room_id: roomId, revision: projected.body.revision ?? null };
});
if (projectionEvidence) evidence.projection = projectionEvidence;

console.log(JSON.stringify({ evidence, failures }, null, 2));
if (failures.length > 0) process.exitCode = 1;