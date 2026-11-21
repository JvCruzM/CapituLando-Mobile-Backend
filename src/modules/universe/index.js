import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { transaction } from "../../database/transaction.js";

const tables = [
  "races",
  "creatures",
  "items",
  "locations",
  "organizations",
  "world_rules",
  "characters",
  "events",
  "event_characters",
  "character_organizations",
];

export function createUniverseRouter(authenticate) {
  const router = Router();
  router.use(authenticate);
  router.get("/stories", async (req, res) => {
    const { rows } = await req.app.locals.db.query(
      "SELECT id, title FROM stories WHERE profile_id = $1 ORDER BY title, id",
      [res.locals.principal.id],
    );
    res.json(rows);
  });
  router.get("/stories/:storyId", async (req, res) => {
    if (!z.guid().safeParse(req.params.storyId).success)
      throw new AppError(
        400,
        "INVALID_STORY_ID",
        "Identificador da história inválido.",
      );
    const snapshot = await transaction(req.app.locals.db, async (client) => {
      await client.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      const { rows } = await client.query(
        "SELECT id, title FROM stories WHERE id = $1 AND profile_id = $2",
        [req.params.storyId, res.locals.principal.id],
      );
      if (!rows.length)
        throw new AppError(404, "STORY_NOT_FOUND", "História não encontrada.");
      const result = { story: rows[0] };
      for (const table of tables) {
        const records = await client.query(
          `SELECT to_jsonb(entry) AS record FROM ${table} AS entry WHERE story_id = $1 ORDER BY id`,
          [req.params.storyId],
        );
        result[table] = records.rows.map(({ record }) => record);
      }
      const sections = await client.query(
        "SELECT id, content FROM workspace_sections WHERE id = ANY($1::varchar[])",
        [
          [
            `${res.locals.principal.id}:concepts`,
            `${res.locals.principal.id}:events`,
          ],
        ],
      );
      result.concepts = [];
      result.chronology = [];
      for (const section of sections.rows) {
        const value = JSON.parse(section.content);
        const key = section.id.endsWith(":concepts")
          ? "concepts"
          : "chronology";
        result[key] = Array.isArray(value)
          ? value.filter((record) => record.projectId === req.params.storyId)
          : [];
      }
      return result;
    });
    res.json(snapshot);
  });
  return router;
}
