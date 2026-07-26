import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { decodeWorldArtifact, worldArtifactSha256 } from "@oshikatsu/protocol";

const args = process.argv.slice(2);
const apiBase = process.env.OSHIKATSU_ADMIN_API ?? "https://oshikatsu-api-m74bxsqz7a-an.a.run.app";
const tokenAudience = process.env.OSHIKATSU_ADMIN_AUDIENCE;
const dryRun = args.includes("--dry-run");
const filtered = args.filter((arg) => arg !== "--dry-run");

function option(name, required = false) {
  const index = filtered.indexOf(name);
  const value = index >= 0 ? filtered[index + 1] : undefined;
  if (required && !value) throw new Error(`${name} is required.`);
  return value;
}

function token() {
  return execFileSync("gcloud", ["auth", "print-identity-token", ...(tokenAudience ? [`--audiences=${tokenAudience}`] : [])], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

async function call(path, { method = "GET", body, headers = {} } = {}) {
  if (dryRun) {
    console.log(JSON.stringify({ dry_run: true, method, url: new URL(path, apiBase).href, headers: Object.keys(headers), body }, null, 2));
    return;
  }
  const response = await fetch(new URL(path, apiBase), {
    method,
    headers: { Accept: "application/json", Authorization: `Bearer ${token()}`, ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : { error: await response.text() || `HTTP ${response.status}` };
  console.log(JSON.stringify(payload, null, 2));
  if (!response.ok) process.exitCode = response.status === 401 || response.status === 403 ? 4 : response.status === 409 || response.status === 412 ? 3 : 2;
}

function usage() {
  console.log(`Usage:
  npm run admin -- room create --file room.json [--idempotency-key key] [--dry-run]
  npm run admin -- room list
  npm run admin -- room get <room-id>
  npm run admin -- room archive <room-id> --if-match <hash> --confirm <room-id> --reason <text> [--dry-run]
  npm run admin -- action list [--room <room-id>]
  npm run admin -- action get <action-id>
  npm run admin -- action retire <action-id> --if-match <hash> --confirm <action-id> [--dry-run]
  npm run admin -- ballot prepare-v2 --artifact <local-file> --reference <commit-fixed-url> [--dry-run]`);
}

const [resource, command, id] = filtered;
try {
  if (resource === "room" && command === "create") {
    const body = JSON.parse(await readFile(option("--file", true), "utf8"));
    await call("/api/admin/rooms", { method: "POST", body, headers: { "Idempotency-Key": option("--idempotency-key") ?? randomUUID() } });
  } else if (resource === "room" && command === "list") await call("/api/admin/rooms");
  else if (resource === "room" && command === "get" && id) await call(`/api/admin/rooms/${encodeURIComponent(id)}`);
  else if (resource === "room" && command === "archive" && id) await call(`/api/admin/rooms/${encodeURIComponent(id)}`, { method: "DELETE", body: { reason: option("--reason", true) }, headers: { "If-Match": option("--if-match", true), "X-Confirm-Room-Id": option("--confirm", true) } });
  else if (resource === "action" && command === "list") await call(`/api/admin/actions${option("--room") ? `?room_id=${encodeURIComponent(option("--room"))}` : ""}`);
  else if (resource === "action" && command === "get" && id) await call(`/api/admin/actions/${encodeURIComponent(id)}`);
  else if (resource === "action" && command === "retire" && id) await call(`/api/admin/actions/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "If-Match": option("--if-match", true), "X-Confirm-Action-Id": option("--confirm", true) } });
  else if (resource === "ballot" && command === "prepare-v2") {
    const bytes = await readFile(option("--artifact", true));
    decodeWorldArtifact(bytes);
    await call("/api/admin/ballots/v2/prepare-from-artifact", { method: "POST", body: { artifact_sha256: worldArtifactSha256(bytes), artifact_reference: option("--reference", true) } });
  }
  else usage();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}