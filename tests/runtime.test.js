import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { createApp } from "../src/create-app.js";
import { cleanChapterHtml } from "../src/modules/backups/schemas/restore-records.js";
test("API inicia e responde saúde com require de ESM desativado", async (t) => {
  assert.equal(process.features.require_module, false);
  const app = createApp([]);
  app.locals.db = {
    query: () => {
      throw new Error("A rota de saúde não deve acessar o banco.");
    },
  };
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(
    "http://127.0.0.1:" + server.address().port + "/health",
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "capitulando-mobile-api",
  });
});
test("sanitizador compatível conserva formatação e remove conteúdo executável", () => {
  const html = cleanChapterHtml(
    '<h2>Título</h2><p><b>Texto</b><u>marcado</u><img src=x onerror=alert(1)></p><script>alert(2)</script><a href="javascript:alert(3)">Link</a>',
  );
  assert(html.includes("<h2>Título</h2>"));
  assert(html.includes("<b>Texto</b>"));
  assert(html.includes("<u>marcado</u>"));
  assert(!html.includes("<script"));
  assert(!html.includes("onerror"));
  assert(!html.includes("javascript:"));
  assert(!html.includes("<img"));
});

test("entrada de produção exporta o Express inicializado e atende saúde e autenticação", () => {
  const script = `
 import assert from 'node:assert/strict';
 import {once} from 'node:events';
 import app from './src/app.js';
 assert.equal(typeof app,'function');assert.equal(typeof app.listen,'function');
 assert.equal(app.locals.db,app.locals.pool);
 assert.equal(typeof app.locals.mailer.sendToken,'function');
 assert.equal(typeof app.locals.config.dummyPasswordHash,'string');
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try {
  const base='http://127.0.0.1:'+server.address().port;
  const health=await fetch(base+'/health');assert.equal(health.status,200);assert.equal((await health.json()).status,'ok');
  const protectedRoute=await fetch(base+'/api/writing/projects');assert.equal(protectedRoute.status,401);
  assert.equal(app.locals.pool.totalCount,0);
 } finally {await new Promise(resolve=>server.close(resolve));await app.locals.pool.end();}
 console.log('production-entry-ok');
 `;
  const result = spawnSync(
    process.execPath,
    ["--no-experimental-require-module", "--input-type=module", "-e", script],
    {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
      timeout: 15000,
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
        JWT_SECRET: "local-runtime-test-secret-at-least-32-characters",
        JWT_ISSUER: "runtime-test",
        FRONTEND_URL: "http://localhost:3000",
        CORS_ORIGINS: "http://localhost:8081",
        SMTP_HOST: "localhost",
        SMTP_PORT: "1025",
        SMTP_SECURE: "false",
        SMTP_USER: "",
        SMTP_PASSWORD: "",
        MAIL_FROM: "test@localhost.test",
      },
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /production-entry-ok/);
});
