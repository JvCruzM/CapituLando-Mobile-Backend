import { findUser, publicUser } from "../repositories/auth.js";
import * as service from "../services/auth-service.js";
import {
  logoutSession,
  refreshSession,
  unauthorized,
} from "../../sessions/services/session-service.js";

export async function register(req, res) {
  await service.register(
    req.app.locals.db,
    req.app.locals.mailer,
    res.locals.input,
  );
  res
    .status(202)
    .json({ message: "Confira seu e-mail para confirmar a conta." });
}
export async function login(req, res) {
  const session = await service.login(
    req.app.locals.db,
    req.app.locals.config,
    res.locals.input,
    {
      userAgent: req.get("User-Agent"),
      ipAddress: req.ip,
    },
  );
  res.set("Cache-Control", "no-store").json(session);
}
export async function verifyEmail(req, res) {
  await service.verifyEmail(req.app.locals.db, res.locals.input.token);
  res.json({ message: "E-mail confirmado. Você já pode entrar." });
}
export async function forgotPassword(req, res) {
  await sendMail(
    req,
    res,
    "PASSWORD_RESET",
    "Se existir uma conta confirmada, enviaremos as instruções de redefinição.",
  );
}
export async function resendVerification(req, res) {
  await sendMail(
    req,
    res,
    "EMAIL_VERIFICATION",
    "Se houver uma conta aguardando confirmação, enviaremos um novo link.",
  );
}
async function sendMail(req, res, purpose, message) {
  try {
    await service.sendAccountMail(
      req.app.locals.db,
      req.app.locals.mailer,
      res.locals.input.email,
      purpose,
    );
  } catch (error) {
    if (error.code !== "MAIL_UNAVAILABLE") throw error;
    console.error("Envio de e-mail de conta indisponível.");
  }
  res.json({ message });
}
export async function resetPassword(req, res) {
  await service.resetPassword(req.app.locals.db, res.locals.input);
  res.json({ message: "Senha redefinida. Entre novamente." });
}
export async function changeEmail(req, res) {
  await service.changeEmail(
    req.app.locals.db,
    req.app.locals.mailer,
    res.locals.principal.id,
    res.locals.input,
  );
  res.json({ message: "Confirme o novo e-mail antes de entrar novamente." });
}
export async function me(req, res) {
  const user = await findUser(req.app.locals.db, "id", res.locals.principal.id);
  if (!user) throw unauthorized();
  res.set("Cache-Control", "no-store").json(publicUser(user));
}
export async function refresh(req, res) {
  const session = await refreshSession(
    req.app.locals.db,
    req.app.locals.config,
    res.locals.input.refreshToken,
  );
  res.set("Cache-Control", "no-store").json(session);
}
export async function logout(req, res) {
  await logoutSession(
    req.app.locals.db,
    res.locals.principal,
    res.locals.input.refreshToken,
  );
  res.status(204).end();
}
