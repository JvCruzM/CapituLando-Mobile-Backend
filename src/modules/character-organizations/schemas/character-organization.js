import { z } from "zod";

export const createCharacterOrganizationSchema = z.object({
  characterId: z.string().uuid(),
  organizationId: z.string().uuid(),
  role: z.string().trim().max(100).nullable().optional(),
  joinedAt: z.string().trim().max(100).nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

export const updateCharacterOrganizationSchema = z.object({
  role: z.string().trim().max(100).nullable().optional(),
  joinedAt: z.string().trim().max(100).nullable().optional(),
  isActive: z.boolean().optional().default(true),
});
