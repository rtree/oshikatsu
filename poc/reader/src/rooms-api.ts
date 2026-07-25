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
};

export type RoomProjection = {
  room: Room;
  groove: ConfirmedGrooveEvent[];
  ballot: { status: string };
  revision: string;
};

function isRoom(value: unknown): value is Room {
  if (!value || typeof value !== "object") return false;
  const room = value as Partial<Room>;
  return typeof room.id === "string" &&
    typeof room.name === "string" &&
    typeof room.manifest_hash === "string" &&
    Array.isArray(room.works) &&
    room.works.every((work) =>
      work && typeof work.id === "string" && typeof work.title === "string" &&
      typeof work.chapter === "string" && typeof work.cover_url === "string" &&
      typeof work.reading_url === "string");
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
  if (!isRoom(projection.room) || !Array.isArray(projection.groove)) {
    throw new Error("Projection service returned an invalid response.");
  }
  return projection;
}