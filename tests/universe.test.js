import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "../src/create-app.js";

test("enciclopédia consulta somente histórias e registros do proprietário", async () => {
  const db = new PGlite();
  await db.exec(
    await readFile(new URL("./auth-schema.sql", import.meta.url), "utf8"),
  );
  for (const table of [
    "chapters",
    "creatures",
    "items",
    "locations",
    "organizations",
    "world_rules",
    "characters",
    "events",
    "event_characters",
    "character_organizations",
  ])
    await db.exec(
      `CREATE TABLE ${table} (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), story_id UUID REFERENCES stories(id), name TEXT)`,
    );
  const {
    rows: [owner],
  } = await db.query(
    "INSERT INTO users(email,password_hash) VALUES('owner@test.local','test') RETURNING id",
  );
  const {
    rows: [other],
  } = await db.query(
    "INSERT INTO users(email,password_hash) VALUES('other@test.local','test') RETURNING id",
  );
  for (const [id, name] of [
    [owner.id, "owner"],
    [other.id, "other"],
  ])
    await db.query(
      "INSERT INTO profiles(id,username,display_name) VALUES($1,$2,$2)",
      [id, name],
    );
  const {
    rows: [story],
  } = await db.query(
    "INSERT INTO stories(profile_id,title) VALUES($1,'História própria') RETURNING id",
    [owner.id],
  );
  const {
    rows: [foreign],
  } = await db.query(
    "INSERT INTO stories(profile_id,title) VALUES($1,'História alheia') RETURNING id",
    [other.id],
  );
  await db.query(
    "INSERT INTO races(story_id,name,culture,appearance,habitat,race_image) VALUES($1,'Raça real','Cultura','Aparência','Habitat','https://example.test/race.png')",
    [story.id],
  );
  await db.query("INSERT INTO races(story_id,name) VALUES($1,'Raça alheia')", [
    foreign.id,
  ]);
  await db.query("INSERT INTO workspace_sections(id,content) VALUES($1,$2)", [
    owner.id + ":concepts",
    JSON.stringify([
      { id: "one", projectId: story.id, title: "Conceito próprio" },
      { id: "two", projectId: foreign.id, title: "Outro projeto" },
    ]),
  ]);
  await db.query("INSERT INTO workspace_sections(id,content) VALUES($1,$2)", [
    other.id + ":events",
    JSON.stringify([
      { id: "foreign", projectId: story.id, title: "Documento de outra conta" },
    ]),
  ]);
  let tail = Promise.resolve();
  const pool = {
    async connect() {
      const before = tail;
      let release;
      tail = new Promise((resolve) => {
        release = resolve;
      });
      await before;
      return { query: db.query.bind(db), release };
    },
    async query(sql, values) {
      const c = await this.connect();
      try {
        return await c.query(sql, values);
      } finally {
        c.release();
      }
    },
  };
  const app = createApp([], {
    authenticate(req, res, next) {
      const id = req.get("Authorization");
      if (![owner.id, other.id].includes(id)) return res.sendStatus(401);
      res.locals.principal = { id };
      next();
    },
  });
  app.locals.db = pool;
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api/universe`;
  const call = (path, id = owner.id) =>
    fetch(base + path, { headers: id ? { Authorization: id } : {} });
  try {
    assert.equal((await call("/stories", null)).status, 401);
    assert.equal((await call(`/stories/${story.id}`, null)).status, 401);
    assert.equal((await call("/stories/not-a-uuid")).status, 400);
    assert.equal((await call(`/stories/${foreign.id}`)).status, 404);
    assert.equal((await call(`/stories/${story.id}`, other.id)).status, 404);
    assert.deepEqual(await (await call("/stories")).json(), [
      { id: story.id, title: "História própria" },
    ]);
    const snapshot = await (await call(`/stories/${story.id}`)).json();
    assert.equal(snapshot.races.length, 1);
    assert.equal(snapshot.races[0].name, "Raça real");
    assert.equal(snapshot.races[0].culture, "Cultura");
    assert.equal(snapshot.races[0].race_image, "https://example.test/race.png");
    assert.deepEqual(
      snapshot.concepts.map((row) => row.title),
      ["Conceito próprio"],
    );
    assert.deepEqual(snapshot.chronology, []);
    assert.deepEqual(snapshot.characters, []);
    await db.query("DELETE FROM races WHERE story_id=$1", [story.id]);
    assert.deepEqual(
      (await (await call(`/stories/${story.id}`)).json()).races,
      [],
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  }
});
