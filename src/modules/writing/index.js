import express from "express";
import { authenticate as defaultAuthenticate } from "../../shared/middlewares/auth.js";

function countWords(text = "") {
  const clean = String(text).replace(/<[^>]*>/g, " ").trim();
  return clean ? clean.split(/\s+/).length : 0;
}

function getPool(req) {
  return req.app?.locals?.pool || req.app?.locals?.config?.pool;
}

function getUserId(req) {
  const uid =
    req.user?.id ||
    req.user?.userId ||
    req.user?.sub ||
    req.headers["x-user-id"];
  return uid ? String(uid) : null;
}

export function createWritingRouter(authenticate = defaultAuthenticate) {
  const router = express.Router();

  router.use(authenticate);

  router.use((req, res, next) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado." },
      });
    }
    req.writingUserId = userId;
    req.writingSessionId = req.headers["x-session-id"]
      ? String(req.headers["x-session-id"])
      : null;
    next();
  });

  // GET /api/writing/projects
  router.get("/projects", async (req, res, next) => {
    try {
      const pool = getPool(req);
      const { rows: stories } = await pool.query(
        `SELECT id, title, genre, description, created_at, updated_at
         FROM stories
         WHERE user_id = $1
         ORDER BY updated_at DESC`,
        [req.writingUserId],
      );

      const { rows: items } = await pool.query(
        `SELECT id, story_id, title, content, word_count, kind, version, updated_at
         FROM chapters
         WHERE user_id = $1
         ORDER BY updated_at ASC`,
        [req.writingUserId],
      );

      const projects = stories.map((story) => {
        const storyItems = items.filter((i) => i.story_id === story.id);
        return {
          ...story,
          chapters: storyItems.filter((i) => i.kind === "chapter"),
          drafts: storyItems.filter((i) => i.kind === "draft"),
        };
      });

      res.json({ projects });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/writing/stories/:storyId/items
  router.get("/stories/:storyId/items", async (req, res, next) => {
    try {
      const pool = getPool(req);
      const { storyId } = req.params;

      const { rows } = await pool.query(
        `SELECT id, story_id, title, content, word_count, kind, version, updated_at
         FROM chapters
         WHERE user_id = $1 AND story_id = $2
         ORDER BY updated_at ASC`,
        [req.writingUserId, storyId],
      );

      res.json({
        chapters: rows.filter((r) => r.kind === "chapter"),
        drafts: rows.filter((r) => r.kind === "draft"),
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/writing/stories/:storyId/items
  router.post("/stories/:storyId/items", async (req, res, next) => {
    const pool = getPool(req);
    const client = await pool.connect();
    try {
      const { storyId } = req.params;
      const { title, content = "", kind = "chapter", status } = req.body || {};
      const resolvedKind =
        kind === "draft" || status === "DRAFT" ? "draft" : "chapter";
      const cleanTitle = String(title || "Sem Título").trim() || "Sem Título";
      const cleanContent = String(content);
      const words = countWords(cleanContent);

      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO chapters (story_id, user_id, title, content, word_count, kind, version)
         VALUES ($1, $2, $3, $4, $5, $6, 1)
         RETURNING id, story_id, title, content, word_count, kind, version, updated_at`,
        [storyId, req.writingUserId, cleanTitle, cleanContent, words, resolvedKind],
      );

      const created = rows[0];
      await client.query(
        `INSERT INTO chapter_versions (chapter_id, version, title, content, kind, session_id)
         VALUES ($1, 1, $2, $3, $4, $5)`,
        [
          created.id,
          created.title,
          created.content,
          created.kind,
          req.writingSessionId,
        ],
      );
      await client.query("COMMIT");
      res.status(201).json(created);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  // PUT /api/writing/stories/:storyId/items/:itemId
  router.put("/stories/:storyId/items/:itemId", async (req, res, next) => {
    const pool = getPool(req);
    const client = await pool.connect();
    try {
      const { storyId, itemId } = req.params;
      const {
        title,
        content = "",
        kind = "chapter",
        status,
        expectedVersion,
        forceOverwrite = false,
      } = req.body || {};

      const resolvedKind =
        kind === "draft" || status === "DRAFT" ? "draft" : "chapter";

      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT id, story_id, title, content, word_count, kind, version, updated_at
         FROM chapters
         WHERE id = $1 AND story_id = $2 AND user_id = $3
         FOR UPDATE`,
        [itemId, storyId, req.writingUserId],
      );

      if (!rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          error: { code: "ITEM_NOT_FOUND", message: "Item não encontrado." },
        });
      }

      const current = rows[0];
      if (
        !forceOverwrite &&
        typeof expectedVersion === "number" &&
        expectedVersion !== current.version
      ) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: {
            code: "VERSION_CONFLICT",
            message: "Conflito de versão: este texto foi alterado em outra sessão.",
            details: { serverItem: current },
          },
        });
      }

      const nextVersion = current.version + 1;
      const cleanTitle = String(title || "Sem Título").trim() || "Sem Título";
      const cleanContent = String(content);
      const words = countWords(cleanContent);

      const { rows: updatedRows } = await client.query(
        `UPDATE chapters
         SET title = $1,
             content = $2,
             word_count = $3,
             kind = $4,
             version = $5,
             updated_at = NOW()
         WHERE id = $6
         RETURNING id, story_id, title, content, word_count, kind, version, updated_at`,
        [cleanTitle, cleanContent, words, resolvedKind, nextVersion, itemId],
      );

      const updated = updatedRows[0];
      await client.query(
        `INSERT INTO chapter_versions (chapter_id, version, title, content, kind, session_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          updated.id,
          updated.version,
          updated.title,
          updated.content,
          updated.kind,
          req.writingSessionId,
        ],
      );

      await client.query("COMMIT");
      res.json(updated);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  // GET /api/writing/workspace
  router.get("/workspace", async (req, res, next) => {
    try {
      const pool = getPool(req);
      const storyId = req.query.storyId ? String(req.query.storyId) : null;
      if (!storyId) return res.json(null);

      const { rows } = await pool.query(
        `SELECT story_id AS "projectId",
                chapter_id AS "chapterId",
                kind,
                title,
                content,
                session_id AS "sessionId",
                version,
                updated_at AS "updatedAt"
         FROM writing_space_state
         WHERE user_id = $1 AND story_id = $2`,
        [req.writingUserId, storyId],
      );

      res.json(rows[0] || null);
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/writing/workspace
  router.put("/workspace", async (req, res, next) => {
    const pool = getPool(req);
    const client = await pool.connect();
    try {
      const {
        projectId,
        storyId,
        chapterId = null,
        kind = "chapter",
        type,
        title = "Novo Capítulo",
        content = "",
        expectedVersion,
        forceOverwrite = false,
      } = req.body || {};

      const resolvedStoryId = projectId || storyId || null;
      const resolvedKind =
        kind === "draft" || type === "draft" ? "draft" : "chapter";

      if (!content && !chapterId) {
        if (resolvedStoryId) {
          await pool.query(
            "DELETE FROM writing_space_state WHERE user_id = $1 AND story_id = $2",
            [req.writingUserId, resolvedStoryId],
          );
        }
        return res.json({ cleared: true });
      }

      if (!resolvedStoryId) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "projectId/storyId é obrigatório.",
          },
        });
      }

      await client.query("BEGIN");
      const { rows: existing } = await client.query(
        `SELECT story_id AS "projectId",
                chapter_id AS "chapterId",
                kind,
                title,
                content,
                session_id AS "sessionId",
                version,
                updated_at AS "updatedAt"
         FROM writing_space_state
         WHERE user_id = $1 AND story_id = $2
         FOR UPDATE`,
        [req.writingUserId, resolvedStoryId],
      );

      const current = existing[0];
      if (
        current &&
        !forceOverwrite &&
        req.writingSessionId &&
        current.sessionId &&
        current.sessionId !== req.writingSessionId &&
        typeof expectedVersion === "number" &&
        expectedVersion !== current.version
      ) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: {
            code: "SESSION_CONFLICT",
            message: "Conflito entre sessões no espaço de escrita.",
            details: { serverState: current },
          },
        });
      }

      const nextVersion = current ? current.version + 1 : 1;
      const { rows: saved } = await client.query(
        `INSERT INTO writing_space_state
           (user_id, story_id, chapter_id, kind, title, content, session_id, version, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (user_id, story_id) DO UPDATE SET
           chapter_id = EXCLUDED.chapter_id,
           kind = EXCLUDED.kind,
           title = EXCLUDED.title,
           content = EXCLUDED.content,
           session_id = EXCLUDED.session_id,
           version = EXCLUDED.version,
           updated_at = NOW()
         RETURNING story_id AS "projectId",
                   chapter_id AS "chapterId",
                   kind,
                   title,
                   content,
                   session_id AS "sessionId",
                   version,
                   updated_at AS "updatedAt"`,
        [
          req.writingUserId,
          resolvedStoryId,
          chapterId,
          resolvedKind,
          title,
          content,
          req.writingSessionId,
          nextVersion,
        ],
      );

      await client.query("COMMIT");
      res.json(saved[0]);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  return router;
}