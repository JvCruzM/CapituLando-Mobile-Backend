export async function readProfile(db, ownerId) {
  const { rows } = await db.query(
    `SELECT p.id, p.username, p.display_name AS "displayName", p.bio,
       p.avatar_image AS "avatarImage", u.email
     FROM profiles AS p JOIN users AS u ON u.id = p.id WHERE p.id = $1`,
    [ownerId],
  );
  return rows[0];
}

export async function readSettings(db, ownerId) {
  const { rows } = await db.query(
    "SELECT revision, content FROM workspace_sections WHERE id = $1",
    [ownerId + ":settings"],
  );
  return rows.length
    ? { revision: Number(rows[0].revision), value: JSON.parse(rows[0].content) }
    : { revision: 0, value: {} };
}
