import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { Interface, keccak256, toUtf8Bytes } from "ethers";
import { hashSignal } from "@worldcoin/idkit-core/hashing";

const RPC_URL = "https://worldchain-mainnet.g.alchemy.com/public";
const VERIFIER = "0x00000000009E00F9FE82CfeeBB4556686da094d7";
const ABI = ["function verify(uint256 nullifier,uint256 action,uint64 rpId,uint256 nonce,uint256 signalHash,uint64 expiresAtMin,uint64 issuerSchemaId,uint256 credentialGenesisIssuedAtMin,uint256[5] zeroKnowledgeProof) external view"];

function option(name) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : undefined; if (!value) throw new Error(`${name} is required.`); return value; }
async function rpc(method, params, allowError = false) { const response = await fetch(RPC_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(30_000) }); const payload = await response.json(); if (!response.ok || payload.error) { if (allowError) return { error: true }; throw new Error(`${method} failed.`); } return { result: payload.result }; }
function actionField(action) { return BigInt(keccak256(toUtf8Bytes(action))) >> 8n; }
function rpIdField(value) { if (!/^rp_[0-9a-fA-F]+$/.test(value)) throw new Error("WORLD_RP_ID is invalid."); const suffix = value.slice(3); const result = /^[0-9]+$/.test(suffix) ? BigInt(suffix) : BigInt(`0x${suffix}`); if (result > 0xffffffffffffffffn) throw new Error("WORLD_RP_ID exceeds uint64."); return result; }

const artifactPath = option("--artifact");
const outputPath = option("--out");
const rpId = process.env.WORLD_RP_ID;
if (!rpId) throw new Error("WORLD_RP_ID is required in the environment.");
const artifactBytes = await readFile(artifactPath);
const artifact = JSON.parse(artifactBytes.toString("utf8"));
const proofResponse = artifact.proof?.responses?.[0];
if (artifact.schema !== "oshikatsu-world-capture-v1" || artifact.proof?.environment !== "production" || artifact.proof?.protocol_version !== "4.0" || artifact.proof?.responses?.length !== 1 || proofResponse?.identifier !== "proof_of_human") throw new Error("Capture artifact is invalid.");
if (String(proofResponse.signal_hash).toLowerCase() !== hashSignal(artifact.binding.signal).toLowerCase()) throw new Error("Signal hash mismatch.");
const anchorNumber = BigInt(artifact.world_chain.anchor.number);
const blockTag = `0x${anchorNumber.toString(16)}`;
const [anchor, finalized] = await Promise.all([rpc("eth_getBlockByNumber", [blockTag, false]), rpc("eth_getBlockByNumber", ["finalized", false])]);
const anchorHashMatches = anchor.result?.hash?.toLowerCase() === artifact.world_chain.anchor.hash.toLowerCase();
const finalizedNumber = BigInt(finalized.result.number);
if (!anchorHashMatches) throw new Error("Anchor block hash mismatch.");
const report = { schema: "oshikatsu-world-historical-verification-v1", artifact_sha256: createHash("sha256").update(artifactBytes).digest("hex"), proof_canonical_sha256: artifact.proof_canonical_sha256, anchor_block: anchorNumber.toString(), anchor_hash: artifact.world_chain.anchor.hash, finalized_block: finalizedNumber.toString(), anchor_finalized: finalizedNumber >= anchorNumber, verifier: VERIFIER, valid_returned: false, altered_reverted: false, secrets_printed: false, verdict: "WAITING_FINALITY" };
if (report.anchor_finalized) {
  const args = [BigInt(proofResponse.nullifier), actionField(artifact.proof.action), rpIdField(rpId), BigInt(artifact.proof.nonce), BigInt(proofResponse.signal_hash), BigInt(proofResponse.expires_at_min), BigInt(proofResponse.issuer_schema_id), 0n, proofResponse.proof.map(BigInt)];
  const iface = new Interface(ABI);
  const valid = await rpc("eth_call", [{ to: VERIFIER, data: iface.encodeFunctionData("verify", args) }, blockTag], true);
  report.valid_returned = !valid.error && valid.result === "0x";
  const altered = [...args]; altered[4] ^= 1n;
  const invalid = await rpc("eth_call", [{ to: VERIFIER, data: iface.encodeFunctionData("verify", altered) }, blockTag], true);
  report.altered_reverted = invalid.error === true;
  report.verdict = report.valid_returned && report.altered_reverted ? "PASS" : "FAIL";
}
await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(report)}\n`, { mode: 0o600 }); await chmod(temporaryPath, 0o600); await rename(temporaryPath, outputPath);
console.log(JSON.stringify(report, null, 2));
if (report.verdict === "FAIL") process.exitCode = 1;