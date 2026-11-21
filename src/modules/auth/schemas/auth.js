import { z } from "zod";
import { AppError } from "../../../shared/errors/app-error.js";

const email = z
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());
const password = z
  .string()
  .min(6)
  .max(72)
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72);
const token = z.string().min(20).max(512);
export const authSchemas = {
  register: z.strictObject({
    email,
    password,
    username: z.string().regex(/^[A-Za-z0-9._-]{3,50}$/),
  }),
  login: z.strictObject({ email, password: z.string().min(1).max(512) }),
  verify: z.strictObject({ token }),
  forgot: z.strictObject({ email }),
  reset: z.strictObject({ token, newPassword: password }),
  changeEmail: z.strictObject({
    email,
    currentPassword: z.string().min(1).max(512),
  }),
  refresh: z.strictObject({ refreshToken: token }),
  logout: z.strictObject({ refreshToken: token.optional() }),
};

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success)
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Confira os campos enviados.",
      );
    res.locals.input = result.data;
    next();
  };
}
