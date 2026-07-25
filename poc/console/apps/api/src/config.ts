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
});

export const environment = environmentSchema.parse(process.env);

export function getVertexAiEnvironment() {
  if (!environment.GOOGLE_CLOUD_PROJECT) {
    throw new Error("GOOGLE_CLOUD_PROJECT is required to create a Vertex AI client.");
  }

  return {
    project: environment.GOOGLE_CLOUD_PROJECT,
    location: environment.VERTEX_AI_LOCATION,
  };
}
