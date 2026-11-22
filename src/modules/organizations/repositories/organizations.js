const organizationColumns = `
  o.id, o.story_id AS "storyId",
  o.headquarters_location_id AS "headquartersLocationId",
  o.name, o.type, o.description,
  o.organization_image AS "organizationImage",
  o.created_at AS "createdAt", o.updated_at AS "updatedAt"
`;

function organizationValues({
  name,
  type,
  description,
  organizationImage,
  headquartersLocationId,
}) {
  return [
    name,
    type ?? null,
    description ?? null,
    organizationImage ?? null,
    headquartersLocationId ?? null,
  ];
}

export function createOrganizationRepository(db) {
  return {
    async storyExists(storyId, profileId) {
      const { rows } = await db.query(
        `SELECT 1 FROM stories WHERE id = $1 AND profile_id = $2`,
        [storyId, profileId],
      );
      return rows.length > 0;
    },

    async locationBelongsToStory(storyId, locationId) {
      const { rows } = await db.query(
        `SELECT 1 FROM locations WHERE id = $1 AND story_id = $2`,
        [locationId, storyId],
      );
      return rows.length > 0;
    },

    async list(storyId, profileId) {
      const { rows } = await db.query(
        `
          SELECT ${organizationColumns}
          FROM stories s
          LEFT JOIN organizations o ON o.story_id = s.id
          WHERE s.id = $1 AND s.profile_id = $2
          ORDER BY o.created_at, o.id
        `,
        [storyId, profileId],
      );

      if (rows.length === 0) return null;
      return rows[0].id === null ? [] : rows;
    },

    async find(storyId, profileId, organizationId) {
      const { rows } = await db.query(
        `
          SELECT ${organizationColumns}
          FROM organizations o
          JOIN stories s ON s.id = o.story_id
          WHERE s.id = $1 AND s.profile_id = $2 AND o.id = $3
        `,
        [storyId, profileId, organizationId],
      );

      return rows[0];
    },

    async create(storyId, profileId, organization) {
      const { rows } = await db.query(
        `
          INSERT INTO organizations AS o
            (story_id, name, type, description, organization_image, headquarters_location_id)
          SELECT s.id, $3, $4, $5, $6, $7
          FROM stories s
          WHERE s.id = $1 AND s.profile_id = $2
          RETURNING ${organizationColumns}
        `,
        [storyId, profileId, ...organizationValues(organization)],
      );

      return rows[0];
    },

    async update(storyId, profileId, organizationId, organization) {
      const { rows } = await db.query(
        `
          UPDATE organizations AS o
          SET name = $4, type = $5, description = $6,
              organization_image = $7, headquarters_location_id = $8,
              updated_at = now()
          FROM stories s
          WHERE o.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND o.id = $3
          RETURNING ${organizationColumns}
        `,
        [storyId, profileId, organizationId, ...organizationValues(organization)],
      );

      return rows[0];
    },

    async remove(storyId, profileId, organizationId) {
      const result = await db.query(
        `
          DELETE FROM organizations AS o
          USING stories s
          WHERE o.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND o.id = $3
          RETURNING o.id
        `,
        [storyId, profileId, organizationId],
      );

      return result.rowCount > 0;
    },
  };
}
