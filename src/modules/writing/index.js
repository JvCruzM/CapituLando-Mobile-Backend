import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../shared/errors/index.js";
import { transaction } from "../../database/transaction.js";
import {
  createJsonBodyParser,
  requireValidPrincipal,
} from "../../shared/middlewares/security.js";
import { cleanChapterHtml } from "../backups/schemas/restore-records.js";

const uuid = z.guid();
const inputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().max(2000000),
  kind: z.enum(["chapter", "draft"]),
  status: z
    .preprocess(
      (v) => (typeof v === "string" ? v.toUpperCase() : v),
      z.enum(["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"]),
    )
    .optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
  forceOverwrite: z.boolean().default(false),
});

const fail = (status, code, message, details) => {
  throw new AppError(status, code, message, details);
};

const parse = (schema, value) => {
  const result = schema.safeParse(value);
  if (!result.success) {
    fail(400, "VALIDATION_ERROR", "Confira os dados enviados.");
  }
  return result.data;
};

const item = (row) => ({
  ...row,
  storyId: row.story_id,
  wordCount: row.word_count,
  updatedAt: row.updated_at,
  kind: row.status === "DRAFT" ? "draft" : "chapter",
  version: Number(row.revision),
});

const split = (rows) => ({
  chapters: rows.filter((r) => r.status !== "DRAFT").map(item),
  drafts: rows.filter((r) => r.status === "DRAFT").map(item),
});

async function ownedStory(db, owner, story, lock = false) {
  parse(uuid, story);
  const { rows } = await db.query(
    `SELECT id FROM stories WHERE id=$1 AND profile_id=$2${lock ? " FOR UPDATE" : ""}`,
    [story, owner],
  );
  if (!rows.length) {
    fail(404, "STORY_NOT_FOUND", "História não encontrada.");
  }
}

async function lockOwner(db, owner) {
  await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [owner]);
}

const recovery = (row) => {
  const value = row ? JSON.parse(row.content) : {};
  return {
    ...value,
    storyId: value.projectId ?? null,
    kind: value.kind ?? value.type ?? "chapter",
    version: Number(row?.revision ?? 0),
  };
};

