const columns = `
  i.id, i.story_id AS "storyId", i.name, i.type, i.description,
  i.appearance, i.origin, i.item_image AS "itemImage",
  i.created_at AS "createdAt", i.updated_at AS "updatedAt"
`;

export function createItemRepository(db) {
  return {
    async list(storyId, profileId) {
      const { rows } = await db.query(
        `SELECT ${columns}
         FROM stories AS s
         LEFT JOIN items AS i ON i.story_id = s.id
         WHERE s.id = $1 AND s.profile_id = $2
         ORDER BY i.created_at, i.id`,
        [storyId, profileId],
      );
      if (rows.length === 0) return null;
      return rows[0].id === null ? [] : rows;
    },

    async find(storyId, profileId, itemId) {
      const { rows } = await db.query(
        `SELECT ${columns}
         FROM items AS i
         JOIN stories AS s ON s.id = i.story_id
         WHERE s.id = $1 AND s.profile_id = $2 AND i.id = $3`,
        [storyId, profileId, itemId],
      );
      return rows[0];
    },

    async create(storyId, profileId, item) {
      const { rows } = await db.query(
        `INSERT INTO items AS i
           (story_id, name, type, description, appearance, origin, item_image)
         SELECT s.id, $3, $4, $5, $6, $7, $8
         FROM stories AS s
         WHERE s.id = $1 AND s.profile_id = $2
         RETURNING ${columns}`,
        [storyId, profileId, ...itemValues(item)],
      );
      return rows[0];
    },

    async update(storyId, profileId, itemId, item) {
      const { rows } = await db.query(
        `UPDATE items AS i
         SET name = $4, type = $5, description = $6, appearance = $7,
             origin = $8, item_image = $9, updated_at = now()
         FROM stories AS s
         WHERE i.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND i.id = $3
         RETURNING ${columns}`,
        [storyId, profileId, itemId, ...itemValues(item)],
      );
      return rows[0];
    },

    async remove(storyId, profileId, itemId) {
      const { rows } = await db.query(
        `DELETE FROM items AS i
         USING stories AS s
         WHERE i.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND i.id = $3
         RETURNING i.id`,
        [storyId, profileId, itemId],
      );
      return rows.length > 0;
    },
  };
}

function itemValues(item) {
  return [
    item.name,
    item.type ?? null,
    item.description ?? null,
    item.appearance ?? null,
    item.origin ?? null,
    item.itemImage ?? null,
  ];
}
