import { z } from "zod";

const nullableText = z.string().nullable().optional();
const nullableUuid = z.string().uuid().nullable().optional();

export const locationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .refine((value) => value.length <= 100),
  type: z.string().trim().max(50).nullable().optional(),
  description: nullableText,
  climate: z.string().trim().max(100).nullable().optional(),
  region: z.string().trim().max(100).nullable().optional(),
  locationImage: nullableText,
  parentLocationId: nullableUuid,
});
