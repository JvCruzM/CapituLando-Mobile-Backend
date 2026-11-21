export async function findUser(db, column, value, lock = false) {
  const field = column === "email" ? "lower(u.email)" : "u.id";
  const { rows } = await db.query(
    `SELECT u.*, p.username, p.display_name, p.bio, p.avatar_image
     FROM users AS u JOIN profiles AS p ON p.id = u.id
     WHERE ${field} = $1 ${lock ? "FOR UPDATE OF u" : ""}`,
    [value],
  );
  return rows[0];
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.email_verified,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
  };
}
