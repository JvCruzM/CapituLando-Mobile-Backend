import { z } from "zod";

export const worldRuleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .refine((value) => value.length <= 150),
  category: z.string().trim().max(80).nullable().optional(),
  description: z.string().nullable().optional(),
});
