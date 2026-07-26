import express from "express";
import { signRequest } from "@worldcoin/idkit-server";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { requireAdmin } from "./admin-auth.js";
import { environment, getWorldIdEnvironment } from "./config.js";
import { ballotPrepareSchema, ballotRequestSchema, ballotV2ArtifactPrepareSchema, ballotV2ManualPrepareSchema, createBallotRequest, getBallotPreparation, getBallotStatus, prepareBallot, prepareBallotV2FromArtifact } from "./ballots.js";
import { addVerificationObservation, projectBallotRankings, verificationObservationSchema } from "./ballot-projection.js";
import { getGrooveStatus, groovePrepareSchema, listConfirmedGroove, prepareGroove, rankRoomWorks, recordGrooveWorldGrant } from "./groove.js";
import { archiveDemoRoom, archiveRoom, createAdminRoom, createDemoRoom, createDemoRoomRequestSchema, createRoom, createRoomSchema, getAdminRoom, getRoom, getRoomAction, listActions, listAdminRooms, listDemoRooms, listRooms, requireRoomAction, retireAction, roomIdSchema } from "./rooms.js";

const app = express();

const proofSchema = z.object({
  protocol_version: z.literal("4.0"),
  nonce: z.string().min(1),
  action: z.string().min(1),
  action_description: z.string().min(1).optional(),
  responses: z
    .array(
      z.object({
        identifier: z.literal("proof_of_human"),
        signal_hash: z.string().min(1),
        proof: z.array(z.string().min(1)).length(5),
        nullifier: z.string().min(1),
        issuer_schema_id: z.literal(1),
        expires_at_min: z.number().int(),
      }),
    )
    .min(1),
  user_presence_completed: z.boolean(),
  environment: z.literal("production"),
});

const verifyRequestSchema = z.object({
  context_token: z.string().min(1),
  signal: z.string().min(1).max(512),
  proof: proofSchema,
});

const proofRequestSchema = z.object({
  room_id: roomIdSchema,
  account_id: z.string().regex(/^0\.0\.\d+$/).optional(),
});

const proofContextSchema = z.object({
  action: z.string().min(1),
  expires_at: z.number().int(),
  nonce: z.string().min(1),
  presence_required: z.boolean(),
  room_id: roomIdSchema,
  manifest_hash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  account_id: z.string().regex(/^0\.0\.\d+$/).optional(),
  signal: z.string().min(1).max(512),
});

function signProofContext(payload: z.infer<typeof proofContextSchema>, signingKey: string) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", signingKey).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyProofContext(token: string, signingKey: string) {
  const [encodedPayload, suppliedSignature, ...extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra.length > 0) {
    return null;
  }

  const expectedSignature = createHmac("sha256", signingKey)
    .update(encodedPayload)
    .digest("base64url");
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    return proofContextSchema.parse(JSON.parse(Buffer.from(encodedPayload, "base64url").toString()));
  } catch {
    return null;
  }
}

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "oshikatsu-api",
  });
});

app.use("/api/admin", requireAdmin);

function adminError(response: express.Response, error: unknown) {
  const message = error instanceof Error ? error.message : "ADMIN_OPERATION_FAILED";
  const status = message.includes("NOT_FOUND") ? 404 : message.includes("MISMATCH") || message.includes("IDEMPOTENCY_CONFLICT") ? 412 : message.includes("PROTECTED") ? 409 : 400;
  response.status(status).json({ error: message });
}

function operationError(response: express.Response, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message === "ROOM_ARCHIVED" || message === "ACTION_RETIRED") {
    response.status(409).json({ error: message });
    return;
  }
  response.status(400).json({ error: message });
}

function demoOwner(request: express.Request, response: express.Response) {
  const suppliedSession = request.header("x-demo-session");
  if (suppliedSession && /^[0-9a-f-]{36}$/.test(suppliedSession)) {
    return createHash("sha256").update(suppliedSession).digest("hex");
  }
  const cookies = new Map((request.header("cookie") ?? "").split(";").flatMap((entry) => {
    const separator = entry.indexOf("=");
    return separator < 0 ? [] : [[entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()]];
  }));
  let session = cookies.get("oshikatsu_demo_session");
  if (!session || !/^[0-9a-f-]{36}$/.test(session)) {
    session = randomUUID();
    response.append("Set-Cookie", `oshikatsu_demo_session=${session}; Max-Age=86400; Path=/api/demo; HttpOnly; Secure; SameSite=Strict`);
  }
  return createHash("sha256").update(session).digest("hex");
}

