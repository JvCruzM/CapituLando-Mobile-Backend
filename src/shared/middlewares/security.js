import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

const uuidSchema = z.string().uuid();

export function sendSecurityError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

export function requireValidPrincipal(req, res, next) {
  if (!uuidSchema.safeParse(res.locals.principal?.id).success) {
    return sendSecurityError(
      res,
      401,
      "UNAUTHORIZED",
      "Entre na sua conta para continuar.",
    );
  }
  return next();
}

export function validateUuidParam(paramName, code, message) {
  return (req, res, next, value) => {
    if (!uuidSchema.safeParse(value).success) {
      return sendSecurityError(res, 400, code, message);
    }
    return next();
  };
}

export function createJsonBodyParser(
  limit = "1mb",
  tooLargeMessage = "Os dados enviados excedem o limite permitido.",
) {
  const parser = express.json({ limit });

  return [
    parser,
    (error, _req, res, next) => {
      if (error?.type === "entity.parse.failed") {
        return sendSecurityError(
          res,
          400,
          "INVALID_JSON",
          "Envie um JSON válido.",
        );
      }
      if (error?.type === "entity.too.large") {
        return sendSecurityError(
          res,
          413,
          "PAYLOAD_TOO_LARGE",
          tooLargeMessage,
        );
      }
      return next(error);
    },
  ];
}

export function createWriteRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    skip: (req) => ["GET", "HEAD", "OPTIONS"].includes(req.method),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      sendSecurityError(
        res,
        429,
        "RATE_LIMITED",
        "Muitas requisições em pouco tempo. Aguarde alguns instantes.",
      );
    },
  });
}

export function apiSecurityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  next();
}
