import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import vm from "node:vm";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "../src/create-app.js";
import { readEnvironment } from "../src/config/env.js";
import { hashPassword } from "../src/shared/utils/crypto.js";
import { installProjectSchema } from "./schema.js";

const readExport = async (file) =>
  JSON.parse(
    await readFile(new URL("../postman/" + file, import.meta.url), "utf8"),
  );

test("coleções Postman executam CRUD, vínculos, isolamento e revogação em banco temporário", async (t) => {
  const db = new PGlite();
  await installProjectSchema(db);
  const password = "PostmanTeste123!";
  const passwordHash = await hashPassword(password);
  for (const name of ["postman", "other"]) {
    const {
      rows: [user],
    } = await db.query(
      "INSERT INTO users(email,password_hash,email_verified) VALUES($1,$2,true) RETURNING id",
      [name + "@example.test", passwordHash],
    );
    await db.query(
      "INSERT INTO profiles(id,username,display_name) VALUES($1,$2,$2)",
      [user.id, name],
    );
    await db.query(
      "INSERT INTO stories(profile_id,title) VALUES($1,'Livro preexistente')",
      [user.id],
    );
  }
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
    async query(sql, args) {
      const client = await this.connect();
      try {
        return await client.query(sql, args);
      } finally {
        client.release();
      }
    },
  };
  const config = readEnvironment({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://localhost/test",
    JWT_SECRET: "postman-local-test-secret-".repeat(3),
  });
  config.dummyPasswordHash = passwordHash;
  const app = createApp([], { config, mailer: { async sendToken() {} } });
  app.locals.db = pool;
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  const environmentFile = await readExport(
    "CapituLando-Vercel.postman_environment.json",
  );
  const environment = new Map(
    environmentFile.values.map(({ key, value }) => [key, value]),
  );
  environment.set("baseUrl", `http://127.0.0.1:${server.address().port}`);
  environment.set("email", "postman@example.test");
  environment.set("password", password);
  environment.set("otherEmail", "other@example.test");
  environment.set("otherPassword", password);
  const scope = (map) => ({
    get: (key) => map.get(key),
    set: (key, value) => map.set(key, value),
    unset: (key) => map.delete(key),
  });
  async function run(collection, item) {
    const local = new Map();
    const collectionValues = new Map(
      collection.variable.map(({ key, value }) => [key, value]),
    );
    const variables = {
      get: (key) =>
        local.has(key)
          ? local.get(key)
          : environment.has(key)
            ? environment.get(key)
            : collectionValues.get(key),
      set: (key, value) => local.set(key, value),
    };
    const pm = {
      environment: scope(environment),
      collectionVariables: scope(collectionValues),
      variables,
      test(name, check) {
        try {
          check();
        } catch (error) {
          throw new Error(`${item.name} / ${name}: ${error.message}`);
        }
      },
    };
    const script = (listen) => {
      for (const event of item.event ?? [])
        if (event.listen === listen)
          vm.runInNewContext(
            event.script.exec.join("\n"),
            { pm },
            { timeout: 1000 },
          );
    };
    script("prerequest");
    const substitute = (text) =>
      text.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
        const value = variables.get(key);
        assert.notEqual(value, undefined, `Variável ausente: ${key}`);
        return String(value);
      });
    const request = item.request;
    const headers = Object.fromEntries(
      request.header.map(({ key, value }) => [key, substitute(value)]),
    );
    const auth = request.auth ?? collection.auth;
    if (auth.type === "bearer")
      headers.Authorization =
        "Bearer " +
        substitute(auth.bearer.find((v) => v.key === "token").value);
    const response = await fetch(substitute(request.url), {
      method: request.method,
      headers,
      body: request.body ? substitute(request.body.raw) : undefined,
    });
    const body = await response.text();
    pm.response = { code: response.status, json: () => JSON.parse(body) };
    try {
      script("test");
    } catch (error) {
      throw new Error(
        `${request.method} ${request.url}: ${body}\n${error.message}`,
      );
    }
  }

  await t.test(
    "roteiro completo do vídeo preserva livros existentes",
    async () => {
      const video = await readExport(
        "CapituLando-Video.postman_collection.json",
      );
      let count = 0;
      for (const folder of video.item)
        for (const request of folder.item) {
          await run(video, request);
          count++;
        }
      assert.equal(count, 30);
      assert.equal(
        (await db.query("SELECT count(*)::int AS total FROM stories")).rows[0]
          .total,
        2,
      );
      for (const table of [
        "races",
        "characters",
        "organizations",
        "character_relationships",
        "character_organizations",
      ]) {
        assert.equal(
          (await db.query(`SELECT count(*)::int AS total FROM ${table}`))
            .rows[0].total,
          0,
        );
      }
    },
  );

  await t.test(
    "catálogo completo, revisões de ideias/metas e conta alheia",
    async () => {
      const api = await readExport("CapituLando-API.postman_collection.json");
      await run(
        api,
        api.item[0].item.find((r) => r.name === "Entrar"),
      );
      const deferred = [];
      for (const folder of api.item.slice(2, 15)) {
        for (const request of folder.item) {
          if (request.request.method === "DELETE") deferred.push(request);
          else await run(api, request);
        }
      }
      for (const folder of api.item.slice(15))
        for (const request of folder.item) await run(api, request);
      for (const request of deferred.reverse()) await run(api, request);
      assert.equal(
        (await db.query("SELECT count(*)::int AS total FROM stories")).rows[0]
          .total,
        2,
      );
    },
  );
});