app.post("/api/admin/rooms", async (request, response) => {
  const parsed = createRoomSchema.safeParse(request.body);
  const key = request.header("idempotency-key") ?? "";
  if (!parsed.success) { response.status(400).json({ error: "Invalid Room manifest input.", issues: parsed.error.issues }); return; }
  try { response.status(201).json(await createAdminRoom(parsed.data, key, response.locals.adminEmail)); } catch (error) { adminError(response, error); }
});

app.get("/api/admin/rooms", async (_request, response) => {
  try { response.json({ rooms: await listAdminRooms() }); } catch (error) { adminError(response, error); }
});

app.get("/api/admin/rooms/:roomId", async (request, response) => {
  try { const result = await getAdminRoom(request.params.roomId); if (!result) { response.status(404).json({ error: "ROOM_NOT_FOUND" }); return; } response.json(result); } catch (error) { adminError(response, error); }
});

app.delete("/api/admin/rooms/:roomId", async (request, response) => {
  const reason = typeof request.body?.reason === "string" ? request.body.reason : "";
  if (reason.length < 3) { response.status(400).json({ error: "Archive reason is required." }); return; }
  try { response.json(await archiveRoom(request.params.roomId, (request.header("if-match") ?? "").replaceAll('"', ""), request.header("x-confirm-room-id") ?? "", reason, response.locals.adminEmail)); } catch (error) { adminError(response, error); }
});

app.get("/api/admin/actions", async (request, response) => {
  try { response.json({ actions: await listActions(typeof request.query.room_id === "string" ? request.query.room_id : undefined) }); } catch (error) { adminError(response, error); }
});

app.get("/api/admin/actions/:actionId", async (request, response) => {
  try { const action = (await listActions()).find((candidate) => candidate.id === request.params.actionId); if (!action) { response.status(404).json({ error: "ACTION_NOT_FOUND" }); return; } response.json({ action }); } catch (error) { adminError(response, error); }
});

app.delete("/api/admin/actions/:actionId", async (request, response) => {
  try { response.json(await retireAction(request.params.actionId, (request.header("if-match") ?? "").replaceAll('"', ""), request.header("x-confirm-action-id") ?? "", response.locals.adminEmail)); } catch (error) { adminError(response, error); }
});

app.post("/api/admin/ballots/:eventHash/verification-observations", async (request, response) => {
  if (!/^[0-9a-f]{64}$/.test(request.params.eventHash)) { response.status(400).json({ error: "Invalid ballot event hash." }); return; }
  const parsed = verificationObservationSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Invalid verification observation.", issues: parsed.error.issues }); return; }
  try { await addVerificationObservation(request.params.eventHash, parsed.data); response.status(201).json({ accepted: true, event_hash: request.params.eventHash, report_hash: parsed.data.report_hash }); } catch (error) { adminError(response, error); }
});

app.post("/api/admin/ballots/v2/prepare-from-artifact", async (request, response) => {
  const parsed = ballotV2ArtifactPrepareSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Invalid Ballot v2 artifact input.", issues: parsed.error.issues }); return; }
  try { response.status(201).json({ preparation: await prepareBallotV2FromArtifact(parsed.data) }); } catch (error) { adminError(response, error); }
});

app.get("/api/demo/rooms", async (request, response) => {
  try { response.json({ rooms: await listDemoRooms(demoOwner(request, response)) }); } catch { response.status(503).json({ error: "Demo Room storage is unavailable." }); }
});

app.post("/api/demo/rooms", async (request, response) => {
  const parsed = createDemoRoomRequestSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Invalid DEMO Room duration." }); return; }
  try {
    const ownerHash = demoOwner(request, response);
    if ((await listDemoRooms(ownerHash)).length >= 3) { response.status(409).json({ error: "DEMO_ROOM_LIMIT_REACHED" }); return; }
    response.status(201).json(await createDemoRoom(ownerHash, request.header("idempotency-key") ?? randomUUID(), parsed.data.duration));
  } catch (error) { operationError(response, error, "Demo Room creation failed."); }
});

