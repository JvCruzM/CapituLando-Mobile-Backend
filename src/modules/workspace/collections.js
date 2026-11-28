import { AppError } from "../../shared/errors/index.js";

export const isCollection = (section) =>
  section === "ideas" || section === "goals";

export async function readCollection(db, owner, section) {
  if (!isCollection(section)) throw new Error("Coleção inválida.");
  const { rows: revisions } = await db.query(
    "SELECT revision FROM collection_revisions WHERE id=$1",
    [`${owner}:${section}`],
  );
  const { rows } = await db.query(
    `SELECT client_id,story_id,created_at,${
      section === "ideas"
        ? "content,category"
        : "title,unit,current_value,target_value,completed"
    }
     FROM ${section} WHERE profile_id=$1 ORDER BY sort_order,created_at,id`,
    [owner],
  );
  return {
    revision: Number(revisions[0]?.revision ?? 0),
    value: rows.map((row) => ({
      id: row.client_id,
      ...(row.story_id ? { projectId: row.story_id } : {}),
      ...(section === "ideas"
        ? {
            content: row.content,
            ...(row.category != null ? { category: row.category } : {}),
            createdAt: row.created_at.toISOString(),
          }
        : {
            title: row.title,
            unit: row.unit,
            current: row.current_value,
            target: row.target_value,
            completed: row.completed ?? row.current_value >= row.target_value,
          }),
    })),
  };
}

export async function writeCollection(db, owner, section, input) {
  if (!isCollection(section)) throw new Error("Coleção inválida.");
  await db.query(
    `INSERT INTO collection_revisions(id,profile_id,section,revision)
     VALUES($1,$2,$3,0) ON CONFLICT(id) DO NOTHING`,
    [`${owner}:${section}`, owner, section],
  );
  await db.query(
    "SELECT revision FROM collection_revisions WHERE id=$1 FOR UPDATE",
    [`${owner}:${section}`],
  );
  const current = await readCollection(db, owner, section);
  if (current.revision !== input.revision)
    throw new AppError(
      409,
      "VERSION_CONFLICT",
      "Os dados mudaram em outra sessão. Atualize antes de salvar.",
    );
  await db.query("SELECT set_config('capitulando.collection_write','on',true)");
  await db.query(
    `DELETE FROM ${section} WHERE profile_id=$1 AND NOT(client_id=ANY($2::varchar[]))`,
    [owner, input.value.map((item) => item.id)],
  );
  for (const [position, item] of input.value.entries()) {
    if (section === "ideas") {
      const timestamp =
        item.createdAt && !Number.isNaN(Date.parse(item.createdAt))
          ? new Date(item.createdAt)
          : new Date();
      await db.query(
        `INSERT INTO ideas(profile_id,story_id,client_id,content,category,sort_order,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(profile_id,client_id) DO UPDATE SET
        story_id=EXCLUDED.story_id,content=EXCLUDED.content,category=EXCLUDED.category,
        sort_order=EXCLUDED.sort_order,updated_at=now()`,
        [
          owner,
          item.projectId ?? null,
          item.id,
          item.content,
          item.category ?? null,
          position,
          timestamp,
        ],
      );
    } else {
      await db.query(
        `INSERT INTO goals(profile_id,story_id,client_id,title,unit,current_value,target_value,completed,sort_order)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(profile_id,client_id) DO UPDATE SET
        story_id=EXCLUDED.story_id,title=EXCLUDED.title,unit=EXCLUDED.unit,current_value=EXCLUDED.current_value,
        target_value=EXCLUDED.target_value,completed=EXCLUDED.completed,sort_order=EXCLUDED.sort_order,updated_at=now()`,
        [
          owner,
          item.projectId ?? null,
          item.id,
          item.title,
          item.unit,
          item.current,
          item.target,
          item.completed ?? null,
          position,
        ],
      );
    }
  }
  await db.query(
    `INSERT INTO collection_revisions(id,profile_id,section,revision) VALUES($1,$2,$3,1)
    ON CONFLICT(id) DO UPDATE SET revision=collection_revisions.revision+1`,
    [`${owner}:${section}`, owner, section],
  );
  await db.query(
    "SELECT set_config('capitulando.collection_write','off',true)",
  );
  return readCollection(db, owner, section);
}
