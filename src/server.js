import app from "./app.js";

const env = app.locals.config;
const pool = app.locals.pool;

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