app.delete("/api/demo/rooms/:roomId", async (request, response) => {
  const manifestHash = (request.header("if-match") ?? "").replaceAll('"', "");
  if (!/^[0-9a-f]{64}$/.test(manifestHash)) { response.status(400).json({ error: "A valid manifest hash is required." }); return; }
  try { response.json(await archiveDemoRoom(request.params.roomId, demoOwner(request, response), manifestHash)); } catch (error) { operationError(response, error, "Demo Room archive failed."); }
});

app.get("/api/rooms", async (_request, response) => {
  try {
    response.json({ rooms: await listRooms() });
  } catch {
    response.status(503).json({ error: "Room storage is unavailable." });
  }
});

app.post("/api/rooms", async (request, response) => {
  const parsed = createRoomSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid Room manifest input.", issues: parsed.error.issues });
    return;
  }
  try {
    const result = await createAdminRoom(parsed.data, request.header("idempotency-key") ?? randomUUID(), "public-room-creator");
    response.status(201).json({ room: result.room, actions: result.actions, replayed: result.replayed });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Room creation failed." });
  }
});

app.get("/api/rooms/:roomId", async (request, response) => {
  try {
    const room = await getRoom(request.params.roomId);
    if (!room) {
      response.status(404).json({ error: "Room not found." });
      return;
    }
    response.json({ room });
  } catch {
    response.status(400).json({ error: "Invalid Room id." });
  }
});

app.post("/api/groove/prepare", async (request, response) => {
  const parsed = groovePrepareSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid Groove input.", issues: parsed.error.issues });
    return;
  }
  try {
    response.status(201).json({ preparation: await prepareGroove(parsed.data) });
  } catch (error) {
    operationError(response, error, "Groove preparation failed.");
  }
});

app.get("/api/groove/status/:transactionId", async (request, response) => {
  const prepareId = typeof request.query.prepare_id === "string" ? request.query.prepare_id : "";
  if (!/^groove-[0-9a-f]{32}$/.test(prepareId)) {
    response.status(400).json({ error: "A valid prepare_id is required." });
    return;
  }
  try {
    response.json(await getGrooveStatus(prepareId, request.params.transactionId));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Groove status failed." });
  }
});

app.get("/api/projection/rooms/:roomId", async (request, response) => {
  try {
    const room = await getRoom(request.params.roomId);
    if (!room) {
      response.status(404).json({ error: "Room not found." });
      return;
    }
    const groove = await listConfirmedGroove(room.id, room.opens_at, room.deadline);
    const { capabilities, ...rankings } = await projectBallotRankings(room.id, room.works.map((work) => work.id));
    response.json({
      room,
      groove,
      ranking: rankRoomWorks(room.id, room.works.map((work) => work.id), groove),
      confirmed_shout_count: groove.filter((event) => event.projection_state === "CURRENT").length,
      ballot: { status: "OPTIMISTIC", rankings, capabilities },
      revision: new Date().toISOString(),
    });
  } catch {
    response.status(400).json({ error: "Invalid Room projection request." });
  }
});

app.post("/api/ballots/request", async (request, response) => {
  const parsed = ballotRequestSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Invalid ballot intent." }); return; }
  try { response.json(await createBallotRequest(parsed.data)); } catch (error) { operationError(response, error, "Ballot request failed."); }
});

app.post("/api/ballots/prepare", async (request, response) => {
  const parsed = ballotPrepareSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Invalid ballot proof." }); return; }
  try { response.status(201).json({ preparation: await prepareBallot(parsed.data) }); } catch (error) { operationError(response, error, "Ballot preparation failed."); }
});

app.post("/api/ballots/v2/prepare-from-artifact", async (request, response) => {
  const parsed = ballotV2ManualPrepareSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Invalid Ballot v2 artifact input.", issues: parsed.error.issues }); return; }
  try { response.status(201).json({ preparation: await prepareBallotV2FromArtifact(parsed.data) }); } catch (error) { operationError(response, error, "Ballot v2 preparation failed."); }
});

app.get("/api/ballots/status/:transactionId", async (request, response) => {
  const prepareId = typeof request.query.prepare_id === "string" ? request.query.prepare_id : "";
  if (!/^ballot-[0-9a-f]{32}$/.test(prepareId)) { response.status(400).json({ error: "A valid prepare_id is required." }); return; }
  try { response.json(await getBallotStatus(prepareId, request.params.transactionId)); } catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : "Ballot status failed." }); }
});

