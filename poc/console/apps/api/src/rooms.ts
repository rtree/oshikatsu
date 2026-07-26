import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { FieldValue } from "@google-cloud/firestore";
import { getFirestore } from "./firestore.js";

export const roomIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/);

const workSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,31}$/),
  title: z.string().min(1).max(100),
  chapter: z.string().min(1).max(80),
  cover_url: z.string().url(),
  hero_url: z.string().url().nullable(),
  reading_url: z.string().url(),
}).strict();

export const createRoomSchema = z.object({
  name: z.string().min(3).max(80),
  room_type: z.enum(["MANGA", "SPECIAL_TEAM"]).default("MANGA"),
  opens_at: z.string().datetime(),
  deadline: z.string().datetime(),
  topic_id: z.string().regex(/^0\.0\.\d+$/),
  works: z.array(workSchema).min(2).max(12),
  acceptance_run_id: z.string().max(100).optional(),
}).strict();

export type Room = {
  id: string;
  name: string;
  room_type: "MANGA" | "SPECIAL_TEAM";
  action_description: string;
  world_action: string;
  opens_at: string;
  deadline: string;
  topic_id: string;
  works: z.infer<typeof workSchema>[];
  manifest_hash: string;
  phase: "UPCOMING" | "LIVE" | "CLOSED";
  created_at: string;
  acceptance_run_id?: string;
};

export type RoomAction = {
  id: string;
  room_id: string;
  kind: "ROOM_PROOF_LEGACY" | "BALLOT_V1";
  action: string;
  state: "ACTIVE" | "RETIRED";
};

type RoomAdmin = {
  state: "ACTIVE" | "ARCHIVED";
  purpose?: "DEMO";
  demo_owner_hash?: string;
  retired_actions?: string[];
  archived_at?: string;
  archived_by?: string;
  reason?: string;
};

const seedInput: z.infer<typeof createRoomSchema> = {
  name: "Weekly Chapter Drop",
  room_type: "MANGA",
  opens_at: "2026-07-25T00:00:00.000Z",
  deadline: "2027-07-25T23:59:59.000Z",
  topic_id: "0.0.9745676",
  works: [
    { id: "level-up", title: "Solo Leveling", chapter: "Chapter 143", cover_url: "https://oshikatsu-reader-lisbon26.web.app/assets/sample01.webp", hero_url: "https://oshikatsu-reader-lisbon26.web.app/assets/level-up.webp", reading_url: "https://www.webtoons.com/" },
    { id: "cadet", title: "Teenage Mercenary", chapter: "Chapter 85", cover_url: "https://oshikatsu-reader-lisbon26.web.app/assets/sample02.webp", hero_url: null, reading_url: "https://www.webtoons.com/" },
    { id: "divine", title: "Divine Delivery", chapter: "Chapter 61", cover_url: "https://oshikatsu-reader-lisbon26.web.app/assets/sample03.webp", hero_url: null, reading_url: "https://www.webtoons.com/" },
    { id: "reader", title: "Omniscient Reader", chapter: "Chapter 207", cover_url: "https://oshikatsu-reader-lisbon26.web.app/assets/sample04.webp", hero_url: null, reading_url: "https://www.webtoons.com/" },
    { id: "returner", title: "Returner's Magic", chapter: "Chapter 119", cover_url: "https://oshikatsu-reader-lisbon26.web.app/assets/sample05.webp", hero_url: null, reading_url: "https://www.webtoons.com/" },
  ],
};

const demoRoomNames = [
  "Midnight Discovery Club",
  "Hidden Gems Showcase",
  "Next Favorite Manga",
  "Weekend Manga Circle",
  "Readers' Choice Session",
];

export const demoRoomDurationSchema = z.enum(["2m", "3m", "5m", "10m", "1h", "1d"]);
export const createDemoRoomRequestSchema = z.object({ duration: demoRoomDurationSchema.default("1d") }).strict();
export type DemoRoomDuration = z.infer<typeof demoRoomDurationSchema>;

