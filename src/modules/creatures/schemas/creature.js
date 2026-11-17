import { z } from "zod";

const text = z.string().nullable().optional();
export const idSchema = z.guid();

export const creatureSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .refine((name) => [...name].length <= 100),
  description: text,
  appearance: text,
  behavior: text,
  habitat: text,
  creatureImage: text,
  raceId: idSchema.nullable().optional(),
});
