import { z } from "zod";

export const characterRelationshipSchema = z
  .object({
    sourceCharacterId: z.string().uuid(),
    targetCharacterId: z.string().uuid(),
    type: z
      .string()
      .trim()
      .min(1)
      .refine((value) => value.length <= 80),
    description: z.string().nullable().optional(),
    level: z.number().int().min(1).max(10).nullable().optional(),
  })
  .refine((data) => data.sourceCharacterId !== data.targetCharacterId, {
    message: "Um personagem não pode ter relacionamento consigo mesmo.",
    path: ["targetCharacterId"],
  });
