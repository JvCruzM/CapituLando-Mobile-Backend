import { z } from "zod";

export const profileSchema = z.strictObject({
  username: z.string().regex(/^[A-Za-z0-9._-]{3,50}$/),
  displayName: z.string().trim().min(1).max(100),
  bio: z.string().max(100000).nullable().optional(),
  avatarImage: z.string().max(2000000).nullable().optional(),
});

export const settingsSchema = z.strictObject({
  revision: z.int().nonnegative(),
  value: z.strictObject({
    themeMode: z.enum(["system", "light", "dark"]).optional(),
    fontSize: z.enum(["sm", "md", "lg"]).optional(),
    dailyReminder: z.boolean().optional(),
    reminderTime: z
      .string()
      .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
      .optional(),
    goalAlerts: z.boolean().optional(),
  }),
});
