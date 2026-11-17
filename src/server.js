import { createApp } from "./app.js";
import { readEnvironment } from "./config/env.js";
import { createPool } from "./database/pool.js";

const env = readEnvironment(process.env);
const app = createApp(env.CORS_ORIGINS);
app.locals.db = createPool(env.DATABASE_URL);

const server = app.listen(env.PORT, env.HOST, () => {
  console.info(`CapituLando API na porta ${env.PORT}.`);
});

function stop() {
  server.close(async () => {
    await app.locals.db.end();
  });
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);
