import nodemailer from "nodemailer";
import { AppError } from "../../../shared/errors/app-error.js";

export function createMailer(config) {
  const smtp = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER
      ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 10000,
  });

  return {
    async sendToken(email, purpose, token) {
      const verification = purpose === "EMAIL_VERIFICATION";
      const url = new URL(
        verification ? "/confirmar-email" : "/redefinir-senha",
        config.FRONTEND_URL,
      );
      url.searchParams.set("token", token);
      url.searchParams.set("source", "mobile");
      try {
        await smtp.sendMail({
          from: config.MAIL_FROM,
          to: email,
          subject: verification
            ? "Confirme sua conta CapituLando"
            : "Redefina sua senha CapituLando",
          text: `${verification ? "Confirme seu e-mail" : "Redefina sua senha"} pelo link: ${url.href}\nSe você não fez esta solicitação, ignore esta mensagem.`,
        });
      } catch {
        throw new AppError(
          503,
          "MAIL_UNAVAILABLE",
          "Não foi possível enviar o e-mail. Tente novamente.",
        );
      }
    },
  };
}
