import { z } from "zod";

const nullableText = z.string().nullable().optional();
const nullableUuid = z.string().uuid().nullable().optional();

export const characterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .refine((value) => value.length <= 100),
  raceId: nullableUuid,
  description: nullableText,
  appearance: nullableText,
  personality: nullableText,
  age: z.number().int().min(0).nullable().optional(),
  height: z.string().trim().max(30).nullable().optional(),
  weight: z.string().trim().max(30).nullable().optional(),
  zodiac: z.string().trim().max(30).nullable().optional(),
  bloodType: z.string().trim().max(10).nullable().optional(),
  gender: z.string().trim().max(50).nullable().optional(),
  background: nullableText,
  characterImage: nullableText,
  imageFit: z.string().trim().max(12).nullable().optional(),
  imagePosition: z.string().trim().max(30).nullable().optional(),
  likes: nullableText,
  dislikes: nullableText,
  drinks: nullableText,
  motto: nullableText,
  role: z.string().trim().max(50).nullable().optional(),
  mbti: z.string().trim().max(8).nullable().optional(),
  motivation: nullableText,
  notes: nullableText,
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});
