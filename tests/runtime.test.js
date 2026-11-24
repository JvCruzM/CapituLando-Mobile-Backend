import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { createApp } from "../src/app.js";
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
