import type { IDKitResult, RpContext } from "@worldcoin/idkit";

export type GrooveWorldRequest = {
  action: string;
  action_description: string;
  app_id: `app_${string}`;
  context_token: string;
  rp_context: RpContext;
  room_id: string;
  signal: string;
};

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new Error(body.error ?? body.code ?? `World ID request returned HTTP ${response.status}.`);
  return body;
}

export async function requestGrooveWorldProof(roomId: string, accountId: string) {
  const response = await fetch("/api/world-id/request", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ room_id: roomId, account_id: accountId }),
  });
  return responseJson<GrooveWorldRequest>(response);
}

export async function verifyGrooveWorldProof(request: GrooveWorldRequest, proof: IDKitResult) {
  const response = await fetch("/api/world-id/verify", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ context_token: request.context_token, proof, signal: request.signal }),
  });
  const result = await responseJson<{ success?: boolean }>(response);
  if (result.success !== true) throw new Error("World ID did not verify this first Shout.");
}