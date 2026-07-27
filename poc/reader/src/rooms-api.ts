export type RoomWork = {
  id: string;
  title: string;
  chapter: string;
  cover_url: string;
  hero_url: string | null;
  reading_url: string;
};

export type Room = {
  id: string;
  name: string;
  room_type: "MANGA" | "SPECIAL_TEAM";
  action_description: string;
  world_action: string;
  opens_at: string;
  deadline: string;
  topic_id: string;
  works: RoomWork[];
  manifest_hash: string;
  phase: "UPCOMING" | "LIVE" | "CLOSED";
  created_at: string;
};

export type ConfirmedGrooveEvent = {
  status: "CONFIRMED";
  prepare_id: string;
  room_id: string;
  work_id: string;
  transaction_id: string;
  topic_id: string;
  payer_account_id: string;
  sequence_number: number;
  consensus_timestamp: string;
  message_base64: string;
  message_bytes: number;
  event_hash: string;
  window_status?: "IN_WINDOW" | "LATE";
  projection_state?: "CURRENT" | "LATE";
};

export type DemoRoomDuration = "2m" | "3m" | "5m" | "10m" | "1h" | "1d";

export type BallotCapabilityStatus =
  | "CAPABILITY_GRANTED"
  | "EVIDENCE_NOT_VERIFIED"
  | "UNIQUENESS_UNVERIFIABLE"
  | "NULLIFIER_CONFLICT"
  | "PAYER_CONFLICT"
  | "NULLIFIER_AND_PAYER_CONFLICT";

export type BallotCapability = {
  room_id: string;
  event_hash: string;
  payer_account_id: string;
  nullifier_commitment: string | null;
  sequence_number: number;
  event_type: "INITIAL" | "UPDATE" | "WITHDRAW";
  status: BallotCapabilityStatus;
  capability_granted: boolean;
  conflicts_with: string[];
};

export type RoomProjection = {
  room: Room;
  groove: ConfirmedGrooveEvent[];
  ranking: Array<{ rank: number; work_id: string; shout_count: number; tied: boolean }>;
  confirmed_shout_count: number;
  ballot: {
    status: string;
    capabilities: BallotCapability[];
    rankings: {
      policy: { policy_id: string; position_points: [number, number, number]; binding: "PREVIEW" };
      provisional: { label: string; includes: string[]; result_hash: string; entries: FormalRankingEntry[] };
      verified: { label: string; includes: string[]; result_hash: string; entries: FormalRankingEntry[] };
      summary: { recorded_unverified: number; unverifiable: number; verified: number; invalid: number };
    };
  };
  revision: string;
};

export type FormalRankingEntry = {
  nominee_id: string;
  rank: number;
  points: number;
  first_place_count: number;
  second_place_count: number;
  third_place_count: number;
  tied: boolean;
};

const demoSessionStorageKey = "oshikatsu:demo-session:v1";

function demoSession() {
  let value = localStorage.getItem(demoSessionStorageKey);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(demoSessionStorageKey, value);
  }
  return value;
}

function isRoom(value: unknown): value is Room {
  if (!value || typeof value !== "object") return false;
  const room = value as Partial<Room>;
  return typeof room.id === "string" &&
    typeof room.name === "string" &&
    (room.room_type === "MANGA" || room.room_type === "SPECIAL_TEAM") &&
    typeof room.manifest_hash === "string" &&
    Array.isArray(room.works) &&
    room.works.every((work) =>
      work && typeof work.id === "string" && typeof work.title === "string" &&
      typeof work.chapter === "string" && typeof work.cover_url === "string" &&
      typeof work.reading_url === "string");
}

