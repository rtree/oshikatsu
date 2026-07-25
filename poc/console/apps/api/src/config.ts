import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

if (process.env.NODE_ENV !== "production") {
  const sourceDirectory = fileURLToPath(new URL(".", import.meta.url));
  loadEnv({ path: resolve(sourceDirectory, "../../../../.env"), quiet: true });
}

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
  VERTEX_AI_LOCATION: z.string().min(1).default("asia-northeast1"),
  WORLD_APP_ID: z.string().startsWith("app_").optional(),
  WORLD_RP_ID: z.string().startsWith("rp_").optional(),
  WORLD_RP_SIGNING_KEY: z.string().min(1).optional(),
  ADMIN_TOKEN_AUDIENCE: z.string().min(1).optional(),
  ADMIN_ALLOWED_EMAILS: z.string().optional(),
});

export const environment = environmentSchema.parse(process.env);

export function getAdminEnvironment() {
  if (!environment.ADMIN_TOKEN_AUDIENCE || !environment.ADMIN_ALLOWED_EMAILS) {
    throw new Error("Admin API is not configured.");
  }
  return {
    audience: environment.ADMIN_TOKEN_AUDIENCE,
    allowedEmails: new Set(environment.ADMIN_ALLOWED_EMAILS.split(",").map((email) => email.trim()).filter(Boolean)),
  };
}

export function getVertexAiEnvironment() {
  if (!environment.GOOGLE_CLOUD_PROJECT) {
    throw new Error("GOOGLE_CLOUD_PROJECT is required to create a Vertex AI client.");
  }

  return {
    project: environment.GOOGLE_CLOUD_PROJECT,
    location: environment.VERTEX_AI_LOCATION,
  };
}

export function getWorldIdEnvironment() {
  const { WORLD_APP_ID, WORLD_RP_ID, WORLD_RP_SIGNING_KEY } = environment;

  if (!WORLD_APP_ID || !WORLD_RP_ID || !WORLD_RP_SIGNING_KEY) {
    throw new Error("World ID server environment is incomplete.");
  }

  return {
    appId: WORLD_APP_ID as `app_${string}`,
    rpId: WORLD_RP_ID,
    signingKey: WORLD_RP_SIGNING_KEY,
  };
}
