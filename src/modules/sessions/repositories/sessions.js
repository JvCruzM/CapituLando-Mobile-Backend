export function createSessionRepository(db) {
  return {
    async create(user, tokenHash, days, metadata) {
      const {
        rows: [session],
      } = await db.query(
        `INSERT INTO refresh_sessions (user_id, token_version, expires_at, user_agent, ip_address)
         VALUES ($1, $2, now() + $3::int * interval '1 day', $4, $5) RETURNING *`,
        [
          user.id,
          user.token_version,
          days,
          metadata.userAgent ?? null,
          metadata.ipAddress ?? null,
        ],
      );
      await this.addToken(session, tokenHash);
      return session;
    },
    async addToken(session, tokenHash) {
      const {
        rows: [token],
      } = await db.query(
        "INSERT INTO refresh_tokens (session_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id",
        [session.id, tokenHash, session.expires_at],
      );
      return token;
    },
    async locate(tokenHash) {
      const { rows } = await db.query(
        `SELECT s.user_id, s.id FROM refresh_tokens AS t
         JOIN refresh_sessions AS s ON s.id = t.session_id WHERE t.token_hash = $1`,
        [tokenHash],
      );
      return rows[0];
    },
    async lockSession(id) {
      const { rows } = await db.query(
        "SELECT *, expires_at > now() AS unexpired FROM refresh_sessions WHERE id = $1 FOR UPDATE",
        [id],
      );
      return rows[0];
    },
    async lockToken(tokenHash) {
      const { rows } = await db.query(
        "SELECT *, expires_at > now() AS unexpired FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE",
        [tokenHash],
      );
      return rows[0];
    },
    async consume(tokenId, nextId) {
      await db.query(
        "UPDATE refresh_tokens SET consumed_at = now(), replaced_by_id = $2 WHERE id = $1",
        [tokenId, nextId],
      );
    },
    async revokeSession(id) {
      await db.query(
        "UPDATE refresh_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1",
        [id],
      );
    },
    async revokeUser(userId) {
      await db.query(
        "UPDATE refresh_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1",
        [userId],
      );
    },
    async list(userId) {
      const { rows } = await db.query(
        `SELECT id, user_agent AS "userAgent", ip_address AS "ipAddress",
           created_at AS "createdAt", expires_at AS "expiresAt"
         FROM refresh_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
         AND token_version = (SELECT token_version FROM users WHERE id = $1)
         ORDER BY created_at DESC`,
        [userId],
      );
      return rows;
    },
  };
}
