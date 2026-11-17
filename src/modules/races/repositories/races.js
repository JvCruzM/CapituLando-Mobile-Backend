const raceColumns = `
  r.id, r.story_id AS "storyId", r.name, r.description, r.appearance,
  r.culture, r.habitat, r.race_image AS "raceImage",
  r.created_at AS "createdAt", r.updated_at AS "updatedAt"
`;

export function createRaceRepository(db) {
  return {
    async list(storyId, profileId) {
      const { rows } = await db.query(
        `
        SELECT ${raceColumns}
        FROM stories AS s
        LEFT JOIN races AS r ON r.story_id = s.id
        WHERE s.id = $1 AND s.profile_id = $2
        ORDER BY r.created_at, r.id
      `,
        [storyId, profileId],
      );

      if (rows.length === 0) return null;
      return rows[0].id === null ? [] : rows;
    },

    async find(storyId, profileId, raceId) {
      const { rows } = await db.query(
        `
        SELECT ${raceColumns}
        FROM races AS r
        JOIN stories AS s ON s.id = r.story_id
        WHERE s.id = $1 AND s.profile_id = $2 AND r.id = $3
      `,
        [storyId, profileId, raceId],
      );
      return rows[0];
    },

    async create(storyId, profileId, race) {
      const { rows } = await db.query(
        `
        INSERT INTO races AS r
          (story_id, name, description, appearance, culture, habitat, race_image)
        SELECT s.id, $3, $4, $5, $6, $7, $8
        FROM stories AS s
        WHERE s.id = $1 AND s.profile_id = $2
        RETURNING ${raceColumns}
      `,
        [storyId, profileId, ...raceValues(race)],
      );
      return rows[0];
    },

    async update(storyId, profileId, raceId, race) {
      const { rows } = await db.query(
        `
        UPDATE races AS r
        SET name = $4, description = $5, appearance = $6, culture = $7,
            habitat = $8, race_image = $9, updated_at = now()
        FROM stories AS s
        WHERE r.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND r.id = $3
        RETURNING ${raceColumns}
      `,
        [storyId, profileId, raceId, ...raceValues(race)],
      );
      return rows[0];
    },

    async remove(storyId, profileId, raceId) {
      const result = await db.query(
        `
        DELETE FROM races AS r
        USING stories AS s
        WHERE r.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND r.id = $3
        RETURNING r.id
      `,
        [storyId, profileId, raceId],
      );
      return result.rows.length > 0;
    },
  };
}

function raceValues({
  name,
  description,
  appearance,
  culture,
  habitat,
  raceImage,
}) {
  return [
    name,
    description ?? null,
    appearance ?? null,
    culture ?? null,
    habitat ?? null,
    raceImage ?? null,
  ];
}
