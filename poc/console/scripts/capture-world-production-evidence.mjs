import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { keccak256 } from "ethers";

const RPC_URL = "https://worldchain-mainnet.g.alchemy.com/public";
const VERIFIER_PROXY = "0x00000000009E00F9FE82CfeeBB4556686da094d7";
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

function option(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function rpc(method, params) {
  const response = await fetch(RPC_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(30_000) });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(`${method} failed: ${payload.error?.message ?? response.status}`);
  return payload.result;
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function decimal(hex) { return BigInt(hex).toString(10); }
function implementationAddress(slot) { return `0x${slot.slice(-40)}`; }

const proofPath = option("--proof-file");
const bindingPath = option("--binding-file");
const outputPath = option("--out");
const proofBytes = await readFile(proofPath);
const proof = JSON.parse(proofBytes.toString("utf8"));
const binding = JSON.parse(await readFile(bindingPath, "utf8"));
if (proof.environment !== "production" || proof.protocol_version !== "4.0" || proof.responses?.length !== 1 || proof.responses[0]?.identifier !== "proof_of_human") throw new Error("Proof fixture is not one production v4 proof_of_human response.");
if (!binding.room_id || !binding.account_id || !Array.isArray(binding.nominee_ids) || binding.nominee_ids.length !== 3 || !binding.action || !binding.signal) throw new Error("Binding fixture is incomplete.");

const [chainId, anchor, finalized] = await Promise.all([
  rpc("eth_chainId", []),
  rpc("eth_getBlockByNumber", ["latest", false]),
  rpc("eth_getBlockByNumber", ["finalized", false]),
]);
if (decimal(chainId) !== "480") throw new Error("RPC is not World Chain mainnet.");
const blockTag = anchor.number;
const [proxyCode, implementationSlot] = await Promise.all([
  rpc("eth_getCode", [VERIFIER_PROXY, blockTag]),
  rpc("eth_getStorageAt", [VERIFIER_PROXY, IMPLEMENTATION_SLOT, blockTag]),
]);
const implementation = implementationAddress(implementationSlot);
const implementationCode = await rpc("eth_getCode", [implementation, blockTag]);
const anchorAgain = await rpc("eth_getBlockByNumber", [blockTag, false]);
if (anchorAgain.hash !== anchor.hash) throw new Error("World anchor hash changed during capture.");

const artifact = {
  schema: "oshikatsu-world-capture-v1",
  protocol_version: "4.0",
  environment: "production",
  captured_at: new Date().toISOString(),
  binding: {
    room_id: binding.room_id,
    account_id: binding.account_id,
    nominee_ids: binding.nominee_ids,
    action: binding.action,
    signal: binding.signal,
  },
  proof,
  proof_canonical_sha256: sha256(proofBytes),
  raw_persisted_locally: true,
  world_chain: {
    chain_id: 480,
    rpc: RPC_URL,
    anchor: { number: decimal(anchor.number), hash: anchor.hash, parent_hash: anchor.parentHash, state_root: anchor.stateRoot, timestamp: decimal(anchor.timestamp) },
    finalized_head: { number: decimal(finalized.number), hash: finalized.hash },
  },
  contracts: [{
    role: "world_id_verifier",
    proxy: VERIFIER_PROXY,
    implementation,
    proxy_runtime_keccak256: keccak256(proxyCode),
    implementation_runtime_keccak256: keccak256(implementationCode),
  }],
  onchain_verification: { status: "NOT_RUN" },
};
const bytes = Buffer.from(`${JSON.stringify(artifact)}\n`);
await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, bytes, { mode: 0o600 });
await chmod(temporaryPath, 0o600);
await rename(temporaryPath, outputPath);
console.log(JSON.stringify({ output: outputPath, bytes: bytes.length, artifact_sha256: sha256(bytes), anchor_block: artifact.world_chain.anchor.number, anchor_hash: artifact.world_chain.anchor.hash, finalized_block: artifact.world_chain.finalized_head.number, raw_proof_printed: false }, null, 2));