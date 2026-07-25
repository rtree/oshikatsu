import { z } from "zod";

export const roomIds = [
  "lisbon-main",
  "lisbon-encore",
  "lisbon-presence-control",
  "lisbon-host-verify-control",
] as const;

export const roomIdSchema = z.enum(roomIds);

export const rooms = [
  {
    id: roomIds[0],
    name: "Lisbon Main Room",
    actionDescription: "Verify humanity for Lisbon Main Room",
  },
  {
    id: roomIds[1],
    name: "Lisbon Encore Room",
    actionDescription: "Verify humanity for Lisbon Encore Room",
  },
  {
    id: roomIds[2],
    name: "Lisbon Presence Control",
    actionDescription: "Verify humanity without an additional presence check",
  },
  {
    id: roomIds[3],
    name: "Lisbon Host Verify Control",
    actionDescription: "Verify the corrected host proof policy",
  },
] as const;

export function getRoomAction(roomId: z.infer<typeof roomIdSchema>) {
  return `oshikatsu-room:${roomId}`;
}

export function getRoom(roomId: z.infer<typeof roomIdSchema>) {
  return rooms.find((room) => room.id === roomId)!;
}