const demoRoomDurationMilliseconds: Record<DemoRoomDuration, number> = {
  "2m": 2 * 60_000,
  "3m": 3 * 60_000,
  "5m": 5 * 60_000,
  "10m": 10 * 60_000,
  "1h": 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

export function createDemoRoomInput(random = Math.random, now = new Date(), duration: DemoRoomDuration = "1d"): z.infer<typeof createRoomSchema> {
  const selectedWorks = [...seedInput.works]
    .map((work) => ({ work, order: random() }))
    .sort((left, right) => left.order - right.order)
    .slice(0, 3)
    .map(({ work }) => work);
  const title = demoRoomNames[Math.floor(random() * demoRoomNames.length)] ?? demoRoomNames[0];
  return createRoomSchema.parse({
    name: `DEMO · ${title} · ${randomUUID().slice(0, 4).toUpperCase()}`,
    room_type: "MANGA",
    opens_at: now.toISOString(),
    deadline: new Date(now.getTime() + demoRoomDurationMilliseconds[duration]).toISOString(),
    topic_id: seedInput.topic_id,
    works: selectedWorks,
    acceptance_run_id: "reader-demo",
  });
}

export function getRoomAction(roomId: string) {
  return `oshikatsu-room:${roomId}`;
}

export function getRoomActions(roomId: string, admin?: RoomAdmin): RoomAction[] {
  const actions: Array<Omit<RoomAction, "state">> = [
    { id: `room-proof-legacy:${roomId}`, room_id: roomId, kind: "ROOM_PROOF_LEGACY", action: getRoomAction(roomId) },
    { id: `ballot-v1:${roomId}`, room_id: roomId, kind: "BALLOT_V1", action: `oshikatsu-ballot-v1:${roomId}` },
  ];
  return actions.map((action) => ({ ...action, state: admin?.retired_actions?.includes(action.id) ? "RETIRED" : "ACTIVE" }));
}

function canonicalManifest(input: z.infer<typeof createRoomSchema>, id: string) {
  return JSON.stringify({
    deadline: input.deadline,
    id,
    name: input.name,
    room_type: input.room_type,
    opens_at: input.opens_at,
    topic_id: input.topic_id,
    v: 1,
    works: input.works.map((work) => ({ chapter: work.chapter, cover_url: work.cover_url, hero_url: work.hero_url, id: work.id, reading_url: work.reading_url, title: work.title })),
    world_action: getRoomAction(id),
  });
}

function roomPhase(opensAt: string, deadline: string): Room["phase"] {
  const now = Date.now();
  if (now < Date.parse(opensAt)) return "UPCOMING";
  if (now > Date.parse(deadline)) return "CLOSED";
  return "LIVE";
}

function createRoomDocument(input: z.infer<typeof createRoomSchema>, id: string): Room {
  if (Date.parse(input.deadline) <= Date.parse(input.opens_at)) throw new Error("Room deadline must be after opens_at.");
  const manifestHash = createHash("sha256").update(canonicalManifest(input, id)).digest("hex");
  return {
    id,
    name: input.name,
    room_type: input.room_type,
    action_description: `Verify humanity for ${input.name}`,
    world_action: getRoomAction(id),
    opens_at: input.opens_at,
    deadline: input.deadline,
    topic_id: input.topic_id,
    works: input.works,
    manifest_hash: manifestHash,
    phase: roomPhase(input.opens_at, input.deadline),
    created_at: new Date().toISOString(),
    ...(input.acceptance_run_id ? { acceptance_run_id: input.acceptance_run_id } : {}),
  };
}

export async function ensureSeedRoom() {
  const reference = getFirestore().collection("rooms").doc("lisbon-main");
  const snapshot = await reference.get();
  if (!snapshot.exists) await reference.create(createRoomDocument(seedInput, "lisbon-main"));
}

export async function createRoom(input: z.infer<typeof createRoomSchema>) {
  const id = `room-${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const room = createRoomDocument(input, id);
  await getFirestore().collection("rooms").doc(id).create(room);
  return room;
}

export async function createAdminRoom(input: z.infer<typeof createRoomSchema>, idempotencyKey: string, actor: string) {
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
  const keyHash = createHash("sha256").update(idempotencyKey).digest("hex");
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const store = getFirestore();
  const reference = store.collection("admin_idempotency").doc(keyHash);
  const created = await store.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    if (existing.exists) {
      const data = existing.data() as { request_hash: string; room_id: string };
      if (data.request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
      return { roomId: data.room_id, replayed: true };
    }
    const id = `room-${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    const room = createRoomDocument(input, id);
    transaction.create(store.collection("rooms").doc(id), room);
    transaction.create(reference, { request_hash: requestHash, room_id: id, actor, created_at: new Date().toISOString() });
    transaction.create(store.collection("admin_audit").doc(), { actor, operation: "CREATE_ROOM", target: id, manifest_hash: room.manifest_hash, created_at: new Date().toISOString() });
    return { roomId: id, replayed: false };
  });
  const result = await getAdminRoom(created.roomId);
  if (!result) throw new Error("IDEMPOTENCY_RESULT_MISSING");
  return { ...result, replayed: created.replayed };
}

