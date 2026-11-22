import { z } from "zod";

const nullableText = z.string().nullable().optional();
const nullableUuid = z.string().uuid().nullable().optional();

export const organizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .refine((value) => value.length <= 100),
  type: z.string().trim().max(50).nullable().optional(),
  description: nullableText,
  organizationImage: nullableText,
  headquartersLocationId: nullableUuid,
});
