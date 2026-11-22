const linkColumns = `
  co.id, co.story_id AS "storyId",
  co.character_id AS "characterId",
  co.organization_id AS "organizationId",
  co.role, co.joined_at AS "joinedAt", co.is_active AS "isActive",
  co.created_at AS "createdAt", co.updated_at AS "updatedAt"
`;

export function createCharacterOrganizationRepository(db) {
  return {
    async storyExists(storyId, profileId) {
      const { rows } = await db.query(
        `SELECT 1 FROM stories WHERE id = $1 AND profile_id = $2`,
        [storyId, profileId],
      );
      return rows.length > 0;
    },

    async characterAndOrganizationBelongToStory(storyId, characterId, organizationId) {
      const { rows } = await db.query(
        `
          SELECT
            EXISTS(SELECT 1 FROM characters WHERE id = $2 AND story_id = $1) AS "hasCharacter",
            EXISTS(SELECT 1 FROM organizations WHERE id = $3 AND story_id = $1) AS "hasOrganization"
        `,
        [storyId, characterId, organizationId],
      );
      return rows[0];
    },

    async list(storyId, profileId, characterId = null) {
      const params = [storyId, profileId];
      let filter = "";
      if (characterId) {
        params.push(characterId);
        filter = ` AND co.character_id = $3`;
      }

      const { rows } = await db.query(
        `
          SELECT ${linkColumns}
          FROM stories s
          LEFT JOIN character_organizations co ON co.story_id = s.id${filter}
          WHERE s.id = $1 AND s.profile_id = $2
          ORDER BY co.created_at, co.id
        `,
        params,
      );

      if (rows.length === 0) return null;
      return rows[0].id === null ? [] : rows;
    },

    async create(storyId, profileId, { characterId, organizationId, role, joinedAt, isActive }) {
      const { rows } = await db.query(
        `
          INSERT INTO character_organizations AS co
            (story_id, character_id, organization_id, role, joined_at, is_active)
          SELECT s.id, $3, $4, $5, $6, $7
          FROM stories s
          WHERE s.id = $1 AND s.profile_id = $2
          RETURNING ${linkColumns}
        `,
        [storyId, profileId, characterId, organizationId, role ?? null, joinedAt ?? null, isActive ?? true],
      );

      return rows[0];
    },

    async update(storyId, profileId, linkId, { role, joinedAt, isActive }) {
      const { rows } = await db.query(
        `
          UPDATE character_organizations AS co
          SET role = $4, joined_at = $5, is_active = $6, updated_at = now()
          FROM stories s
          WHERE co.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND co.id = $3
          RETURNING ${linkColumns}
        `,
        [storyId, profileId, linkId, role ?? null, joinedAt ?? null, isActive ?? true],
      );

      return rows[0];
    },

    async remove(storyId, profileId, linkId) {
      const result = await db.query(
        `
          DELETE FROM character_organizations AS co
          USING stories s
          WHERE co.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND co.id = $3
          RETURNING co.id
        `,
        [storyId, profileId, linkId],
      );

      return result.rowCount > 0;
    },
  };
}
