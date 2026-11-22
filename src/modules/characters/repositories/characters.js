const characterColumns = `
  c.id, c.story_id AS "storyId", c.race_id AS "raceId",
  c.name, c.description, c.appearance, c.personality,
  c.age, c.height, c.weight, c.zodiac,
  c.blood_type AS "bloodType", c.gender, c.background,
  c.character_image AS "characterImage",
  c.image_fit AS "imageFit", c.image_position AS "imagePosition",
  c.likes, c.dislikes, c.drinks, c.motto,
  c.role, c.mbti, c.motivation, c.notes,
  c.birth_date::text AS "birthDate",
  c.created_at AS "createdAt", c.updated_at AS "updatedAt"
`;

function characterValues(data) {
  return [
    data.raceId ?? null,
    data.name,
    data.description ?? null,
    data.appearance ?? null,
    data.personality ?? null,
    data.age ?? null,
    data.height ?? null,
    data.weight ?? null,
    data.zodiac ?? null,
    data.bloodType ?? null,
    data.gender ?? null,
    data.background ?? null,
    data.characterImage ?? null,
    data.imageFit ?? null,
    data.imagePosition ?? null,
    data.likes ?? null,
    data.dislikes ?? null,
    data.drinks ?? null,
    data.motto ?? null,
    data.role ?? null,
    data.mbti ?? null,
    data.motivation ?? null,
    data.notes ?? null,
    data.birthDate ?? null,
  ];
}

export function createCharacterRepository(db) {
  return {
    async storyExists(storyId, profileId) {
      const { rows } = await db.query(
        `SELECT 1 FROM stories WHERE id = $1 AND profile_id = $2`,
        [storyId, profileId],
      );
      return rows.length > 0;
    },

    async raceBelongsToStory(storyId, raceId) {
      const { rows } = await db.query(
        `SELECT 1 FROM races WHERE id = $1 AND story_id = $2`,
        [raceId, storyId],
      );
      return rows.length > 0;
    },

    async list(storyId, profileId) {
      const { rows } = await db.query(
        `
          SELECT ${characterColumns}
          FROM stories s
          LEFT JOIN characters c ON c.story_id = s.id
          WHERE s.id = $1 AND s.profile_id = $2
          ORDER BY c.created_at, c.id
        `,
        [storyId, profileId],
      );

      if (rows.length === 0) return null;
      return rows[0].id === null ? [] : rows;
    },

    async find(storyId, profileId, characterId) {
      const { rows } = await db.query(
        `
          SELECT ${characterColumns}
          FROM characters c
          JOIN stories s ON s.id = c.story_id
          WHERE s.id = $1 AND s.profile_id = $2 AND c.id = $3
        `,
        [storyId, profileId, characterId],
      );

      return rows[0];
    },

    async create(storyId, profileId, character) {
      const { rows } = await db.query(
        `
          INSERT INTO characters AS c (
            story_id, race_id, name, description, appearance, personality,
            age, height, weight, zodiac, blood_type, gender, background,
            character_image, image_fit, image_position,
            likes, dislikes, drinks, motto, role, mbti, motivation, notes, birth_date
          )
          SELECT s.id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                 $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
          FROM stories s
          WHERE s.id = $1 AND s.profile_id = $2
          RETURNING ${characterColumns}
        `,
        [storyId, profileId, ...characterValues(character)],
      );

      return rows[0];
    },

    async update(storyId, profileId, characterId, character) {
      const { rows } = await db.query(
        `
          UPDATE characters AS c
          SET race_id = $4, name = $5, description = $6, appearance = $7,
              personality = $8, age = $9, height = $10, weight = $11,
              zodiac = $12, blood_type = $13, gender = $14, background = $15,
              character_image = $16, image_fit = $17, image_position = $18,
              likes = $19, dislikes = $20, drinks = $21, motto = $22,
              role = $23, mbti = $24, motivation = $25, notes = $26,
              birth_date = $27, updated_at = now()
          FROM stories s
          WHERE c.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND c.id = $3
          RETURNING ${characterColumns}
        `,
        [storyId, profileId, characterId, ...characterValues(character)],
      );

      return rows[0];
    },

    async remove(storyId, profileId, characterId) {
      const result = await db.query(
        `
          DELETE FROM characters AS c
          USING stories s
          WHERE c.story_id = s.id AND s.id = $1 AND s.profile_id = $2 AND c.id = $3
          RETURNING c.id
        `,
        [storyId, profileId, characterId],
      );

      return result.rowCount > 0;
    },
  };
}
