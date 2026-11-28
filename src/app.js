import "express";
import { createApp } from "./create-app.js";
import { readEnvironment } from "./config/env.js";
import { createPool } from "./database/index.js";
import { createMailer } from "./modules/mail/services/mail-sevice.js";
import { hashPassword } from "./shared/utils/crypto.js";
import { randomBytes } from "node:crypto";

const env = readEnvironment(process.env);
env.dummyPasswordHash = await hashPassword(randomBytes(32).toString("hex"));

const pool = createPool(env.DATABASE_URL);

const app = createApp(env.CORS_ORIGINS, {
  config: env,
  mailer: createMailer(env),
});
app.locals.db = pool;
app.locals.pool = pool;

export default app;
