import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { encodeWorldArtifact, worldArtifactSha256 } from "@oshikatsu/protocol";

function option(name) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : undefined; if (!value) throw new Error(`${name} is required.`); return value; }

const capturePath = option("--capture");
const outputPath = option("--out");
const capture = JSON.parse(await readFile(capturePath, "utf8"));
if (capture.schema !== "oshikatsu-world-capture-v1" || capture.proof?.environment !== "production" || capture.proof?.protocol_version !== "4.0") throw new Error("Capture artifact is invalid.");
const canonical = {
  schema: "oshikatsu-world-artifact-v1",
  room_id: capture.binding.room_id,
  manifest_hash: option("--manifest-hash"),
  nominee_ids: capture.binding.nominee_ids,
  account_id: capture.binding.account_id,
  action: capture.binding.action,
  signal: capture.binding.signal,
  anchor: {
    block_number: capture.world_chain.anchor.number,
    block_hash: capture.world_chain.anchor.hash,
    block_timestamp: capture.world_chain.anchor.timestamp,
  },
  proof: {
    protocol_version: capture.proof.protocol_version,
    nonce: capture.proof.nonce,
    action: capture.proof.action,
    responses: capture.proof.responses,
    user_presence_completed: capture.proof.user_presence_completed,
    environment: capture.proof.environment,
  },
};
const bytes = Buffer.from(encodeWorldArtifact(canonical));
await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, bytes, { mode: 0o600 }); await chmod(temporaryPath, 0o600); await rename(temporaryPath, outputPath);
console.log(JSON.stringify({ output: outputPath, bytes: bytes.length, artifact_sha256: worldArtifactSha256(bytes), raw_proof_printed: false }, null, 2));