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

  const { rows: sections } = await db.query(
    `SELECT id, content
     FROM workspace_sections
     WHERE id = ANY($1::text[])`,
    [[`${ownerId}:goals`, `${ownerId}:ideas`]],
  );

  const documents = Object.fromEntries(
    sections.map((section) => [section.id, JSON.parse(section.content)]),
  );

  const goals = documents[`${ownerId}:goals`] ?? [];
  const ideas = documents[`${ownerId}:ideas`] ?? [];
  const completedGoals = goals.filter((goal) => goal.completed).length;

  return {
    ...rows[0],
    goals: {
      total: goals.length,
      completed: completedGoals,
      percentage: goals.length
        ? Math.round((completedGoals / goals.length) * 100)
        : 0,
    },
    ideaCount: ideas.length,
  };
}
