export async function readDashboard(db, ownerId) {
  const { rows } = await db.query(
    `SELECT
       COUNT(*)::int AS "storyCount",
       COALESCE((
         SELECT COUNT(*)::int
         FROM chapters c
         JOIN stories s ON s.id = c.story_id
         WHERE s.profile_id = $1
       ), 0) AS "chapterCount",
       COALESCE((
         SELECT SUM(c.word_count)::int
         FROM chapters c
         JOIN stories s ON s.id = c.story_id
         WHERE s.profile_id = $1
       ), 0) AS "wordCount"
     FROM stories
     WHERE profile_id = $1`,
    [ownerId],
  );

  const {
    rows: [totals],
  } = await db.query(
    `
    SELECT
      (SELECT count(*)::int FROM ideas WHERE profile_id=$1) AS "ideaCount",
      count(*)::int AS total,
      count(*) FILTER (WHERE completed IS TRUE OR (completed IS NULL AND current_value>=target_value))::int AS completed
    FROM goals WHERE profile_id=$1`,
    [ownerId],
  );

  return {
    ...rows[0],
    goals: {
      total: totals.total,
      completed: totals.completed,
      percentage: totals.total
        ? Math.round((totals.completed / totals.total) * 100)
        : 0,
    },
    ideaCount: totals.ideaCount,
  };
}
