export async function loadOwnedStoryIds(db, ownerId) {
  const { rows } = await db.query(
    "SELECT id FROM stories WHERE profile_id=$1",
    [ownerId],
  );
  return new Set(rows.map((story) => story.id));
}

export function existingWorkspaceRecords(section, value, storyIds) {
  return value.filter((record) =>
    record.projectId ? storyIds.has(record.projectId) : section === "goals",
  );
}
