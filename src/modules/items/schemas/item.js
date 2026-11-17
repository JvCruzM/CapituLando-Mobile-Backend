import { z } from "zod";

const text = z.string().nullable().optional();
export const idSchema = z.guid();

export const itemSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .refine((name) => [...name].length <= 100),
  type: z
    .string()
    .refine((type) => [...type].length <= 50)
    .nullable()
    .optional(),
  description: text,
  appearance: text,
  origin: text,
  itemImage: text,
});
