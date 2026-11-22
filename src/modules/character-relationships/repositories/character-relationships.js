const relationshipColumns = `
  cr.id, cr.story_id AS "storyId",
  cr.source_character_id AS "sourceCharacterId",
  cr.target_character_id AS "targetCharacterId",
  cr.relationship_type AS "type",
  cr.description, cr.level,
  cr.created_at AS "createdAt", cr.updated_at AS "updatedAt"
`;

export function createCharacterRelationshipRepository(db) {
  return {
    async storyExists(storyId, profileId) {
      const { rows } = await db.query(
        `SELECT 1 FROM stories WHERE id = $1 AND profile_id = $2`,
        [storyId, profileId],
      );
      return rows.length > 0;
    },

    async charactersBelongToStory(storyId, sourceId, targetId) {
      const { rows } = await db.query(
        `
          SELECT
            EXISTS(SELECT 1 FROM characters WHERE id = $2 AND story_id = $1) AS "hasSource",
            EXISTS(SELECT 1 FROM characters WHERE id = $3 AND story_id = $1) AS "hasTarget"
        `,
        [storyId, sourceId, targetId],
      );
      return rows[0];
    },

    async list(storyId, profileId) {
      const { rows } = await db.query(
        `
          SELECT ${relationshipColumns}
          FROM stories s
          LEFT JOIN character_relationships cr ON cr.story_id = s.id
          WHERE s.id = $1 AND s.profile_id = $2
          ORDER BY cr.created_at, cr.id
        `,
        [storyId, profileId],
      );

      if (rows.length === 0) return null;
      return rows[0].id === null ? [] : rows;
    },

    async create(
      storyId,
      profileId,
      { sourceCharacterId, targetCharacterId, type, description, level },
    ) {
      const { rows } = await db.query(
        `
          INSERT INTO character_relationships AS cr
            (story_id, source_character_id, target_character_id, relationship_type, description, level)
          SELECT s.id, $3, $4, $5, $6, $7
          FROM stories s
          WHERE s.id = $1 AND s.profile_id = $2
          RETURNING ${relationshipColumns}
        `,
        [
          storyId,
          profileId,
          sourceCharacterId,
          targetCharacterId,
          type,
          description ?? null,
          level ?? null,
        ],
      );

      return rows[0];
    },

    async update(
      storyId,
      profileId,
      relationshipId,
      { sourceCharacterId, targetCharacterId, type, description, level },
    ) {
      const { rows } = await db.query(
        `
          UPDATE character_relationships AS cr
          SET source_character_id = $4,
              target_character_id = $5,
              relationship_type = $6,
              description = $7,
              level = $8,
              updated_at = now()
          FROM stories s
          WHERE cr.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND cr.id = $3
          RETURNING ${relationshipColumns}
        `,
        [
          storyId,
          profileId,
          relationshipId,
          sourceCharacterId,
          targetCharacterId,
          type,
          description ?? null,
          level ?? null,
        ],
      );

      return rows[0];
    },

    async remove(storyId, profileId, relationshipId) {
      const result = await db.query(
        `
          DELETE FROM character_relationships AS cr
          USING stories s
          WHERE cr.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND cr.id = $3
          RETURNING cr.id
        `,
        [storyId, profileId, relationshipId],
      );

      return result.rowCount > 0;
    },
  };
}
