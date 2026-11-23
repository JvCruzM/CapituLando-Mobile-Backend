import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "../src/app.js";

test("fluxos mobile usam o esquema compartilhado e isolam contas", async (t) => {
  const db = new PGlite();
  await db.exec(
    await readFile(new URL("./project-schema.sql", import.meta.url), "utf8"),
  );
  const owners = [];
  for (const name of ["owner", "other"]) {
    const { rows } = await db.query(
      "INSERT INTO users(email,password_hash,email_verified) VALUES($1,'test',true) RETURNING id",
      [name + "@test.local"],
    );
    owners.push(rows[0].id);
    await db.query(
      "INSERT INTO profiles(id,username,display_name) VALUES($1,$2,$2)",
      [rows[0].id, name],
    );
  }
  let tail = Promise.resolve();
  const pool = {
    async connect() {
      const before = tail;
      let release;
      tail = new Promise((r) => {
        release = r;
      });
      await before;
      return { query: db.query.bind(db), release };
    },
    async query(sql, args) {
      const c = await this.connect();
      try {
        return await c.query(sql, args);
      } finally {
        c.release();
      }
    },
  };
  const app = createApp(["http://localhost"], {
    authenticate: (req, res, next) => {
      if (!req.headers["x-test-owner"])
        return res.status(401).json({ error: { code: "UNAUTHORIZED" } });
      res.locals.principal = {
        id: req.headers["x-test-owner"],
        sessionId: req.headers["x-test-session"] ?? "session-a",
      };
      next();
    },
  });
  app.locals.db = pool;
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (
    url,
    status = 200,
    method = "GET",
    data,
    owner = owners[0],
    headers = {},
  ) => {
    const r = await fetch(base + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(owner ? { "x-test-owner": owner } : {}),
        ...headers,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const text = await r.text();
    assert.equal(r.status, status, `${method} ${url}: ${text}`);
    return text ? JSON.parse(text) : null;
  };
  let story, foreign, chapter, second;
  await t.test(
    "histórias reais, propriedade e escrita sem confiar em cabeçalhos",
    async () => {
      story = await call("/api/stories", 201, "POST", {
        title: "Livro",
        genre: "Fantasia",
      });
      foreign = await call(
        "/api/stories",
        201,
        "POST",
        { title: "Livro alheio" },
        owners[1],
      );
      assert.equal((await call("/api/stories")).length, 1);
      assert.equal(
        (
          await call(
            "/api/writing/projects",
            200,
            "GET",
            undefined,
            owners[0],
            { "x-user-id": owners[1] },
          )
        ).projects[0].id,
        story.id,
      );
      await call(`/api/writing/stories/${foreign.id}/items`, 404, "POST", {
        title: "Invasão",
        content: "x",
        kind: "chapter",
      });
      await call("/api/writing/projects", 401, "GET", undefined, null, {
        "x-user-id": owners[0],
      });
      chapter = await call(
        `/api/writing/stories/${story.id}/items`,
        201,
        "POST",
        {
          title: "Capítulo",
          content: "<p>Olá mundo</p><script>alert(1)</script>",
          kind: "chapter",
        },
      );
      assert.equal(chapter.order_index, 1);
      assert.equal(chapter.version, 0);
      assert.equal(chapter.status, "IN_REVIEW");
      assert(!chapter.content.includes("script"));
      second = await call(
        `/api/writing/stories/${story.id}/items`,
        201,
        "POST",
        { title: "Rascunho", content: "Texto", kind: "draft" },
      );
      assert.equal(second.order_index, 2);
      assert.equal(
        (await call(`/api/writing/stories/${story.id}/items`)).drafts.length,
        1,
      );
    },
  );
  await t.test(
    "alterações concorrentes não sobrescrevem capítulos silenciosamente",
    async () => {
      const input = {
        title: "Atualizado",
        content: "Novo texto",
        kind: "chapter",
        expectedVersion: 0,
      };
      const request = () =>
        fetch(base + `/api/writing/stories/${story.id}/items/${chapter.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-test-owner": owners[0],
          },
          body: JSON.stringify(input),
        });
      const responses = await Promise.all([request(), request()]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
      const saved = await pool.query(
        "SELECT revision FROM chapters WHERE id=$1",
        [chapter.id],
      );
      assert.equal(Number(saved.rows[0].revision), 1);
    },
  );
  await t.test(
    "recuperação usa workspace do web e detecta conflito inclusive no primeiro documento",
    async () => {
      const input = {
        projectId: story.id,
        chapterId: chapter.id,
        title: "Em edição",
        content: "Texto pendente",
        kind: "chapter",
        chapterVersion: 1,
        expectedVersion: 0,
      };
      const saved = await call("/api/writing/workspace", 200, "PUT", input);
      assert.equal(saved.version, 1);
      const stored = await pool.query(
        "SELECT content FROM workspace_sections WHERE id=$1",
        [owners[0] + ":writing"],
      );
      assert.equal(JSON.parse(stored.rows[0].content).projectId, story.id);
      await call("/api/writing/workspace", 409, "PUT", input, owners[0], {
        "x-test-session": "session-b",
      });
      await pool.query(
        "UPDATE workspace_sections SET content=$1,revision=revision+1 WHERE id=$2",
        [
          JSON.stringify({ ...input, content: "Alterado no web" }),
          owners[0] + ":writing",
        ],
      );
      assert.equal(
        (await call("/api/writing/workspace?storyId=" + story.id)).content,
        "Alterado no web",
      );
      await call("/api/writing/workspace", 409, "PUT", {
        ...input,
        expectedVersion: 1,
        clear: true,
        content: "",
      });
      await call("/api/writing/workspace", 200, "PUT", {
        ...input,
        expectedVersion: 2,
        clear: true,
        content: "",
      });
      assert.equal(
        (await call("/api/writing/workspace?storyId=" + story.id)).content,
        "",
      );
      await call("/api/writing/workspace", 404, "PUT", {
        ...input,
        projectId: foreign.id,
        expectedVersion: 3,
      });
    },
  );
  await t.test(
    "metas e ideias persistem com revisão e propriedade",
    async () => {
      const goal = {
        id: "g1",
        title: "Escrever",
        unit: "palavras",
        current: 0,
        target: 500,
        completed: false,
      };
      assert.equal((await call("/api/workspace/goals")).revision, 0);
      await call("/api/workspace/goals", 200, "PUT", {
        revision: 0,
        value: [goal],
      });
      await call("/api/workspace/goals", 409, "PUT", {
        revision: 0,
        value: [],
      });
      assert.equal(
        (await call("/api/workspace/goals", 200, "GET", undefined, owners[1]))
          .value.length,
        0,
      );
      await call("/api/workspace/ideas", 400, "PUT", {
        revision: 0,
        value: [{ id: "i1", projectId: foreign.id, content: "Alheia" }],
      });
      await call("/api/workspace/ideas", 200, "PUT", {
        revision: 0,
        value: [{ id: "i1", projectId: story.id, content: "Ideia real" }],
      });
    },
  );
  let character, otherCharacter, location, organization, event, link;
  await t.test(
    "personagens, locais, organizações, regras e relacionamentos funcionam no esquema compartilhado",
    async () => {
      const prefix = `/api/stories/${story.id}`;
      location = await call(prefix + "/locations", 201, "POST", {
        name: "Cidade",
      });
      organization = await call(prefix + "/organizations", 201, "POST", {
        name: "Guilda",
        headquartersLocationId: location.id,
      });
      const rule = await call(prefix + "/world-rules", 201, "POST", {
        title: "Regra",
      });
      assert.equal(rule.category, "Geral");
      character = await call(prefix + "/characters", 201, "POST", {
        name: "Ana",
        description: "Original",
        age: 25,
      });
      otherCharacter = await call(prefix + "/characters", 201, "POST", {
        name: "Bia",
      });
      const beforeCount = (await call(prefix + "/characters")).length;
      await call(prefix + "/characters", 400, "POST", {
        name: "Não gravar",
        organizationId: foreign.id,
      });
      assert.equal((await call(prefix + "/characters")).length, beforeCount);
      const foreignChar = await call(
        `/api/stories/${foreign.id}/characters`,
        201,
        "POST",
        { name: "Outro" },
        owners[1],
      );
      await call(prefix + "/character-relationships", 400, "POST", {
        sourceCharacterId: character.id,
        targetCharacterId: foreignChar.id,
        type: "Aliado",
      });
      await call(prefix + "/character-relationships", 201, "POST", {
        sourceCharacterId: character.id,
        targetCharacterId: otherCharacter.id,
        type: "Aliado",
        level: 5,
      });
      await call(prefix + "/character-organizations", 201, "POST", {
        characterId: character.id,
        organizationId: organization.id,
      });
      assert.equal((await call(prefix + "/characters")).length, 2);
      await call(
        prefix + "/characters/" + character.id,
        404,
        "PUT",
        { name: "Tentativa" },
        owners[1],
      );
      await call(prefix + "/locations/" + location.id, 409, "DELETE");
      await call(prefix + "/characters/" + character.id, 409, "DELETE");
    },
  );
  await t.test(
    "eventos, participantes e referências entre histórias são validados",
    async () => {
      const prefix = `/api/stories/${story.id}`;
      event = await call(prefix + "/events", 201, "POST", {
        title: "Encontro",
        chapterId: chapter.id,
        locationId: location.id,
      });
      await call(prefix + "/events/" + event.id, 400, "PUT", {
        title: "Não sobrescrever",
        characterIds: [foreign.id],
      });
      assert.equal(
        (await call(prefix + "/events/" + event.id)).title,
        "Encontro",
      );
      const atomicEvent = await call(prefix + "/events", 201, "POST", {
        title: "Evento com participantes",
        characterIds: [character.id, otherCharacter.id],
      });
      assert.equal(
        (await call(prefix + "/event-characters")).filter(
          (x) => x.eventId === atomicEvent.id,
        ).length,
        2,
      );
      link = await call(prefix + "/event-characters", 201, "POST", {
        eventId: event.id,
        characterId: character.id,
      });
      assert.equal(
        (await call(prefix + "/event-characters")).filter(
          (x) => x.eventId === event.id,
        ).length,
        1,
      );
      await call(prefix + "/events/" + event.id, 409, "DELETE");
      await call(prefix + "/event-characters/" + link.id, 204, "DELETE");
      await call(prefix + "/events/" + event.id, 204, "DELETE");
      await call(
        prefix + "/events",
        404,
        "POST",
        { title: "Outro" },
        owners[1],
      );
    },
  );
  await t.test(
    "backup inclui escrita pendente, metas e ideias, aceita mais de 100 KB e restaura",
    async () => {
      await call("/api/writing/workspace", 200, "PUT", {
        projectId: story.id,
        chapterId: chapter.id,
        title: "Pendente",
        content: "A".repeat(130000),
        kind: "chapter",
        expectedVersion: 3,
        chapterVersion: 1,
      });
      const backup = await call("/api/backup");
      assert.equal(backup.workspace.writing.value.content.length, 130000);
      assert.equal(backup.workspace.ideas.value[0].content, "Ideia real");
      await call("/api/backup", 204, "POST", backup);
      assert.equal((await call("/api/stories")).length, 1);
      const restored = await call("/api/backup");
      assert.equal(restored.workspace.writing.value.content.length, 130000);
      const restoredStory = (await call("/api/stories"))[0];
      const restoredRecovery = await call(
        "/api/writing/workspace?storyId=" + restoredStory.id,
      );
      assert.equal(restoredRecovery.chapterRevision, 0);
      const afterRestore = await call(
        "/api/writing/stories/" +
          restoredStory.id +
          "/items/" +
          restoredRecovery.chapterId,
        200,
        "PUT",
        {
          title: "Após restauração",
          content: restoredRecovery.content,
          kind: restoredRecovery.kind,
          expectedVersion: 0,
        },
      );
      assert.equal(afterRestore.version, 1);
      await call("/api/stories/" + restoredStory.id, 204, "DELETE");
      assert.equal((await call("/api/workspace/ideas")).value.length, 0);
      assert.equal((await call("/api/workspace/goals")).value.length, 1);
      assert.equal(
        (await call("/api/stories", 200, "GET", undefined, owners[1])).length,
        1,
      );
    },
  );
});
