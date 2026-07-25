import express from "express";
import { signRequest } from "@worldcoin/idkit-server";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { environment, getWorldIdEnvironment } from "./config.js";
import { getRoomAction, roomIdSchema, rooms } from "./rooms.js";

const app = express();

const proofSchema = z.object({
  protocol_version: z.literal("4.0"),
  nonce: z.string().min(1),
  action: z.string().min(1),
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
  user_presence_completed: z.literal(true),
  environment: z.literal("production"),
});

const verifyRequestSchema = z.object({
  context_token: z.string().min(1),
  signal: z.string().min(1).max(512),
  proof: proofSchema,
});

const proofRequestSchema = z.object({
  room_id: roomIdSchema,
});

const proofContextSchema = z.object({
  action: z.string().min(1),
  expires_at: z.number().int(),
  nonce: z.string().min(1),
  room_id: roomIdSchema,
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

app.get("/api/rooms", (_request, response) => {
  response.json({ rooms });
});

app.post("/api/world-id/request", (request, response) => {
  const parsed = proofRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Unknown room." });
    return;
  }

  try {
    const worldId = getWorldIdEnvironment();
    const roomId = parsed.data.room_id;
    const action = getRoomAction(roomId);
    const signature = signRequest({
      action,
      signingKeyHex: worldId.signingKey,
      ttl: 300,
    });
    const signal = `oshikatsu:${roomId}:${randomUUID()}`;

    response.json({
      action,
      app_id: worldId.appId,
      context_token: signProofContext(
        {
          action,
          expires_at: signature.expiresAt,
          nonce: signature.nonce,
          room_id: roomId,
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
  } catch {
    response.status(503).json({ error: "World ID is not configured." });
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

    response.status(verificationResponse.status).json({
      ...verification,
      room_id: context.room_id,
      signal_matches: true,
    });
  } catch {
    response.status(502).json({ success: false, code: "world_verification_unavailable" });
  }
});

app.listen(environment.PORT, "0.0.0.0", () => {
  console.log(`oshikatsu-api listening on port ${environment.PORT}`);
});
