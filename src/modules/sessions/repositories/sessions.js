export function createSessionRepository(db) {
  return {
    async create({ userId, tokenHash, expiresAt, userAgent = null, ipAddress = null }) {
      const { rows } = await db.query(
        `
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, user_id AS "userId", expires_at AS "expiresAt", created_at AS "createdAt"
        `,
        [userId, tokenHash, expiresAt, userAgent, ipAddress],
      );
      return rows[0];
    },

    /**
     * Rotação atômica: remove o token atual em uma única operação DELETE ... RETURNING
     * e retorna os dados atualizados de usuário e perfil para emitir o novo par de tokens.
     */
    async consumeAndFetchPrincipal(tokenHash) {
      const { rows } = await db.query(
        `
        WITH deleted AS (
          DELETE FROM refresh_tokens
          WHERE token_hash = $1 AND expires_at > now()
          RETURNING user_id, expires_at
        )
        SELECT
          d.expires_at AS "originalExpiresAt",
          u.id AS "userId",
          u.email,
          u.role,
          u.is_active AS "isActive",
          u.email_verified_at AS "emailVerifiedAt",
          p.id AS "profileId",
          p.username,
          p.display_name AS "displayName"
        FROM deleted AS d
        JOIN users AS u ON u.id = d.user_id
        JOIN profiles AS p ON p.user_id = u.id
        `,
        [tokenHash],
      );
      return rows[0] ?? null;
    },

    async deleteByTokenHash(tokenHash) {
      const { rowCount } = await db.query(
        `DELETE FROM refresh_tokens WHERE token_hash = $1`,
        [tokenHash],
      );
      return rowCount > 0;
    },

    async deleteAllByUserId(userId) {
      const { rowCount } = await db.query(
        `DELETE FROM refresh_tokens WHERE user_id = $1`,
        [userId],
      );
      return rowCount;
    },

    async listActiveByUserId(userId) {
      const { rows } = await db.query(
        `
        SELECT
          id,
          user_agent AS "userAgent",
          ip_address AS "ipAddress",
          expires_at AS "expiresAt",
          created_at AS "createdAt"
        FROM refresh_tokens
        WHERE user_id = $1 AND expires_at > now()
        ORDER BY created_at DESC
        `,
        [userId],
      );
      return rows;
    },
  };
}