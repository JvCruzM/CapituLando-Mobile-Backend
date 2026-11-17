import { workspaceSections } from "../schemas/restore-workspace.js";
import { BackupError } from "../schemas/backup-error.js";

export async function lockBackupOwner(client, ownerId) {
  const { rows } = await client.query(
    `SELECT u.email FROM users AS u JOIN profiles AS p ON p.id = u.id
     WHERE u.id = $1 FOR UPDATE OF u`,
    [ownerId],
  );
  if (!rows.length)
    throw new BackupError(404, "PROFILE_NOT_FOUND", "Perfil não encontrado.");
  return rows[0];
}

export async function clearOwnedRecords(client, ownerId) {
  await client.query(
    "SELECT id FROM stories WHERE profile_id = $1 ORDER BY id FOR UPDATE",
    [ownerId],
  );
  const {
    rows: [conflict],
  } = await client.query(
    `SELECT
       EXISTS (SELECT 1 FROM goals AS g JOIN stories AS s ON s.id = g.story_id
               WHERE s.profile_id = $1 AND g.profile_id <> $1)
       OR EXISTS (SELECT 1 FROM ideas AS i JOIN stories AS s ON s.id = i.story_id
                  WHERE s.profile_id = $1 AND i.profile_id <> $1) AS linked`,
    [ownerId],
  );
  if (conflict.linked) {
    throw new BackupError(
      409,
      "BACKUP_CROSS_ACCOUNT_LINK",
      "Há vínculos de outra conta nos dados atuais.",
    );
  }

  await client.query("DELETE FROM goals WHERE profile_id = $1", [ownerId]);
  await client.query("DELETE FROM ideas WHERE profile_id = $1", [ownerId]);
  await client.query("DELETE FROM stories WHERE profile_id = $1", [ownerId]);
}

export async function replaceRecords(client, ownerId, groups) {
  await clearOwnedRecords(client, ownerId);
  for (const { table, rows } of groups) {
    if (!rows.length) continue;
    const columns = Object.keys(rows[0]).join(", ");
    await client.query(
      `INSERT INTO ${table} (${columns})
       SELECT ${columns} FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)`,
      [JSON.stringify(rows)],
    );
  }
}

export async function clearWorkspaceSections(
  client,
  ownerId,
  sections = workspaceSections,
) {
  if (sections.length === 0) return;
  const ids = sections.map((section) => `${ownerId}:${section}`);
  await client.query(
    "DELETE FROM workspace_sections WHERE id = ANY($1::varchar[])",
    [ids],
  );
}

export async function replaceWorkspace(client, ownerId, workspace, email) {
  const profile = workspace.profile;
  if (profile && Object.hasOwn(profile, "email")) profile.email = email;

  const omittedSections = workspaceSections.filter(
    (section) => !Object.hasOwn(workspace, section),
  );
  await clearWorkspaceSections(client, ownerId, omittedSections);

  for (const [section, value] of Object.entries(workspace)) {
    await client.query(
      `INSERT INTO workspace_sections (id, content, revision) VALUES ($1, $2, 1)
       ON CONFLICT (id) DO UPDATE
       SET content = EXCLUDED.content, revision = workspace_sections.revision + 1`,
      [`${ownerId}:${section}`, JSON.stringify(value)],
    );
  }

  if (profile?.name != null) {
    await client.query(
      `UPDATE profiles
       SET display_name = $2,
           bio = COALESCE($3, bio), avatar_image = COALESCE($4, avatar_image), updated_at = now()
       WHERE id = $1`,
      [
        ownerId,
        profile.name.trim(),
        Object.hasOwn(profile, "bio") ? (profile.bio ?? "") : null,
        Object.hasOwn(profile, "avatarUrl") ? (profile.avatarUrl ?? "") : null,
      ],
    );
  }
}
