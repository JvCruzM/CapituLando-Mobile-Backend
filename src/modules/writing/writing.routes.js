import express from 'express';
import { AppError, asyncHandler } from '../../shared/errors.js';

function countWords(text = '') {
  const clean = String(text).replace(/<[^>]*>/g, ' ').trim();
  return clean ? clean.split(/\s+/).length : 0;
}

export function requireWritingUser(req, _res, next) {
  const userId =
    req.user?.id ||
    req.user?.userId ||
    req.user?.sub ||
    req.headers['x-user-id'];

  if (!userId) {
    return next(
      new AppError('Usuário não autenticado.', 401, 'UNAUTHORIZED'),
    );
  }

  req.user = { ...req.user, id: String(userId) };
  req.sessionId = req.headers['x-session-id']
    ? String(req.headers['x-session-id'])
    : null;
  next();
}

export function createWritingRouter(pool) {
  const router = express.Router();

  // GET /api/writing/projects
  router.get(
    '/projects',
    asyncHandler(async (req, res) => {
      const userId = req.user.id;

      const { rows: stories } = await pool.query(
        `SELECT id, title, genre, description, created_at, updated_at
         FROM stories
         WHERE user_id = $1
         ORDER BY updated_at DESC`,
        [userId],
      );

      const { rows: items } = await pool.query(
        `SELECT id, story_id, title, content, word_count, kind, version, updated_at
         FROM chapters
         WHERE user_id = $1
         ORDER BY updated_at ASC`,
        [userId],
      );

      const projects = stories.map((story) => {
        const storyItems = items.filter((i) => i.story_id === story.id);
        return {
          ...story,
          chapters: storyItems.filter((i) => i.kind === 'chapter'),
          drafts: storyItems.filter((i) => i.kind === 'draft'),
        };
      });

      res.json({ projects });
    }),
  );

  // GET /api/writing/stories/:storyId/items
  router.get(
    '/stories/:storyId/items',
    asyncHandler(async (req, res) => {
      const userId = req.user.id;
      const { storyId } = req.params;

      const { rows } = await pool.query(
        `SELECT id, story_id, title, content, word_count, kind, version, updated_at
         FROM chapters
         WHERE user_id = $1 AND story_id = $2
         ORDER BY updated_at ASC`,
        [userId, storyId],
      );

      res.json({
        chapters: rows.filter((r) => r.kind === 'chapter'),
        drafts: rows.filter((r) => r.kind === 'draft'),
      });
    }),
  );

  // POST /api/writing/stories/:storyId/items
  router.post(
    '/stories/:storyId/items',
    asyncHandler(async (req, res) => {
      const userId = req.user.id;
      const { storyId } = req.params;
      const { title, content = '', kind = 'chapter', status } = req.body;

      const resolvedKind =
        kind === 'draft' || status === 'DRAFT' ? 'draft' : 'chapter';
      const cleanTitle = String(title || 'Sem Título').trim() || 'Sem Título';
      const cleanContent = String(content);
      const words = countWords(cleanContent);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const { rows } = await client.query(
          `INSERT INTO chapters (story_id, user_id, title, content, word_count, kind, version)
           VALUES ($1, $2, $3, $4, $5, $6, 1)
           RETURNING id, story_id, title, content, word_count, kind, version, updated_at`,
          [storyId, userId, cleanTitle, cleanContent, words, resolvedKind],
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
            req.sessionId,
          ],
        );

        await client.query('UPDATE stories SET updated_at = NOW() WHERE id = $1', [
          storyId,
        ]);
        await client.query('COMMIT');
        res.status(201).json(created);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  // PUT /api/writing/stories/:storyId/items/:itemId
  router.put(
    '/stories/:storyId/items/:itemId',
    asyncHandler(async (req, res) => {
      const userId = req.user.id;
      const { storyId, itemId } = req.params;
      const {
        title,
        content = '',
        kind = 'chapter',
        status,
        expectedVersion,
        forceOverwrite = false,
      } = req.body;

      const resolvedKind =
        kind === 'draft' || status === 'DRAFT' ? 'draft' : 'chapter';

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const { rows } = await client.query(
          `SELECT id, story_id, title, content, word_count, kind, version, updated_at
           FROM chapters
           WHERE id = $1 AND story_id = $2 AND user_id = $3
           FOR UPDATE`,
          [itemId, storyId, userId],
        );

        if (!rows.length) {
          throw new AppError(
            'Capítulo ou rascunho não encontrado.',
            404,
            'ITEM_NOT_FOUND',
          );
        }

        const current = rows[0];
        if (
          !forceOverwrite &&
          typeof expectedVersion === 'number' &&
          expectedVersion !== current.version
        ) {
          await client.query('ROLLBACK');
          throw new AppError(
            'Conflito de versão: este texto foi alterado em outra sessão.',
            409,
            'VERSION_CONFLICT',
            { serverItem: current },
          );
        }

        const nextVersion = current.version + 1;
        const cleanTitle = String(title || 'Sem Título').trim() || 'Sem Título';
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
            req.sessionId,
          ],
        );

        await client.query('UPDATE stories SET updated_at = NOW() WHERE id = $1', [
          storyId,
        ]);
        await client.query('COMMIT');
        res.json(updated);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  // GET /api/writing/workspace
  router.get(
    '/workspace',
    asyncHandler(async (req, res) => {
      const userId = req.user.id;
      const storyId = req.query.storyId ? String(req.query.storyId) : null;

      if (!storyId) {
        return res.json(null);
      }

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
        [userId, storyId],
      );

      res.json(rows[0] || null);
    }),
  );

  // PUT /api/writing/workspace
  router.put(
    '/workspace',
    asyncHandler(async (req, res) => {
      const userId = req.user.id;
      const {
        projectId,
        storyId,
        chapterId = null,
        kind = 'chapter',
        type,
        title = 'Novo Capítulo',
        content = '',
        expectedVersion,
        forceOverwrite = false,
      } = req.body;

      const resolvedStoryId = projectId || storyId || null;
      const resolvedKind =
        kind === 'draft' || type === 'draft' ? 'draft' : 'chapter';

      if (!content && !chapterId) {
        if (resolvedStoryId) {
          await pool.query(
            'DELETE FROM writing_space_state WHERE user_id = $1 AND story_id = $2',
            [userId, resolvedStoryId],
          );
        }
        return res.json({ cleared: true });
      }

      if (!resolvedStoryId) {
        throw new AppError(
          'projectId/storyId é obrigatório para persistir o espaço de escrita.',
          400,
          'VALIDATION_ERROR',
        );
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

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
          [userId, resolvedStoryId],
        );

        const current = existing[0];
        if (
          current &&
          !forceOverwrite &&
          req.sessionId &&
          current.sessionId &&
          current.sessionId !== req.sessionId &&
          typeof expectedVersion === 'number' &&
          expectedVersion !== current.version
        ) {
          await client.query('ROLLBACK');
          throw new AppError(
            'Conflito entre sessões no espaço de escrita.',
            409,
            'SESSION_CONFLICT',
            { serverState: current },
          );
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
            userId,
            resolvedStoryId,
            chapterId,
            resolvedKind,
            title,
            content,
            req.sessionId,
            nextVersion,
          ],
        );

        await client.query('COMMIT');
        res.json(saved[0]);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  return router;
}