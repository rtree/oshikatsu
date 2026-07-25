import { z } from "zod";

export const roomIds = ["lisbon-main", "lisbon-encore"] as const;

export const roomIdSchema = z.enum(roomIds);

export const rooms = [
  { id: roomIds[0], name: "Lisbon Main Room" },
  { id: roomIds[1], name: "Lisbon Encore Room" },
] as const;

export function getRoomAction(roomId: z.infer<typeof roomIdSchema>) {
  return `oshikatsu-room:${roomId}`;
}