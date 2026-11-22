import { z } from "zod";

export const createEventCharacterSchema = z.object({
  eventId: z.string().uuid(),
  characterId: z.string().uuid(),
});
