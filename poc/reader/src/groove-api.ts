export type GroovePreparation = {
  id: string;
  room_id: string;
  work_id: string;
  topic_id: string;
  account_id: string;
  message_base64: string;
  message_bytes: number;
  event_hash: string;
  expires_at: string;
};

export type GrooveStatus =
  | { status: "PENDING" }
  | { status: "INVALID"; reason: string }
  | {
      status: "CONFIRMED";
      transaction_id: string;
      topic_id: string;
      payer_account_id: string;
      sequence_number: number;
      consensus_timestamp: string;
      message_bytes: number;
      event_hash: string;
    };

export class GrooveConfirmationTimeoutError extends Error {
  constructor() {
    super("Mirror confirmation timed out. Retry confirmation without submitting another Shout.");
    this.name = "GrooveConfirmationTimeoutError";
  }
}

async function jsonRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { Accept: "application/json", ...options?.headers },
  });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed with HTTP ${response.status}.`);
  return body;
}

export async function prepareGroove(input: {
  room_id: string;
  work_id: string;
  account_id: string;
  reaction_id: string;
  shout?: string;
}) {
  const body = await jsonRequest<{ preparation: GroovePreparation }>("/api/groove/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return body.preparation;
}

export async function waitForGrooveConfirmation(preparationId: string, transactionId: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const status = await jsonRequest<GrooveStatus>(
      `/api/groove/status/${encodeURIComponent(transactionId)}?prepare_id=${encodeURIComponent(preparationId)}`,
    );
    if (status.status === "CONFIRMED") return status;
    if (status.status === "INVALID") throw new Error(`Mirror rejected the event: ${status.reason}.`);
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new GrooveConfirmationTimeoutError();
}