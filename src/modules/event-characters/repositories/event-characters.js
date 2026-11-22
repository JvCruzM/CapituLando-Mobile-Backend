const participantColumns = `
  ec.id, ec.story_id AS "storyId",
  ec.event_id AS "eventId",
  ec.character_id AS "characterId",
  ec.created_at AS "createdAt"
`;

export function createEventCharacterRepository(db) {
  return {
    async storyExists(storyId, profileId) {
      const { rows } = await db.query(
        `SELECT 1 FROM stories WHERE id = $1 AND profile_id = $2`,
        [storyId, profileId],
      );
      return rows.length > 0;
    },

    async eventAndCharacterBelongToStory(storyId, eventId, characterId) {
      const { rows } = await db.query(
        `
          SELECT
            EXISTS(SELECT 1 FROM events WHERE id = $2 AND story_id = $1) AS "hasEvent",
            EXISTS(SELECT 1 FROM characters WHERE id = $3 AND story_id = $1) AS "hasCharacter"
        `,
        [storyId, eventId, characterId],
      );
      return rows[0];
    },

    async list(storyId, profileId, eventId = null) {
      const params = [storyId, profileId];
      let filter = "";
      if (eventId) {
        params.push(eventId);
        filter = ` AND ec.event_id = $3`;
      }

      const { rows } = await db.query(
        `
          SELECT ${participantColumns}
          FROM stories s
          LEFT JOIN event_characters ec ON ec.story_id = s.id${filter}
          WHERE s.id = $1 AND s.profile_id = $2
          ORDER BY ec.created_at, ec.id
        `,
        params,
      );

      if (rows.length === 0) return null;
      return rows[0].id === null ? [] : rows;
    },

    async create(storyId, profileId, { eventId, characterId }) {
      const { rows } = await db.query(
        `
          INSERT INTO event_characters AS ec
            (story_id, event_id, character_id)
          SELECT s.id, $3, $4
          FROM stories s
          WHERE s.id = $1 AND s.profile_id = $2
          RETURNING ${participantColumns}
        `,
        [storyId, profileId, eventId, characterId],
      );

      return rows[0];
    },

    async remove(storyId, profileId, linkId) {
      const result = await db.query(
        `
          DELETE FROM event_characters AS ec
          USING stories s
          WHERE ec.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND ec.id = $3
          RETURNING ec.id
        `,
        [storyId, profileId, linkId],
      );

      return result.rowCount > 0;
    },
  };
}