export function createWritingRouter(authenticate) {
  const router = Router();
  router.use(
    authenticate,
    requireValidPrincipal,
    ...createJsonBodyParser("3mb"),
  );

  router.get("/projects", async (req, res) => {
    const { rows } = await req.app.locals.db.query(
      "SELECT id, title, genre FROM stories WHERE profile_id=$1 ORDER BY title,id",
      [res.locals.principal.id],
    );
    res.json({ projects: rows });
  });

  router.get("/stories/:storyId/items", async (req, res) => {
    const db = req.app.locals.db;
    await ownedStory(db, res.locals.principal.id, req.params.storyId);
    const { rows } = await db.query(
      "SELECT * FROM chapters WHERE story_id=$1 ORDER BY order_index,id",
      [req.params.storyId],
    );
    res.json(split(rows));
  });

  router.get("/stories/:storyId/items/:itemId", async (req, res) => {
    const db = req.app.locals.db;
    await ownedStory(db, res.locals.principal.id, req.params.storyId);
    parse(uuid, req.params.itemId);
    const { rows } = await db.query(
      "SELECT * FROM chapters WHERE id=$1 AND story_id=$2",
      [req.params.itemId, req.params.storyId],
    );
    if (!rows.length) {
      fail(404, "ITEM_NOT_FOUND", "Capítulo não encontrado.");
    }
    res.json(item(rows[0]));
  });

  const save = (update) => async (req, res) => {
    const data = parse(inputSchema, req.body);
    const owner = res.locals.principal.id;
    const saved = await transaction(req.app.locals.db, async (db) => {
      await lockOwner(db, owner);
      await ownedStory(db, owner, req.params.storyId, true);
      let current;
      if (update) {
        parse(uuid, req.params.itemId);
        const { rows } = await db.query(
          "SELECT * FROM chapters WHERE id=$1 AND story_id=$2 FOR UPDATE",
          [req.params.itemId, req.params.storyId],
        );
        current = rows[0];
        if (!current) {
          fail(404, "ITEM_NOT_FOUND", "Capítulo não encontrado.");
        }
        if (
          !data.forceOverwrite &&
          data.expectedVersion !== Number(current.revision)
        ) {
          fail(
            409,
            "VERSION_CONFLICT",
            "O texto foi alterado em outra sessão.",
            { serverItem: item(current) },
          );
        }
      }
      const content = cleanChapterHtml(data.content);
      const count = content
        .replace(/<[^>]*>/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
      const status =
        data.status ??
        (data.kind === "draft"
          ? "DRAFT"
          : current && current.status !== "DRAFT"
            ? current.status
            : "IN_REVIEW");
      const { rows } = update
        ? await db.query(
            "UPDATE chapters SET title=$1,content=$2,word_count=$3,status=$4,revision=revision+1,updated_at=now() WHERE id=$5 RETURNING *",
            [data.title, content, count, status, current.id],
          )
        : await db.query(
            "INSERT INTO chapters(story_id,order_index,title,content,word_count,status) SELECT $1,COALESCE(MAX(order_index),0)+1,$2,$3,$4,$5 FROM chapters WHERE story_id=$1 RETURNING *",
            [req.params.storyId, data.title, content, count, status],
          );
      return item(rows[0]);
    });
    res.status(update ? 200 : 201).json(saved);
  };

  router.post("/stories/:storyId/items", save(false));
  router.put("/stories/:storyId/items/:itemId", save(true));

  router.delete("/stories/:storyId/items/:itemId", async (req, res) => {
    await transaction(req.app.locals.db, async (db) => {
      await lockOwner(db, res.locals.principal.id);
      await ownedStory(db, res.locals.principal.id, req.params.storyId, true);
      parse(uuid, req.params.itemId);
      await db.query(
        "UPDATE events SET chapter_id=NULL,updated_at=now() WHERE story_id=$1 AND chapter_id=$2",
        [req.params.storyId, req.params.itemId],
      );
      const { rowCount } = await db.query(
        "DELETE FROM chapters WHERE id=$1 AND story_id=$2",
        [req.params.itemId, req.params.storyId],
      );
      if (!rowCount) {
        fail(404, "ITEM_NOT_FOUND", "Capítulo não encontrado.");
      }
      const key = `${res.locals.principal.id}:writing`;
      const { rows } = await db.query(
        "SELECT content FROM workspace_sections WHERE id=$1",
        [key],
      );
      const state = rows[0] ? JSON.parse(rows[0].content) : null;
      if (state?.chapterId === req.params.itemId) {
        await db.query(
          "UPDATE workspace_sections SET content=$1,revision=revision+1 WHERE id=$2",
          [
            JSON.stringify({
              ...state,
              chapterId: null,
              chapterRevision: 0,
              chapterVersion: 0,
              kind: "draft",
              type: "draft",
            }),
            key,
          ],
        );
      }
    });
    res.status(204).end();
  });

  router.get("/workspace", async (req, res) => {
    await ownedStory(
      req.app.locals.db,
      res.locals.principal.id,
      req.query.storyId,
    );
    const { rows } = await req.app.locals.db.query(
      "SELECT content,revision FROM workspace_sections WHERE id=$1",
      [`${res.locals.principal.id}:writing`],
    );
    const state = recovery(rows[0]);
    res.json(
      state.projectId === req.query.storyId
        ? state
        : { content: "", version: state.version },
    );
  });

  router.put("/workspace", async (req, res) => {
    const data = parse(
      z.object({
        projectId: uuid,
        chapterId: uuid.nullish(),
        kind: z.enum(["chapter", "draft"]),
        status: z
          .preprocess(
            (v) => (typeof v === "string" ? v.toUpperCase() : v),
            z.enum(["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"]),
          )
          .optional(),
        title: z.string().max(200),
        content: z.string().max(2000000),
        expectedVersion: z.number().int().nonnegative(),
        chapterVersion: z.number().int().nonnegative().optional(),
        clear: z.boolean().default(false),
      }),
      req.body,
    );
    const saved = await transaction(req.app.locals.db, async (db) => {
      const owner = res.locals.principal.id;
      await lockOwner(db, owner);
      await ownedStory(db, owner, data.projectId);
      if (data.chapterId) {
        const { rows } = await db.query(
          "SELECT id FROM chapters WHERE id=$1 AND story_id=$2",
          [data.chapterId, data.projectId],
        );
        if (!rows.length) {
          fail(400, "INVALID_CHAPTER", "O capítulo não pertence à história.");
        }
      }
      const key = `${owner}:writing`;
      const { rows } = await db.query(
        "SELECT content,revision FROM workspace_sections WHERE id=$1",
        [key],
      );
      const current = recovery(rows[0]);
      if (data.expectedVersion !== current.version) {
        fail(409, "SESSION_CONFLICT", "A escrita mudou em outra sessão.", {
          serverState: current,
        });
      }
      const value = data.clear
        ? {}
        : {
            projectId: data.projectId,
            chapterId: data.chapterId ?? null,
            kind: data.kind,
            type: data.kind,
            status:
              data.status ?? (data.kind === "draft" ? "DRAFT" : "IN_REVIEW"),
            title: data.title,
            content: cleanChapterHtml(data.content),
            chapterVersion: data.chapterVersion ?? 0,
            chapterRevision: data.chapterVersion ?? 0,
            sessionId: res.locals.principal.sessionId,
            updatedAt: new Date().toISOString(),
          };
      const { rows: result } = await db.query(
        "INSERT INTO workspace_sections(id,content,revision) VALUES($1,$2,1) ON CONFLICT(id) DO UPDATE SET content=EXCLUDED.content,revision=workspace_sections.revision+1 RETURNING content,revision",
        [key, JSON.stringify(value)],
      );
      return recovery(result[0]);
    });
    res.json(saved);
  });

  return router;
}
