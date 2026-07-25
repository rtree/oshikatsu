import type { IDKitResult, RpContext } from "@worldcoin/idkit";

export type BallotRequest = {
  app_id: `app_${string}`;
  action: string;
  action_description: string;
  signal: string;
  context_token: string;
  rp_context: RpContext;
};

export type BallotPreparation = {
  id: string;
  room_id: string;
  nominee_ids: [string, string, string];
  topic_id: string;
  account_id: string;
  message_base64: string;
  message_bytes: number;
  event_hash: string;
};

export type BallotCapability = {
  status: "CAPABILITY_GRANTED";
  room_id: string;
  account_id: string;
  nominee_ids: [string, string, string];
  transaction_id: string;
  sequence_number: number;
  consensus_timestamp: string;
  event_hash: string;
  world_evidence_hash: string;
};

async function requestJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Ballot request returned HTTP ${response.status}.`);
  return payload;
}

export function requestBallotProof(roomId: string, accountId: string, nomineeIds: [string, string, string]) {
  return requestJson<BallotRequest>("/api/ballots/request", { room_id: roomId, account_id: accountId, nominee_ids: nomineeIds });
}

export async function prepareBallot(request: BallotRequest, proof: IDKitResult) {
  const result = await requestJson<{ preparation: BallotPreparation }>("/api/ballots/prepare", { context_token: request.context_token, signal: request.signal, proof });
  return result.preparation;
}

export async function waitForCapability(preparationId: string, transactionId: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const status = await requestJson<BallotCapability | { status: "PENDING" } | { status: "INVALID"; reason: string }>(`/api/ballots/status/${encodeURIComponent(transactionId)}?prepare_id=${encodeURIComponent(preparationId)}`);
    if (status.status === "CAPABILITY_GRANTED") return status;
    if (status.status === "INVALID") throw new Error(`Ballot rejected: ${status.reason}.`);
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error("Ballot confirmation timed out.");
}