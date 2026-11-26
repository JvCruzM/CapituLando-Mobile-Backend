import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "../src/create-app.js";

test("painel e coleções compartilham dados e mantêm isolamento entre contas", async (t) => {
  const db = new PGlite();
  await db.exec(
    await readFile(new URL("./project-schema.sql", import.meta.url), "utf8"),
  );
  const owners = [];
  for (const name of ["author", "other", "empty"]) {
    const { rows } = await db.query(
      "INSERT INTO users(email,password_hash,email_verified) VALUES($1,'test',true) RETURNING id",
      [name + "@example.test"],
    );
    owners.push(rows[0].id);
    await db.query(
      "INSERT INTO profiles(id,username,display_name) VALUES($1,$2,$2)",
      [rows[0].id, name],
    );
  }
  const pool = {
    query: db.query.bind(db),
    async connect() {
      return { query: db.query.bind(db), release() {} };
    },
  };
  const app = createApp([], {
    authenticate: (req, res, next) => {
      if (!req.headers["x-test-owner"])
        return res.status(401).json({ error: { code: "UNAUTHORIZED" } });
      res.locals.principal = { id: req.headers["x-test-owner"] };
      next();
    },
  });
  app.locals.db = pool;
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (
    path,
    status = 200,
    method = "GET",
    data,
    owner = owners[0],
    extra = {},
  ) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(owner ? { "x-test-owner": owner } : {}),
        ...extra,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const text = await r.text();
    assert.equal(r.status, status, path + ": " + text);
    return text ? JSON.parse(text) : null;
  };
  const first = await call("/api/stories", 201, "POST", { title: "Primeiro" }),
    second = await call("/api/stories", 201, "POST", { title: "Segundo" }),
    foreign = await call(
      "/api/stories",
      201,
      "POST",
      { title: "Outro" },
      owners[1],
    );
  await call("/api/writing/stories/" + first.id + "/items", 201, "POST", {
    title: "Capítulo",
    content: "<p>um dois tres</p>",
    kind: "chapter",
  });
  await call("/api/writing/stories/" + second.id + "/items", 201, "POST", {
    title: "Rascunho",
    content: "<p>um dois</p>",
    kind: "draft",
  });
  await call(
    "/api/writing/stories/" + foreign.id + "/items",
    201,
    "POST",
    { title: "Alheio", content: "<p>um dois tres quatro</p>", kind: "chapter" },
    owners[1],
  );
  const ideas = [
    {
      id: "i1",
      projectId: first.id,
      content: "Ideia real",
      category: "Mundo",
      createdAt: "2026-11-26T12:00:00.000Z",
    },
    {
      id: "i2",
      projectId: second.id,
      content: "Sugestão de Nome: Autora",
      category: "Nomes",
    },
  ];
  const goals = [
    {
      id: "g1",
      title: "Escrever",
      unit: "palavras",
      current: 5,
      target: 5,
      completed: true,
    },
    {
      id: "g2",
      title: "Revisar",
      unit: "páginas",
      current: 3,
      target: 5,
      completed: false,
      projectId: first.id,
    },
  ];
  await call("/api/workspace/ideas", 200, "PUT", { revision: 0, value: ideas });
  await call("/api/workspace/goals", 200, "PUT", { revision: 0, value: goals });
  await t.test(
    "painel usa somente os registros do usuário autenticado",
    async () => {
      assert.deepEqual(
        await call("/api/dashboard", 200, "GET", undefined, owners[0], {
          "x-user-id": owners[1],
        }),
        {
          storyCount: 2,
          chapterCount: 2,
          wordCount: 5,
          goals: { total: 2, completed: 1, percentage: 50 },
          ideaCount: 2,
        },
      );
      assert.deepEqual(
        await call("/api/dashboard", 200, "GET", undefined, owners[1]),
        {
          storyCount: 1,
          chapterCount: 1,
          wordCount: 4,
          goals: { total: 0, completed: 0, percentage: 0 },
          ideaCount: 0,
        },
      );
    },
  );
  await t.test(
    "conta vazia retorna zeros e chamadas sem principal válido são rejeitadas",
    async () => {
      assert.deepEqual(
        await call("/api/dashboard", 200, "GET", undefined, owners[2]),
        {
          storyCount: 0,
          chapterCount: 0,
          wordCount: 0,
          goals: { total: 0, completed: 0, percentage: 0 },
          ideaCount: 0,
        },
      );
      await call("/api/dashboard", 401, "GET", undefined, null, {
        "x-user-id": owners[0],
      });
      await call("/api/dashboard", 401, "GET", undefined, "invalid");
    },
  );
  await t.test(
    "categorias e sugestões persistem e a API rejeita o vínculo com livro alheio",
    async () => {
      assert.deepEqual((await call("/api/workspace/ideas")).value, ideas);
      await call("/api/workspace/ideas", 400, "PUT", {
        revision: 1,
        value: [{ ...ideas[0], projectId: foreign.id }],
      });
      assert.deepEqual((await call("/api/workspace/ideas")).value, ideas);
      const updated = ideas.map((item) =>
        item.id === "i2" ? { ...item, category: "Regras" } : item,
      );
      await call("/api/workspace/ideas", 200, "PUT", {
        revision: 1,
        value: updated,
      });
      assert.deepEqual((await call("/api/workspace/ideas")).value, updated);
      const backup = await call("/api/backup");
      assert.equal(backup.workspace.ideas.value[0].category, "Mundo");
      assert.equal(backup.workspace.ideas.value[1].category, "Regras");
    },
  );
  await t.test(
    "reabertura mantém o progresso enviado e os totais do painel são atualizados",
    async () => {
      const reopened = goals.map((item) =>
        item.id === "g1" ? { ...item, current: 4, completed: false } : item,
      );
      await call("/api/workspace/goals", 200, "PUT", {
        revision: 1,
        value: reopened,
      });
      assert.deepEqual((await call("/api/dashboard")).goals, {
        total: 2,
        completed: 0,
        percentage: 0,
      });
      assert.equal((await call("/api/workspace/goals")).value[0].current, 4);
      await call("/api/workspace/goals", 409, "PUT", {
        revision: 1,
        value: goals,
      });
      assert.equal((await call("/api/workspace/goals")).value[0].current, 4);
    },
  );
  await t.test(
    "progresso dos livros acompanha publicação como no web, inclusive no retorno ao salvar",
    async () => {
      const empty = await call("/api/stories", 201, "POST", {
        title: "Sem textos",
      });
      assert.equal(empty.progressPercentage, 0);
      const published = await call(
        "/api/writing/stories/" + second.id + "/items",
        201,
        "POST",
        {
          title: "Publicado",
          content: "<p>Texto final</p>",
          kind: "chapter",
          status: "PUBLISHED",
        },
      );
      assert(published.id);
      const books = await call("/api/stories");
      assert.equal(
        books.find((book) => book.id === second.id).progressPercentage,
        50,
      );
      assert.equal(
        books.find((book) => book.id === first.id).progressPercentage,
        0,
      );
      const completed = await call("/api/stories/" + second.id, 200, "PUT", {
        title: "Segundo",
        status: "COMPLETED",
      });
      assert.equal(completed.progressPercentage, 100);
      const reopened = await call("/api/stories/" + second.id, 200, "PUT", {
        title: "Segundo",
        status: "IN_PROGRESS",
      });
      assert.equal(reopened.progressPercentage, 50);
    },
  );
  await t.test("rota inexistente mantém acentuação correta", async () => {
    assert.equal(
      (await call("/rota-inexistente", 404)).error.message,
      "Rota não encontrada.",
    );
  });
});
