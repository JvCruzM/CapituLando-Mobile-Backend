import { z } from "zod";

const nullableText = z.string().nullable().optional();
const nullableUuid = z.string().uuid().nullable().optional();

export const eventSchema = z.object({
  characterIds: z
    .array(z.guid())
    .max(1000)
    .refine((ids) => new Set(ids).size === ids.length)
    .optional(),
  title: z
    .string()
    .trim()
    .min(1)
    .refine((value) => value.length <= 200),
  description: nullableText,
  chronologicalDate: z.string().trim().max(100).nullable().optional(),
  sequenceOrder: z.number().int().nullable().optional(),
  eventImage: nullableText,
  chapterId: nullableUuid,
  locationId: nullableUuid,
});
