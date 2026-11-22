const eventColumns = `
  e.id, e.story_id AS "storyId",
  e.chapter_id AS "chapterId",
  e.location_id AS "locationId",
  e.title, e.description,
  e.chronological_date AS "chronologicalDate",
  e.sequence_order AS "sequenceOrder",
  e.event_image AS "eventImage",
  e.created_at AS "createdAt", e.updated_at AS "updatedAt"
`;

function eventValues({
  title,
  description,
  chronologicalDate,
  sequenceOrder,
  eventImage,
  chapterId,
  locationId,
}) {
  return [
    chapterId ?? null,
    locationId ?? null,
    title,
    description ?? null,
    chronologicalDate ?? null,
    sequenceOrder ?? null,
    eventImage ?? null,
  ];
}

export function createEventRepository(db) {
  return {
    async storyExists(storyId, profileId) {
      const { rows } = await db.query(
        `SELECT 1 FROM stories WHERE id = $1 AND profile_id = $2`,
        [storyId, profileId],
      );
      return rows.length > 0;
    },

    async referencesBelongToStory(storyId, chapterId, locationId) {
      const { rows } = await db.query(
        `
          SELECT
            CASE WHEN $2::uuid IS NULL THEN true
                 ELSE EXISTS(SELECT 1 FROM chapters WHERE id = $2 AND story_id = $1)
            END AS "validChapter",
            CASE WHEN $3::uuid IS NULL THEN true
                 ELSE EXISTS(SELECT 1 FROM locations WHERE id = $3 AND story_id = $1)
            END AS "validLocation"
        `,
        [storyId, chapterId ?? null, locationId ?? null],
      );
      return rows[0];
    },

    async list(storyId, profileId) {
      const { rows } = await db.query(
        `
          SELECT ${eventColumns}
          FROM stories s
          LEFT JOIN events e ON e.story_id = s.id
          WHERE s.id = $1 AND s.profile_id = $2
          ORDER BY e.sequence_order ASC NULLS LAST, e.created_at ASC, e.id ASC
        `,
        [storyId, profileId],
      );

      if (rows.length === 0) return null;
      return rows[0].id === null ? [] : rows;
    },

    async find(storyId, profileId, eventId) {
      const { rows } = await db.query(
        `
          SELECT ${eventColumns}
          FROM events e
          JOIN stories s ON s.id = e.story_id
          WHERE s.id = $1 AND s.profile_id = $2 AND e.id = $3
        `,
        [storyId, profileId, eventId],
      );

      return rows[0];
    },

    async create(storyId, profileId, event) {
      const { rows } = await db.query(
        `
          INSERT INTO events AS e (
            story_id, chapter_id, location_id, title, description,
            chronological_date, sequence_order, event_image
          )
          SELECT s.id, $3, $4, $5, $6, $7, $8, $9
          FROM stories s
          WHERE s.id = $1 AND s.profile_id = $2
          RETURNING ${eventColumns}
        `,
        [storyId, profileId, ...eventValues(event)],
      );

      return rows[0];
    },

    async update(storyId, profileId, eventId, event) {
      const { rows } = await db.query(
        `
          UPDATE events AS e
          SET chapter_id = $4,
              location_id = $5,
              title = $6,
              description = $7,
              chronological_date = $8,
              sequence_order = $9,
              event_image = $10,
              updated_at = now()
          FROM stories s
          WHERE e.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND e.id = $3
          RETURNING ${eventColumns}
        `,
        [storyId, profileId, eventId, ...eventValues(event)],
      );

      return rows[0];
    },

    async remove(storyId, profileId, eventId) {
      const result = await db.query(
        `
          DELETE FROM events AS e
          USING stories s
          WHERE e.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND e.id = $3
          RETURNING e.id
        `,
        [storyId, profileId, eventId],
      );

      return result.rowCount > 0;
    },
  };
}
