import {
  backupRecords,
  recordReferences,
  toCamelCase,
} from "./backup-records.js";
import {
  existingWorkspaceRecords,
  loadOwnedStoryIds,
} from "../../workspace/records.js";

const arraySections = ["concepts", "events"];
const sections = [...arraySections, "profile", "settings", "writing"];

export async function readBackup(client, ownerId) {
  const {
    rows: [profile],
  } = await client.query(
    `SELECT p.display_name, p.bio, p.avatar_image, u.email
     FROM profiles AS p
     JOIN users AS u ON u.id = p.id
     WHERE p.id = $1`,
    [ownerId],
  );
  if (!profile) return null;

  const records = {};
  for (const definition of backupRecords) {
    records[definition.name] = await readRecords(client, ownerId, definition);
  }
  const workspace = await readWorkspace(client, ownerId, profile);
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    records,
    workspace,
  };
}

async function readRecords(client, ownerId, definition) {
  const { table, fields, aliases = {} } = definition;
  const relations = recordReferences(definition);
  const columns = [
    "id",
    ...fields,
    ...Object.values(aliases),
    ...Object.values(relations),
  ];
  const byProfile = Object.hasOwn(relations, "profile");

  const { rows } = await client.query(
    `SELECT to_jsonb(record) AS data
     FROM (
       SELECT ${columns.map((column) => `t.${column}`).join(", ")}
       FROM ${table} AS t
       ${byProfile ? "" : "JOIN stories AS s ON s.id = t.story_id"}
       WHERE ${byProfile ? "t" : "s"}.profile_id = $1
       ORDER BY t.id
     ) AS record`,
    [ownerId],
  );

  return rows.map(({ data }) => {
    const record = { id: data.id };
    for (const field of fields) record[toCamelCase(field)] = data[field];
    for (const [field, column] of Object.entries(aliases))
      record[field] = data[column];
    for (const [field, column] of Object.entries(relations)) {
      record[field] = data[column] === null ? null : { id: data[column] };
    }
    return record;
  });
}

async function readWorkspace(client, ownerId, profile) {
  const ids = sections.map((section) => `${ownerId}:${section}`);
  const { rows } = await client.query(
    "SELECT id, revision, content FROM workspace_sections WHERE id = ANY($1::varchar[])",
    [ids],
  );
  const documents = new Map(rows.map((row) => [row.id, row]));
  const storyIds = await loadOwnedStoryIds(client, ownerId);

  return Object.fromEntries(
    sections.map((section, index) => {
      const row = documents.get(ids[index]);
      const document = row
        ? { revision: Number(row.revision), value: JSON.parse(row.content) }
        : { revision: 0, value: defaultValue(section, profile) };
      if (arraySections.includes(section))
        document.value = existingWorkspaceRecords(
          section,
          document.value,
          storyIds,
        );
      return [section, document];
    }),
  );
}

function defaultValue(section, profile) {
  if (arraySections.includes(section)) return [];
  if (section !== "profile") return {};
  return {
    name: profile.display_name,
    penName: profile.display_name,
    bio: profile.bio ?? "",
    avatarUrl: profile.avatar_image ?? "",
    email: profile.email,
    favoriteGenres: [],
    quote: "",
    websiteUrl: "",
  };
}