export async function createDemoRoom(ownerHash: string, idempotencyKey: string, duration: DemoRoomDuration = "1d") {
  if (!/^[0-9a-f]{64}$/.test(ownerHash)) throw new Error("INVALID_DEMO_OWNER");
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
  const store = getFirestore();
  const keyHash = createHash("sha256").update(`demo:${ownerHash}:${idempotencyKey}`).digest("hex");
  const reference = store.collection("admin_idempotency").doc(keyHash);
  const created = await store.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    if (existing.exists) return { roomId: (existing.data() as { room_id: string }).room_id, replayed: true };
    const input = createDemoRoomInput(Math.random, new Date(), duration);
    const id = `room-${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    const room = createRoomDocument(input, id);
    transaction.create(store.collection("rooms").doc(id), room);
    transaction.create(store.collection("room_admin").doc(id), { state: "ACTIVE", purpose: "DEMO", demo_owner_hash: ownerHash });
    transaction.create(reference, { room_id: id, actor: "reader-demo", created_at: new Date().toISOString() });
    transaction.create(store.collection("admin_audit").doc(), { actor: "reader-demo", operation: "CREATE_DEMO_ROOM", target: id, manifest_hash: room.manifest_hash, created_at: new Date().toISOString() });
    return { roomId: id, replayed: false };
  });
  const room = await getRoom(created.roomId);
  if (!room) throw new Error("IDEMPOTENCY_RESULT_MISSING");
  return { room, replayed: created.replayed };
}

export async function listDemoRooms(ownerHash: string) {
  if (!/^[0-9a-f]{64}$/.test(ownerHash)) return [];
  const snapshot = await getFirestore().collection("room_admin")
    .where("purpose", "==", "DEMO")
    .where("demo_owner_hash", "==", ownerHash)
    .get();
  const rooms = await Promise.all(snapshot.docs.flatMap((document) => {
    const admin = document.data() as RoomAdmin;
    return admin.state === "ARCHIVED" ? [] : [getRoom(document.id)];
  }));
  return rooms.filter((room): room is Room => room !== null).sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export async function archiveDemoRoom(id: string, ownerHash: string, manifestHash: string) {
  const admin = (await getFirestore().collection("room_admin").doc(id).get()).data() as RoomAdmin | undefined;
  if (admin?.purpose !== "DEMO" || admin.demo_owner_hash !== ownerHash) throw new Error("DEMO_ROOM_NOT_OWNED");
  return archiveRoom(id, manifestHash, id, "Removed from Profile demo", "reader-demo");
}

export async function listRooms() {
  await ensureSeedRoom();
  const snapshot = await getFirestore().collection("rooms").orderBy("created_at", "desc").limit(200).get();
  const adminSnapshots = await Promise.all(snapshot.docs.map((document) => getFirestore().collection("room_admin").doc(document.id).get()));
  return snapshot.docs.flatMap((document, index) => {
    if ((adminSnapshots[index]?.data() as RoomAdmin | undefined)?.state === "ARCHIVED") return [];
    const room = document.data() as Room;
    return { ...room, room_type: room.room_type ?? "MANGA", phase: roomPhase(room.opens_at, room.deadline) };
  }).slice(0, 50);
}

export async function getRoom(id: string) {
  roomIdSchema.parse(id);
  await ensureSeedRoom();
  const snapshot = await getFirestore().collection("rooms").doc(id).get();
  if (!snapshot.exists) return null;
  const room = snapshot.data() as Room;
  return { ...room, room_type: room.room_type ?? "MANGA", phase: roomPhase(room.opens_at, room.deadline) };
}

export async function listAdminRooms() {
  await ensureSeedRoom();
  const snapshot = await getFirestore().collection("rooms").orderBy("created_at", "desc").limit(100).get();
  return Promise.all(snapshot.docs.map(async (document) => {
    const room = document.data() as Room;
    const admin = (await getFirestore().collection("room_admin").doc(document.id).get()).data() as RoomAdmin | undefined;
    return { room: { ...room, room_type: room.room_type ?? "MANGA", phase: roomPhase(room.opens_at, room.deadline) }, admin: admin ?? { state: "ACTIVE" }, actions: getRoomActions(room.id, admin) };
  }));
}

export async function getAdminRoom(id: string) {
  const room = await getRoom(id);
  if (!room) return null;
  const admin = (await getFirestore().collection("room_admin").doc(id).get()).data() as RoomAdmin | undefined;
  return { room, admin: admin ?? { state: "ACTIVE" }, actions: getRoomActions(id, admin) };
}

export async function requireRoomAction(roomId: string, kind: RoomAction["kind"]) {
  const admin = (await getFirestore().collection("room_admin").doc(roomId).get()).data() as RoomAdmin | undefined;
  if (admin?.state === "ARCHIVED") throw new Error("ROOM_ARCHIVED");
  const action = getRoomActions(roomId, admin).find((candidate) => candidate.kind === kind);
  if (!action || action.state !== "ACTIVE") throw new Error("ACTION_RETIRED");
  return action;
}

export async function requireActiveRoom(roomId: string) {
  const admin = (await getFirestore().collection("room_admin").doc(roomId).get()).data() as RoomAdmin | undefined;
  if (admin?.state === "ARCHIVED") throw new Error("ROOM_ARCHIVED");
}

export async function isDemoRoom(roomId: string) {
  const admin = (await getFirestore().collection("room_admin").doc(roomId).get()).data() as RoomAdmin | undefined;
  return admin?.state === "ACTIVE" && admin.purpose === "DEMO";
}

export async function archiveRoom(id: string, manifestHash: string, confirmId: string, reason: string, actor: string) {
  if (id === "lisbon-main") throw new Error("PROTECTED_ROOM");
  if (confirmId !== id) throw new Error("ROOM_CONFIRMATION_MISMATCH");
  const room = await getRoom(id);
  if (!room) throw new Error("ROOM_NOT_FOUND");
  if (room.manifest_hash !== manifestHash) throw new Error("MANIFEST_HASH_MISMATCH");
  const now = new Date().toISOString();
  await getFirestore().collection("room_admin").doc(id).set({ state: "ARCHIVED", archived_at: now, archived_by: actor, reason }, { merge: true });
  await getFirestore().collection("admin_audit").add({ actor, operation: "ARCHIVE_ROOM", target: id, manifest_hash: room.manifest_hash, reason, created_at: now });
  return { room_id: id, state: "ARCHIVED", immutable_evidence_retained: true } as const;
}

export async function listActions(roomId?: string) {
  const rooms = await listAdminRooms();
  return rooms.filter((entry) => !roomId || entry.room.id === roomId).flatMap((entry) => entry.actions);
}

export async function retireAction(actionId: string, manifestHash: string, confirmId: string, actor: string) {
  if (confirmId !== actionId) throw new Error("ACTION_CONFIRMATION_MISMATCH");
  const separator = actionId.indexOf(":");
  const roomId = separator < 0 ? "" : actionId.slice(separator + 1);
  const room = await getRoom(roomId);
  if (!room) throw new Error("ROOM_NOT_FOUND");
  if (room.id === "lisbon-main") throw new Error("PROTECTED_ROOM");
  if (room.manifest_hash !== manifestHash) throw new Error("MANIFEST_HASH_MISMATCH");
  const actions = getRoomActions(room.id);
  if (!actions.some((action) => action.id === actionId)) throw new Error("ACTION_NOT_FOUND");
  await getFirestore().collection("room_admin").doc(room.id).set({ retired_actions: FieldValue.arrayUnion(actionId) }, { merge: true });
  await getFirestore().collection("admin_audit").add({ actor, operation: "RETIRE_ACTION", target: actionId, room_id: room.id, created_at: new Date().toISOString() });
  return { action_id: actionId, state: "RETIRED", historical_verification_retained: true } as const;
}