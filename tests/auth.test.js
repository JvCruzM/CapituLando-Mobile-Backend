import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "../src/app.js";
import { readEnvironment } from "../src/config/env.js";
import {
  authRateLimiter,
  mailRateLimiter,
} from "../src/shared/middlewares/rate-limiter.js";
import { hashPassword, matchesPassword } from "../src/shared/utils/crypto.js";

test("autenticação HTTP e autorização no esquema compartilhado", async (t) => {
  const db = new PGlite();
  if (process.env.TEST_MIGRATIONS_DIR) {
    const files = await readdir(process.env.TEST_MIGRATIONS_DIR);
    for (const file of files
      .filter((name) => /^V[0-9]+__.*\.sql$/.test(name))
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))) {
      await db.exec(
        await readFile(join(process.env.TEST_MIGRATIONS_DIR, file), "utf8"),
      );
    }
  } else {
    await db.exec(
      await readFile(new URL("./auth-schema.sql", import.meta.url), "utf8"),
    );
  }
  let pending = Promise.resolve();
  async function connect() {
    const before = pending;
    let release;
    pending = new Promise((resolve) => {
      release = resolve;
    });
    await before;
    return { query: db.query.bind(db), release };
  }
  const pool = {
    connect,
    async query(sql, params) {
      const client = await connect();
      try {
        return await client.query(sql, params);
      } finally {
        client.release();
      }
    },
  };
  const config = readEnvironment({
    DATABASE_URL: "postgresql://localhost/test",
    JWT_SECRET: "test-secret-".repeat(6),
  });
  config.dummyPasswordHash = await hashPassword("dummy-password");
  const messages = [];
  let failMail = false;
  const mailer = {
    async sendToken(email, purpose, token) {
      if (failMail) {
        const { AppError } = await import("../src/shared/errors/app-error.js");
        throw new AppError(503, "MAIL_UNAVAILABLE", "SMTP indisponível.");
      }
      messages.push({ email, purpose, token });
    },
  };
  const app = createApp([], { config, mailer });
  app.locals.db = pool;
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  const password = "SenhaInicial123";
  const account = {
    username: "autora",
    email: "autora@example.test",
    password,
  };
  let owner, storyId;

  async function call(
    path,
    status,
    { method = "POST", data, access, preserveLimit = false } = {},
  ) {
    if (!preserveLimit) {
      await authRateLimiter.resetKey("127.0.0.1");
      await mailRateLimiter.resetKey("127.0.0.1");
    }
    const headers = {};
    if (data !== undefined) headers["Content-Type"] = "application/json";
    if (access) headers.Authorization = "Bearer " + access;
    const response = await fetch(base + path, {
      method,
      headers,
      body: typeof data === "string" ? data : JSON.stringify(data),
    });
    const text = await response.text();
    assert.equal(response.status, status, path + ": " + text);
    return text ? JSON.parse(text) : undefined;
  }
  const signIn = async (email = account.email, candidate = password) =>
    call("/api/auth/login", 200, { data: { email, password: candidate } });
  const lastToken = (purpose) =>
    messages.filter((message) => message.purpose === purpose).at(-1).token;

  try {
    await t.test(
      "cadastro, Argon2id, e-mail, duplicidade e papéis",
      async () => {
        await call("/api/auth/register", 400, {
          data: { ...account, role: "ADMIN" },
        });
        await call("/api/auth/register", 202, { data: account });
        const {
          rows: [user],
        } = await db.query("SELECT * FROM users");
        owner = user.id;
        assert.equal(user.role, "AUTHOR");
        assert.match(user.password_hash, /^\$argon2id\$/);
        assert.ok(await matchesPassword(user.password_hash, password));
        assert.equal(
          (await db.query("SELECT id FROM profiles")).rows[0].id,
          owner,
        );
        assert.equal(
          (await db.query("SELECT token_hash FROM auth_tokens")).rows[0]
            .token_hash.length,
          64,
        );
        await call("/api/auth/register", 409, {
          data: { ...account, email: "AUTORA@example.test" },
        });
        await call("/api/auth/login", 403, {
          data: { email: account.email, password },
        });
        const token = lastToken("EMAIL_VERIFICATION");
        await call("/api/auth/verify-email", 200, { data: { token } });
        await call("/api/auth/verify-email", 400, { data: { token } });
      },
    );
    await t.test("falha SMTP desfaz o cadastro", async () => {
      failMail = true;
      await call("/api/auth/register", 503, {
        data: { ...account, username: "falha", email: "falha@example.test" },
      });
      failMail = false;
      assert.equal(
        (await db.query("SELECT count(*)::int AS n FROM users")).rows[0].n,
        1,
      );
    });
    await t.test("JWT, me, RBAC e propriedade dos módulos", async () => {
      await call("/api/auth/login", 401, {
        data: { email: account.email, password: "errada" },
      });
      const session = await signIn();
      assert.equal(session.user.id, owner);
      const me = await call("/api/auth/me", 200, {
        method: "GET",
        access: session.accessToken,
      });
      assert.equal(me.role, "AUTHOR");
      await call("/api/auth/me", 401, { method: "GET", access: "invalid" });
      const claims = jwt.decode(session.accessToken);
      const forged = jwt.sign(
        { ...claims, exp: Math.floor(Date.now() / 1000) - 1 },
        config.JWT_SECRET,
      );
      await call("/api/auth/me", 401, { method: "GET", access: forged });
      await call("/api/sessions/stats", 403, {
        method: "GET",
        access: session.accessToken,
      });
      await db.query("UPDATE users SET role = 'ADMIN' WHERE id = $1", [owner]);
      await call("/api/sessions/stats", 200, {
        method: "GET",
        access: session.accessToken,
      });
      await db.query("UPDATE users SET role = 'AUTHOR' WHERE id = $1", [owner]);
      const {
        rows: [story],
      } = await db.query(
        "INSERT INTO stories (profile_id,title) VALUES ($1,'Teste') RETURNING id",
        [owner],
      );
      storyId = story.id;
      const path = "/api/stories/" + storyId + "/races";
      await call(path, 401, { method: "GET" });
      await call(path, 201, {
        access: session.accessToken,
        data: { name: "Elfos" },
      });
      await call(path, 200, { method: "GET", access: session.accessToken });
      await call("/api/auth/register", 202, {
        data: { ...account, username: "outra", email: "outra@example.test" },
      });
      await call("/api/auth/verify-email", 200, {
        data: { token: lastToken("EMAIL_VERIFICATION") },
      });
      const other = await signIn("outra@example.test");
      await call(path, 404, { method: "GET", access: other.accessToken });
      const ownSessions = await call("/api/sessions", 200, {
        method: "GET",
        access: session.accessToken,
      });
      await call("/api/sessions/" + ownSessions[0].id, 404, {
        method: "DELETE",
        access: other.accessToken,
      });
    });
    await t.test(
      "rotação preserva histórico e reutilização revoga a família",
      async () => {
        const original = await signIn();
        const rotated = await call("/api/auth/refresh", 200, {
          data: { refreshToken: original.refreshToken },
        });
        assert.notEqual(original.refreshToken, rotated.refreshToken);
        await call("/api/auth/refresh", 401, {
          data: { refreshToken: original.refreshToken },
        });
        await call("/api/auth/refresh", 401, {
          data: { refreshToken: rotated.refreshToken },
        });
        await call("/api/auth/me", 401, {
          method: "GET",
          access: rotated.accessToken,
        });
        assert.ok(
          (
            await db.query(
              "SELECT id FROM refresh_tokens WHERE consumed_at IS NOT NULL AND replaced_by_id IS NOT NULL",
            )
          ).rows.length,
        );
      },
    );
    await t.test(
      "logout revoga access e refresh; status da conta é verificado",
      async () => {
        const session = await signIn();
        await call("/api/auth/logout", 204, {
          access: session.accessToken,
          data: { refreshToken: session.refreshToken },
        });
        await call("/api/auth/me", 401, {
          method: "GET",
          access: session.accessToken,
        });
        await call("/api/auth/refresh", 401, {
          data: { refreshToken: session.refreshToken },
        });
        const blocked = await signIn();
        await db.query("UPDATE users SET is_active = false WHERE id=$1", [
          owner,
        ]);
        await call("/api/auth/me", 401, {
          method: "GET",
          access: blocked.accessToken,
        });
        await call("/api/auth/refresh", 401, {
          data: { refreshToken: blocked.refreshToken },
        });
        await db.query("UPDATE users SET is_active = true WHERE id=$1", [
          owner,
        ]);
      },
    );
    await t.test(
      "concorrência de refresh, expiração e revogação individual",
      async () => {
        const session = await signIn();
        await authRateLimiter.resetKey("127.0.0.1");
        const responses = await Promise.all(
          [1, 2].map(() =>
            fetch(base + "/api/auth/refresh", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refreshToken: session.refreshToken }),
            }),
          ),
        );
        assert.deepEqual(
          responses.map((response) => response.status).sort(),
          [200, 401],
        );
        const winner = await responses
          .find((response) => response.status === 200)
          .json();
        await call("/api/auth/me", 401, {
          method: "GET",
          access: winner.accessToken,
        });
        const independent = await signIn();
        const claims = jwt.decode(independent.accessToken);
        await call("/api/sessions/" + claims.sid, 204, {
          method: "DELETE",
          access: independent.accessToken,
        });
        await call("/api/auth/refresh", 401, {
          data: { refreshToken: independent.refreshToken },
        });
        const expired = await signIn();
        const expiredClaims = jwt.decode(expired.accessToken);
        await db.query(
          "UPDATE refresh_sessions SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE id = $1",
          [expiredClaims.sid],
        );
        await call("/api/auth/me", 401, {
          method: "GET",
          access: expired.accessToken,
        });
        await call("/api/auth/refresh", 401, {
          data: { refreshToken: expired.refreshToken },
        });
      },
    );
    await t.test(
      "perfil, preferências compartilhadas e conflito de revisão",
      async () => {
        const session = await signIn();
        await call("/api/profile", 200, {
          method: "PUT",
          access: session.accessToken,
          data: {
            username: "autora",
            displayName: "Autora",
            bio: "Bio",
            avatarImage: "data:image/png;base64," + "A".repeat(120000),
          },
        });
        assert.equal(
          (
            await call("/api/profile", 200, {
              method: "GET",
              access: session.accessToken,
            })
          ).displayName,
          "Autora",
        );
        const document = {
          revision: 0,
          value: { themeMode: "dark", reminderTime: "20:00" },
        };
        assert.equal(
          (
            await call("/api/profile/settings", 200, {
              method: "PUT",
              access: session.accessToken,
              data: document,
            })
          ).revision,
          1,
        );
        await call("/api/profile/settings", 409, {
          method: "PUT",
          access: session.accessToken,
          data: document,
        });
        assert.equal(
          (
            await call("/api/profile/settings", 200, {
              method: "GET",
              access: session.accessToken,
            })
          ).value.themeMode,
          "dark",
        );
      },
    );
    await t.test(
      "recuperação compatível com auth_tokens e revogação por token_version",
      async () => {
        const session = await signIn();
        const generic = await call("/api/auth/forgot-password", 200, {
          data: { email: account.email },
        });
        assert.deepEqual(
          await call("/api/auth/forgot-password", 200, {
            data: { email: "ausente@example.test" },
          }),
          generic,
        );
        const token = lastToken("PASSWORD_RESET");
        await call("/api/auth/reset-password", 200, {
          data: { token, newPassword: "NovaSenha123" },
        });
        await call("/api/auth/reset-password", 400, {
          data: { token, newPassword: "NovaSenha123" },
        });
        await call("/api/auth/me", 401, {
          method: "GET",
          access: session.accessToken,
        });
        await call("/api/auth/login", 401, {
          data: { email: account.email, password },
        });
        const renewed = await signIn(account.email, "NovaSenha123");
        await call("/api/auth/change-email", 200, {
          access: renewed.accessToken,
          data: { email: "novo@example.test", currentPassword: "NovaSenha123" },
        });
        await call("/api/auth/me", 401, {
          method: "GET",
          access: renewed.accessToken,
        });
        await call("/api/auth/verify-email", 200, {
          data: { token: lastToken("EMAIL_VERIFICATION") },
        });
        await signIn("novo@example.test", "NovaSenha123");
      },
    );
    await t.test(
      "JSON inválido e rate limiter ativo inclusive em testes",
      async () => {
        await call("/api/auth/login", 400, { data: "{" });
        for (let index = 0; index < 15; index++) {
          await call("/api/auth/login", 400, {
            data: {},
            preserveLimit: index > 0,
          });
        }
        await call("/api/auth/login", 429, { data: {}, preserveLimit: true });
      },
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  }
});