app.get("/api/ballots/preparations/:prepareId", async (request, response) => {
  try { const preparation = await getBallotPreparation(request.params.prepareId); if (!preparation) { response.status(404).json({ error: "Ballot preparation not found." }); return; } response.json({ preparation }); } catch (error) { operationError(response, error, "Ballot preparation failed."); }
});

app.post("/api/world-id/request", async (request, response) => {
  const parsed = proofRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Unknown room." });
    return;
  }

  try {
    const worldId = getWorldIdEnvironment();
    const roomId = parsed.data.room_id;
    const room = await getRoom(roomId);
    if (!room) {
      response.status(404).json({ error: "Unknown room." });
      return;
    }
    await requireRoomAction(room.id, "ROOM_PROOF_LEGACY");
    const action = getRoomAction(roomId);
    const signature = signRequest({
      action,
      signingKeyHex: worldId.signingKey,
      ttl: 300,
    });
    const accountId = parsed.data.account_id;
    const signal = accountId
      ? `oshikatsu:groove-world:v1:${roomId}:${room.manifest_hash}:${accountId}:${randomUUID()}`
      : `oshikatsu:${roomId}:${randomUUID()}`;

    response.json({
      action,
      action_description: room.action_description,
      app_id: worldId.appId,
      context_token: signProofContext(
        {
          action,
          expires_at: signature.expiresAt,
          nonce: signature.nonce,
          presence_required: false,
          room_id: roomId,
          manifest_hash: room.manifest_hash,
          ...(accountId ? { account_id: accountId } : {}),
          signal,
        },
        worldId.signingKey,
      ),
      rp_context: {
        rp_id: worldId.rpId,
        nonce: signature.nonce,
        created_at: signature.createdAt,
        expires_at: signature.expiresAt,
        signature: signature.sig,
      },
      room_id: roomId,
      signal,
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "ROOM_ARCHIVED" || error.message === "ACTION_RETIRED")) {
      response.status(409).json({ error: error.message });
    } else {
      response.status(503).json({ error: "World ID is not configured." });
    }
  }
});

app.post("/api/world-id/verify", async (request, response) => {
  const parsed = verifyRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ success: false, code: "invalid_proof_payload" });
    return;
  }

  try {
    const worldId = getWorldIdEnvironment();
    const { context_token: contextToken, proof, signal } = parsed.data;
    const context = verifyProofContext(contextToken, worldId.signingKey);
    if (context) await requireRoomAction(context.room_id, "ROOM_PROOF_LEGACY");
    const expectedAction = context ? getRoomAction(context.room_id) : null;
    const expectedSignalHash = hashSignal(signal);
    const signalMatches = proof.responses.every(
      (proofResponse) => proofResponse.signal_hash === expectedSignalHash,
    );

    if (
      !context ||
      context.expires_at < Math.floor(Date.now() / 1000) ||
      context.action !== expectedAction ||
      context.nonce !== proof.nonce ||
      context.signal !== signal ||
      proof.action !== expectedAction ||
      (context.presence_required && !proof.user_presence_completed) ||
      !signalMatches
    ) {
      response.status(400).json({ success: false, code: "proof_context_mismatch" });
      return;
    }

    const verificationResponse = await fetch(
      `https://developer.world.org/api/v4/verify/${encodeURIComponent(worldId.rpId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proof),
      },
    );
    const verification = (await verificationResponse.json()) as Record<string, unknown>;

    if (verificationResponse.ok && verification.success === true && context.account_id && context.manifest_hash) {
      const room = await getRoom(context.room_id);
      if (!room || room.manifest_hash !== context.manifest_hash) {
        response.status(409).json({ success: false, code: "room_manifest_changed" });
        return;
      }
      const nullifier = proof.responses[0]?.nullifier;
      if (!nullifier) {
        response.status(400).json({ success: false, code: "missing_nullifier" });
        return;
      }
      await recordGrooveWorldGrant(context.room_id, context.manifest_hash, context.account_id, nullifier);
    }

    response.status(verificationResponse.status).json({
      ...verification,
      room_id: context.room_id,
      account_id: context.account_id,
      signal_matches: true,
    });
  } catch {
    response.status(502).json({ success: false, code: "world_verification_unavailable" });
  }
});

app.listen(environment.PORT, "0.0.0.0", () => {
  console.log(`oshikatsu-api listening on port ${environment.PORT}`);
});
