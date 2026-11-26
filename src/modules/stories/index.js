import { Router } from "express";
import { z } from "zod";
import { transaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  createJsonBodyParser,
  requireValidPrincipal,
  validateUuidParam,
} from "../../shared/middlewares/security.js";

const schema = z.object({
  title: z.string().trim().min(1).max(150),
  genre: z.string().max(100).nullish(),
  description: z.string().max(100000).nullish(),
  synopsis: z.string().max(100000).nullish(),
  coverImage: z.string().max(2000000).nullish(),
  status: z.enum(["DRAFT", "IN_PROGRESS", "COMPLETED"]).default("DRAFT"),
});
const columns = `s.id,s.title,s.genre,s.description,s.synopsis,s.status,s.cover_image AS "coverImage",CASE WHEN s.status = 'COMPLETED' THEN 100 ELSE (SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE c.status = 'PUBLISHED') / NULLIF(COUNT(*), 0)), 0)::int FROM chapters c WHERE c.story_id = s.id) END AS "progressPercentage",s.updated_at AS "updatedAt"`;
export function createStoryRouter(authenticate) {
  const router = Router();
  router.use(
    authenticate,
    requireValidPrincipal,
    ...createJsonBodyParser("3mb"),
  );
  router.param(
    "storyId",
    validateUuidParam("storyId", "INVALID_STORY_ID", "História inválida."),
  );
  router.get("/", async (req, res) => {
    const { rows } = await req.app.locals.db.query(
      `SELECT ${columns},(SELECT count(*)::int FROM chapters c WHERE c.story_id=s.id) AS "chapterCount",(SELECT COALESCE(sum(word_count),0)::int FROM chapters c WHERE c.story_id=s.id) AS "wordCount" FROM stories s WHERE profile_id=$1 ORDER BY s.updated_at DESC,s.id`,
      [res.locals.principal.id],
    );
    res.json(rows);
  });
  const save = (update) => async (req, res) => {
    const result = schema.safeParse(req.body);
    if (!result.success)
      throw new AppError(400, "INVALID_STORY", "Confira os dados da história.");
    const d = result.data,
      owner = res.locals.principal.id;
    const story = await transaction(req.app.locals.db, async (db) => {
      await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [owner]);
      const { rows } = update
        ? await db.query(
            `UPDATE stories AS s SET title=$1,genre=$2,description=$3,synopsis=$4,cover_image=$5,status=$6,updated_at=now() WHERE id=$7 AND profile_id=$8 RETURNING ${columns}`,
            [
              d.title,
              d.genre ?? null,
              d.description ?? null,
              d.synopsis ?? null,
              d.coverImage ?? null,
              d.status,
              req.params.storyId,
              owner,
            ],
          )
        : await db.query(
            `INSERT INTO stories AS s(profile_id,title,genre,description,synopsis,cover_image,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${columns}`,
            [
              owner,
              d.title,
              d.genre ?? null,
              d.description ?? null,
              d.synopsis ?? null,
              d.coverImage ?? null,
              d.status,
            ],
          );
      if (!rows.length)
        throw new AppError(404, "STORY_NOT_FOUND", "História não encontrada.");
      return rows[0];
    });
    res.status(update ? 200 : 201).json(story);
  };
  router.post("/", save(false));
  router.put("/:storyId", save(true));
  router.delete("/:storyId", async (req, res) => {
    await transaction(req.app.locals.db, async (db) => {
      const owner = res.locals.principal.id;
      await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [owner]);
      const { rowCount } = await db.query(
        "DELETE FROM stories WHERE id=$1 AND profile_id=$2",
        [req.params.storyId, owner],
      );
      if (!rowCount)
        throw new AppError(404, "STORY_NOT_FOUND", "História não encontrada.");
      const { rows } = await db.query(
        "SELECT id,content FROM workspace_sections WHERE id=ANY($1::varchar[])",
        [
          ["goals", "ideas", "concepts", "events", "writing"].map(
            (section) => `${owner}:${section}`,
          ),
        ],
      );
      for (const row of rows) {
        const value = JSON.parse(row.content);
        const cleaned = Array.isArray(value)
          ? value.filter((x) => x.projectId !== req.params.storyId)
          : value.projectId === req.params.storyId
            ? {}
            : value;
        if (JSON.stringify(cleaned) !== row.content)
          await db.query(
            "UPDATE workspace_sections SET content=$1,revision=revision+1 WHERE id=$2",
            [JSON.stringify(cleaned), row.id],
          );
      }
    });
    res.status(204).end();
  });
  return router;
}
