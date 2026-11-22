const locationColumns = `
  l.id, l.story_id AS "storyId", l.parent_location_id AS "parentLocationId",
  l.name, l.type, l.description, l.climate, l.region,
  l.location_image AS "locationImage",
  l.created_at AS "createdAt", l.updated_at AS "updatedAt"
`;

function locationValues({
  name,
  type,
  description,
  climate,
  region,
  locationImage,
  parentLocationId,
}) {
  return [
    name,
    type ?? null,
    description ?? null,
    climate ?? null,
    region ?? null,
    locationImage ?? null,
    parentLocationId ?? null,
  ];
}

export function createLocationRepository(db) {
  return {
    async storyExists(storyId, profileId) {
      const { rows } = await db.query(
        `SELECT 1 FROM stories WHERE id = $1 AND profile_id = $2`,
        [storyId, profileId],
      );
      return rows.length > 0;
    },

    async findParentInStory(storyId, parentLocationId) {
      const { rows } = await db.query(
        `SELECT id, parent_location_id AS "parentLocationId"
         FROM locations
         WHERE id = $1 AND story_id = $2`,
        [parentLocationId, storyId],
      );
      return rows[0] ?? null;
    },

    async list(storyId, profileId) {
      const { rows } = await db.query(
        `
          SELECT ${locationColumns}
          FROM stories s
          LEFT JOIN locations l ON l.story_id = s.id
          WHERE s.id = $1 AND s.profile_id = $2
          ORDER BY l.created_at, l.id
        `,
        [storyId, profileId],
      );

      if (rows.length === 0) return null;
      return rows[0].id === null ? [] : rows;
    },

    async find(storyId, profileId, locationId) {
      const { rows } = await db.query(
        `
          SELECT ${locationColumns}
          FROM locations l
          JOIN stories s ON s.id = l.story_id
          WHERE s.id = $1 AND s.profile_id = $2 AND l.id = $3
        `,
        [storyId, profileId, locationId],
      );

      return rows[0];
    },

    async create(storyId, profileId, location) {
      const { rows } = await db.query(
        `
          INSERT INTO locations AS l
            (story_id, name, type, description, climate, region, location_image, parent_location_id)
          SELECT s.id, $3, $4, $5, $6, $7, $8, $9
          FROM stories s
          WHERE s.id = $1 AND s.profile_id = $2
          RETURNING ${locationColumns}
        `,
        [storyId, profileId, ...locationValues(location)],
      );

      return rows[0];
    },

    async update(storyId, profileId, locationId, location) {
      const { rows } = await db.query(
        `
          UPDATE locations AS l
          SET name = $4, type = $5, description = $6, climate = $7,
              region = $8, location_image = $9, parent_location_id = $10,
              updated_at = now()
          FROM stories s
          WHERE l.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND l.id = $3
          RETURNING ${locationColumns}
        `,
        [storyId, profileId, locationId, ...locationValues(location)],
      );

      return rows[0];
    },

    async remove(storyId, profileId, locationId) {
      const result = await db.query(
        `
          DELETE FROM locations AS l
          USING stories s
          WHERE l.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND l.id = $3
          RETURNING l.id
        `,
        [storyId, profileId, locationId],
      );

      return result.rowCount > 0;
    },
  };
}