function isBallotCapability(value: unknown): value is BallotCapability {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const capability = value as Partial<BallotCapability>;
  const statuses: BallotCapabilityStatus[] = ["CAPABILITY_GRANTED", "EVIDENCE_NOT_VERIFIED", "UNIQUENESS_UNVERIFIABLE", "NULLIFIER_CONFLICT", "PAYER_CONFLICT", "NULLIFIER_AND_PAYER_CONFLICT"];
  return typeof capability.room_id === "string" &&
    typeof capability.event_hash === "string" && /^[0-9a-f]{64}$/.test(capability.event_hash) &&
    typeof capability.payer_account_id === "string" && /^0\.0\.\d+$/.test(capability.payer_account_id) &&
    (capability.nullifier_commitment === null || typeof capability.nullifier_commitment === "string") &&
    Number.isInteger(capability.sequence_number) &&
    ["INITIAL", "UPDATE", "WITHDRAW"].includes(String(capability.event_type)) &&
    statuses.includes(capability.status as BallotCapabilityStatus) &&
    typeof capability.capability_granted === "boolean" &&
    capability.capability_granted === (capability.status === "CAPABILITY_GRANTED") &&
    Array.isArray(capability.conflicts_with) && capability.conflicts_with.every((hash) => typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash));
}

export async function fetchRooms(signal?: AbortSignal) {
  const response = await fetch("/api/rooms", { headers: { Accept: "application/json" }, signal });
  if (!response.ok) throw new Error(`Room service returned HTTP ${response.status}.`);
  const payload = await response.json() as { rooms?: unknown };
  if (!Array.isArray(payload.rooms) || !payload.rooms.every(isRoom)) {
    throw new Error("Room service returned an invalid response.");
  }
  return payload.rooms;
}

export async function fetchRoomProjection(roomId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/projection/rooms/${encodeURIComponent(roomId)}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(`Projection service returned HTTP ${response.status}.`);
  const projection = await response.json() as RoomProjection;
  if (!isRoom(projection.room) || !Array.isArray(projection.groove) || !Array.isArray(projection.ranking) ||
    !projection.ranking.every((entry) => Number.isInteger(entry.rank) && typeof entry.work_id === "string" && Number.isInteger(entry.shout_count) && typeof entry.tied === "boolean") ||
    !Number.isInteger(projection.confirmed_shout_count) || !projection.ballot || !Array.isArray(projection.ballot.capabilities) ||
    !projection.ballot.capabilities.every(isBallotCapability)) {
    throw new Error("Projection service returned an invalid response.");
  }
  return projection;
}

export async function createRoom(input: {
  name: string;
  opens_at: string;
  deadline: string;
  topic_id: string;
  works: RoomWork[];
}) {
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(input),
  });
  const payload = await response.json() as { room?: unknown; error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Room creation returned HTTP ${response.status}.`);
  if (!isRoom(payload.room)) throw new Error("Room creation returned an invalid response.");
  return payload.room;
}

export async function fetchDemoRooms() {
  const response = await fetch("/api/demo/rooms", { headers: { Accept: "application/json", "X-Demo-Session": demoSession() }, credentials: "same-origin", cache: "no-store" });
  const payload = await response.json() as { rooms?: unknown; error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Demo Room list returned HTTP ${response.status}.`);
  if (!Array.isArray(payload.rooms) || !payload.rooms.every(isRoom)) throw new Error("Demo Room list returned an invalid response.");
  return payload.rooms;
}

export async function createDemoRoom(duration: DemoRoomDuration) {
  const response = await fetch("/api/demo/rooms", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), "X-Demo-Session": demoSession() },
    credentials: "same-origin",
    body: JSON.stringify({ duration }),
  });
  const payload = await response.json() as { room?: unknown; error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Demo Room creation returned HTTP ${response.status}.`);
  if (!isRoom(payload.room)) throw new Error("Demo Room creation returned an invalid response.");
  return payload.room;
}

export async function archiveDemoRoom(room: Room) {
  const response = await fetch(`/api/demo/rooms/${encodeURIComponent(room.id)}`, {
    method: "DELETE",
    headers: { Accept: "application/json", "Content-Type": "application/json", "If-Match": room.manifest_hash, "X-Demo-Session": demoSession() },
    credentials: "same-origin",
    body: "{}",
  });
  const payload = await response.json() as { state?: string; error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Demo Room archive returned HTTP ${response.status}.`);
  if (payload.state !== "ARCHIVED") throw new Error("Demo Room archive returned an invalid response.");
}