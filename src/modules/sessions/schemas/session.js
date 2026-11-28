import { z } from "zod";
import { AppError } from "../../../shared/errors/index.js";

export function validateSessionId(req, res, next) {
  const parsed = z.guid().safeParse(req.params.sessionId);
  if (!parsed.success)
    throw new AppError(
      400,
      "INVALID_SESSION_ID",
      "Identificador de sessão inválido.",
    );
  res.locals.sessionId = parsed.data;
  next();
}
