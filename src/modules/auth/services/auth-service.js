import { transaction } from "../../../database/transaction.js";
import { AppError } from "../../../shared/errors/index.js";
import {
  hashPassword,
  matchesPassword,
  hashToken,
  opaqueToken,
} from "../../../shared/utils/crypto.js";
import { findUser } from "../repositories/auth.js";
import { createSessionRepository } from "../../sessions/repositories/sessions.js";
import {
  sessionResponse,
  unauthorized,
} from "../../sessions/services/session-service.js";

const invalidToken = () =>
  new AppError(400, "INVALID_AUTH_TOKEN", "Token inválido ou expirado.");

async function issueMailToken(client, mailer, user, purpose) {
  const token = opaqueToken();
  await client.query(
    "UPDATE auth_tokens SET consumed_at = now() WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL",
    [user.id, purpose],
  );
  await client.query(
    `INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at)
     VALUES ($1, $2, $3, now() + $4::int * interval '1 hour')`,
    [user.id, hashToken(token), purpose, purpose === "PASSWORD_RESET" ? 1 : 24],
  );
  await mailer.sendToken(user.email, purpose, token);
}

export async function register(pool, mailer, input) {
  const passwordHash = await hashPassword(input.password);
  await transaction(pool, async (client) => {
    const {
      rows: [user],
    } = await client.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [input.email, passwordHash],
    );
    await client.query(
      "INSERT INTO profiles (id, username, display_name) VALUES ($1, $2, $3)",
      [user.id, input.username.toLowerCase(), input.username],
    );
    await issueMailToken(client, mailer, user, "EMAIL_VERIFICATION");
  });
}

export async function login(pool, config, input, metadata) {
  const user = await findUser(pool, "email", input.email);
  const hash = user?.password_hash ?? config.dummyPasswordHash;
  if (
    !(await matchesPassword(hash, input.password)) ||
    !user ||
    !user.is_active
  ) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "E-mail ou senha incorretos.",
    );
  }
  if (!user.email_verified)
    throw new AppError(
      403,
      "EMAIL_NOT_VERIFIED",
      "Confirme seu e-mail antes de entrar.",
    );
  return transaction(pool, async (client) => {
    const current = await findUser(client, "id", user.id, true);
    if (
      !current ||
      !current.is_active ||
      !current.email_verified ||
      current.password_hash !== user.password_hash ||
      current.token_version !== user.token_version
    )
      throw unauthorized();
    const token = opaqueToken();
    const session = await createSessionRepository(client).create(
      current,
      hashToken(token),
      config.REFRESH_SESSION_DAYS,
      metadata,
    );
    return sessionResponse(current, session, token, config);
  });
}

export async function sendAccountMail(pool, mailer, email, purpose) {
  await transaction(pool, async (client) => {
    const user = await findUser(client, "email", email, true);
    if (!user || !user.is_active) return;
    if ((purpose === "PASSWORD_RESET") !== user.email_verified) return;
    await issueMailToken(client, mailer, user, purpose);
  });
}

async function withMailToken(pool, rawToken, purpose, action) {
  await transaction(pool, async (client) => {
    const hash = hashToken(rawToken);
    const {
      rows: [location],
    } = await client.query(
      "SELECT user_id FROM auth_tokens WHERE token_hash = $1 AND purpose = $2",
      [hash, purpose],
    );
    if (!location) throw invalidToken();
    const user = await findUser(client, "id", location.user_id, true);
    if (!user || !user.is_active) throw invalidToken();
    const { rows } = await client.query(
      `UPDATE auth_tokens SET consumed_at = now()
       WHERE token_hash = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
       RETURNING id`,
      [hash, purpose],
    );
    if (!rows.length) throw invalidToken();
    await action(client, user);
  });
}

export function verifyEmail(pool, token) {
  return withMailToken(pool, token, "EMAIL_VERIFICATION", (client, user) =>
    client.query(
      "UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1",
      [user.id],
    ),
  );
}

export async function resetPassword(pool, input) {
  const passwordHash = await hashPassword(input.newPassword);
  await withMailToken(
    pool,
    input.token,
    "PASSWORD_RESET",
    async (client, user) => {
      await client.query(
        "UPDATE users SET password_hash = $2, token_version = token_version + 1, updated_at = now() WHERE id = $1",
        [user.id, passwordHash],
      );
      await createSessionRepository(client).revokeUser(user.id);
      await client.query(
        "UPDATE auth_tokens SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL",
        [user.id],
      );
    },
  );
}

export async function changeEmail(pool, mailer, userId, input) {
  await transaction(pool, async (client) => {
    const user = await findUser(client, "id", userId, true);
    if (
      !user ||
      !(await matchesPassword(user.password_hash, input.currentPassword))
    ) {
      throw new AppError(400, "INVALID_PASSWORD", "Senha atual inválida.");
    }
    if (user.email.toLowerCase() === input.email) return;
    await client.query(
      "UPDATE users SET email = $2, email_verified = false, token_version = token_version + 1, updated_at = now() WHERE id = $1",
      [userId, input.email],
    );
    await createSessionRepository(client).revokeUser(userId);
    await client.query(
      "UPDATE auth_tokens SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL",
      [userId],
    );
    await issueMailToken(
      client,
      mailer,
      { id: userId, email: input.email },
      "EMAIL_VERIFICATION",
    );
  });
}
