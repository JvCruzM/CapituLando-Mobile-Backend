import rateLimit from "express-rate-limit";

const createLimiter = (windowMs, max, code, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test",
    handler: (_req, res) => {
      res.status(429).json({
        error: { code, message },
      });
    },
  });

export const authRateLimiter = createLimiter(
  15 * 60 * 1000,
  15,
  "TOO_MANY_AUTH_REQUESTS",
  "Muitas tentativas de autenticação. Aguarde 15 minutos e tente novamente.",
);

export const mailRateLimiter = createLimiter(
  15 * 60 * 1000,
  5,
  "TOO_MANY_MAIL_REQUESTS",
  "Limite de envio de e-mails atingido. Tente novamente em alguns minutos.",
);