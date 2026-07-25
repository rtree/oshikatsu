import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
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
  opens_at: z.string().datetime(),
  deadline: z.string().datetime(),
  topic_id: z.string().regex(/^0\.0\.\d+$/),
  works: z.array(workSchema).min(2).max(12),
  acceptance_run_id: z.string().max(100).optional(),
}).strict();

export type Room = {
  id: string;
  name: string;
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

const seedInput: z.infer<typeof createRoomSchema> = {
  name: "Weekly Chapter Drop",
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

export function getRoomAction(roomId: string) {
  return `oshikatsu-room:${roomId}`;
}

function canonicalManifest(input: z.infer<typeof createRoomSchema>, id: string) {
  return JSON.stringify({
    deadline: input.deadline,
    id,
    name: input.name,
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

export async function listRooms() {
  await ensureSeedRoom();
  const snapshot = await getFirestore().collection("rooms").orderBy("created_at", "desc").limit(50).get();
  return snapshot.docs.map((document) => {
    const room = document.data() as Room;
    return { ...room, phase: roomPhase(room.opens_at, room.deadline) };
  });
}

export async function getRoom(id: string) {
  roomIdSchema.parse(id);
  await ensureSeedRoom();
  const snapshot = await getFirestore().collection("rooms").doc(id).get();
  if (!snapshot.exists) return null;
  const room = snapshot.data() as Room;
  return { ...room, phase: roomPhase(room.opens_at, room.deadline) };
}