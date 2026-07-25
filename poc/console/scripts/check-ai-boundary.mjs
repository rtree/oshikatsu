import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageFiles = [
  "package.json",
  "apps/api/package.json",
  "apps/web/package.json",
];
const forbiddenPackages = [
  "@google/generative-ai",
  "@google-ai/generativelanguage",
];
const forbiddenEnvironmentKeys = ["GEMINI_API_KEY", "GOOGLE_API_KEY"];
const violations = [];

for (const packageFile of packageFiles) {
  const content = await readFile(resolve(root, packageFile), "utf8");
  for (const packageName of forbiddenPackages) {
    if (content.includes(`\"${packageName}\"`)) {
      violations.push(`${packageFile}: forbidden package ${packageName}`);
    }
  }
}

for (const environmentFile of ["../.env.example", "apps/web/.env.example"]) {
  const content = await readFile(resolve(root, environmentFile), "utf8");
  for (const key of forbiddenEnvironmentKeys) {
    if (new RegExp(`^${key}=`, "m").test(content)) {
      violations.push(`${environmentFile}: forbidden environment key ${key}`);
    }
  }
}

const apiPackage = JSON.parse(
  await readFile(resolve(root, "apps/api/package.json"), "utf8"),
);
if (!apiPackage.dependencies?.["@google/genai"]) {
  violations.push("apps/api/package.json: @google/genai must be the server AI SDK");
}

const vertexFactory = await readFile(
  resolve(root, "apps/api/src/vertex-ai.ts"),
  "utf8",
);
for (const requiredSource of [
  'from "@google/genai"',
  "vertexai: true",
  "client.vertexai",
]) {
  if (!vertexFactory.includes(requiredSource)) {
    violations.push(`apps/api/src/vertex-ai.ts: missing ${requiredSource}`);
  }
}
if (/apiKey\s*:/.test(vertexFactory)) {
  violations.push("apps/api/src/vertex-ai.ts: API-key authentication is forbidden");
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("AI boundary check passed: @google/genai is pinned to Vertex AI with no API-key configuration.");
}