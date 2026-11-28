import { Router } from "express";
import { z } from "zod";
import { transaction } from "../../database/transaction.js";
import { AppError } from "../../shared/errors/index.js";
import {
  createJsonBodyParser,
  requireValidPrincipal,
} from "../../shared/middlewares/security.js";
import { workspaceValueSchemas } from "../backups/schemas/restore-workspace.js";
import { existingWorkspaceRecords, loadOwnedStoryIds } from "./records.js";
import {
  isCollection,
  readCollection,
  writeCollection,
} from "./collections.js";

export function createWorkspaceRouter(authenticate) {
  const router = Router();
  router.use(
    authenticate,
    requireValidPrincipal,
    ...createJsonBodyParser("6mb"),
  );
  router.param("section", (req, res, next, section) => {
    if (!["goals", "ideas", "concepts", "events"].includes(section))
      return next(
        new AppError(404, "SECTION_NOT_FOUND", "Seção não encontrada."),
      );
    next();
  });
  router.get("/:section", async (req, res) => {
    if (isCollection(req.params.section)) {
      const document = await transaction(req.app.locals.db, async (db) => {
        await db.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
        );
        return readCollection(db, res.locals.principal.id, req.params.section);
      });
      return res.json(document);
    }
    const { rows } = await req.app.locals.db.query(
      "SELECT content,revision FROM workspace_sections WHERE id=$1",
      [`${res.locals.principal.id}:${req.params.section}`],
    );
    const storyIds = await loadOwnedStoryIds(
      req.app.locals.db,
      res.locals.principal.id,
    );
    res.json({
      revision: Number(rows[0]?.revision ?? 0),
      value: existingWorkspaceRecords(
        req.params.section,
        rows[0] ? JSON.parse(rows[0].content) : [],
        storyIds,
      ),
    });
  });
  router.put("/:section", async (req, res) => {
    const parsed = z
      .object({
        revision: z.number().int().nonnegative(),
        value: workspaceValueSchemas[req.params.section],
      })
      .safeParse(req.body);
    if (!parsed.success)
      throw new AppError(
        400,
        "INVALID_DOCUMENT",
        "Confira os dados do documento.",
      );
    const input = parsed.data;
    if (new Set(input.value.map((x) => x.id)).size !== input.value.length)
      throw new AppError(
        400,
        "INVALID_DOCUMENT",
        "Há identificadores repetidos.",
      );
    const result = await transaction(req.app.locals.db, async (db) => {
      const owner = res.locals.principal.id;
      await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [owner]);
      const projectIds = [
        ...new Set(input.value.map((x) => x.projectId).filter(Boolean)),
      ];
      if (projectIds.length) {
        const { rows } = await db.query(
          "SELECT id FROM stories WHERE profile_id=$1 AND id=ANY($2::uuid[])",
          [owner, projectIds],
        );
        if (rows.length !== projectIds.length)
          throw new AppError(
            400,
            "INVALID_STORY",
            "Selecione histórias da sua conta.",
          );
      }
      const key = `${owner}:${req.params.section}`;
      if (isCollection(req.params.section))
        return writeCollection(db, owner, req.params.section, input);
      const { rows } = await db.query(
        "SELECT revision FROM workspace_sections WHERE id=$1",
        [key],
      );
      if (Number(rows[0]?.revision ?? 0) !== input.revision)
        throw new AppError(
          409,
          "VERSION_CONFLICT",
          "Os dados mudaram em outra sessão. Atualize antes de salvar.",
        );
      const content = JSON.stringify(input.value);
      if (content.length > 5000000)
        throw new AppError(413, "PAYLOAD_TOO_LARGE", "Documento muito grande.");
      const { rows: saved } = await db.query(
        "INSERT INTO workspace_sections(id,content,revision) VALUES($1,$2,1) ON CONFLICT(id) DO UPDATE SET content=EXCLUDED.content,revision=workspace_sections.revision+1 RETURNING revision",
        [key, content],
      );
      return { revision: Number(saved[0].revision), value: input.value };
    });
    res.json(result);
  });
  return router;
}
