import { createApp } from "./app.js";
import { readEnvironment } from "./config/env.js";
import { createPool } from "./database/pool.js";
import { ensureWritingSchema } from "./database/ensureWritingSchema.js";
import { createMailer } from "./modules/mail/services/mail-sevice.js";
import { hashPassword } from "./shared/utils/crypto.js";
import { randomBytes } from "node:crypto";

const env = readEnvironment(process.env);
env.dummyPasswordHash = await hashPassword(randomBytes(32).toString("hex"));

const pool = createPool(env.DATABASE_URL);
await ensureWritingSchema(pool);

const app = createApp(env.CORS_ORIGINS, {
  config: env,
  mailer: createMailer(env),
});
app.locals.db = pool;
app.locals.pool = pool;

const server = app.listen(env.PORT, env.HOST, () => {
  console.info(`CapituLando API na porta ${env.PORT}.`);
});

function stop() {
  server.close(async () => {
    await pool.end();
  });
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);