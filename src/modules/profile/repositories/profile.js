export async function readProfile(db, ownerId) {
  const { rows } = await db.query(
    `SELECT p.id, p.username, p.display_name AS "displayName", p.bio,
       p.avatar_image AS "avatarImage", u.email, w.content AS document
     FROM profiles AS p JOIN users AS u ON u.id = p.id
     LEFT JOIN workspace_sections AS w ON w.id = u.id::text || ':profile'
     WHERE p.id = $1`,
    [ownerId],
  );
  if (!rows[0]) return undefined;
  const { document, ...profile } = rows[0];
  const saved = document ? JSON.parse(document) : {};
  return {
    ...profile,
    penName: saved.penName ?? profile.displayName,
    quote: saved.quote ?? "",
    websiteUrl: saved.websiteUrl ?? "",
    favoriteGenres: saved.favoriteGenres ?? [],
  };
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
