const columns = `
  c.id, c.story_id AS "storyId", c.race_id AS "raceId", c.name,
  c.description, c.appearance, c.behavior, c.habitat,
  c.creature_image AS "creatureImage", c.created_at AS "createdAt",
  c.updated_at AS "updatedAt"
`;

export function createCreatureRepository(db) {
  return {
    async list(storyId, profileId) {
      const { rows } = await db.query(
        `SELECT ${columns}
         FROM stories AS s
         LEFT JOIN creatures AS c ON c.story_id = s.id
         WHERE s.id = $1 AND s.profile_id = $2
         ORDER BY c.created_at, c.id`,
        [storyId, profileId],
      );
      if (rows.length === 0) return null;
      return rows[0].id === null ? [] : rows;
    },

    async find(storyId, profileId, creatureId) {
      const { rows } = await db.query(
        `SELECT ${columns}
         FROM creatures AS c
         JOIN stories AS s ON s.id = c.story_id
         WHERE s.id = $1 AND s.profile_id = $2 AND c.id = $3`,
        [storyId, profileId, creatureId],
      );
      return rows[0];
    },

    async create(storyId, profileId, creature) {
      const { rows } = await db.query(
        `INSERT INTO creatures AS c
           (story_id, name, description, appearance, behavior, habitat, creature_image, race_id)
         SELECT s.id, $3, $4, $5, $6, $7, $8, $9
         FROM stories AS s
         WHERE s.id = $1 AND s.profile_id = $2
         RETURNING ${columns}`,
        [storyId, profileId, ...creatureValues(creature)],
      );
      return rows[0];
    },

    async update(storyId, profileId, creatureId, creature) {
      const { rows } = await db.query(
        `UPDATE creatures AS c
         SET name = $4, description = $5, appearance = $6, behavior = $7,
             habitat = $8, creature_image = $9,
             race_id = CASE WHEN $11::boolean THEN $10::uuid ELSE c.race_id END,
             updated_at = now()
         FROM stories AS s
         WHERE c.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND c.id = $3
         RETURNING ${columns}`,
        [
          storyId,
          profileId,
          creatureId,
          ...creatureValues(creature),
          creature.raceId !== undefined,
        ],
      );
      return rows[0];
    },

    async remove(storyId, profileId, creatureId) {
      const { rows } = await db.query(
        `DELETE FROM creatures AS c
         USING stories AS s
         WHERE c.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND c.id = $3
         RETURNING c.id`,
        [storyId, profileId, creatureId],
      );
      return rows.length > 0;
    },
  };
}

function creatureValues(creature) {
  return [
    creature.name,
    creature.description ?? null,
    creature.appearance ?? null,
    creature.behavior ?? null,
    creature.habitat ?? null,
    creature.creatureImage ?? null,
    creature.raceId ?? null,
  ];
}
