const worldRuleColumns = `
  w.id, w.story_id AS "storyId",
  w.title, w.category, w.description,
  w.created_at AS "createdAt", w.updated_at AS "updatedAt"
`;

function worldRuleValues({ title, category, description }) {
  return [title, category ?? "Geral", description ?? ""];
}

export function createWorldRuleRepository(db) {
  return {
    async list(storyId, profileId) {
      const { rows } = await db.query(
        `
          SELECT ${worldRuleColumns}
          FROM stories s
          LEFT JOIN world_rules w ON w.story_id = s.id
          WHERE s.id = $1 AND s.profile_id = $2
          ORDER BY w.created_at, w.id
        `,
        [storyId, profileId],
      );

      if (rows.length === 0) return null;
      return rows[0].id === null ? [] : rows;
    },

    async find(storyId, profileId, ruleId) {
      const { rows } = await db.query(
        `
          SELECT ${worldRuleColumns}
          FROM world_rules w
          JOIN stories s ON s.id = w.story_id
          WHERE s.id = $1 AND s.profile_id = $2 AND w.id = $3
        `,
        [storyId, profileId, ruleId],
      );

      return rows[0];
    },

    async create(storyId, profileId, rule) {
      const { rows } = await db.query(
        `
          INSERT INTO world_rules AS w
            (story_id, title, category, description)
          SELECT s.id, $3, $4, $5
          FROM stories s
          WHERE s.id = $1 AND s.profile_id = $2
          RETURNING ${worldRuleColumns}
        `,
        [storyId, profileId, ...worldRuleValues(rule)],
      );

      return rows[0];
    },

    async update(storyId, profileId, ruleId, rule) {
      const { rows } = await db.query(
        `
          UPDATE world_rules AS w
          SET title = $4, category = $5, description = $6, updated_at = now()
          FROM stories s
          WHERE w.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND w.id = $3
          RETURNING ${worldRuleColumns}
        `,
        [storyId, profileId, ruleId, ...worldRuleValues(rule)],
      );

      return rows[0];
    },

    async remove(storyId, profileId, ruleId) {
      const result = await db.query(
        `
          DELETE FROM world_rules AS w
          USING stories s
          WHERE w.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND w.id = $3
          RETURNING w.id
        `,
        [storyId, profileId, ruleId],
      );

      return result.rowCount > 0;
    },
  };
}
