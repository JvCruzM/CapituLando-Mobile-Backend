import { randomUUID } from "node:crypto";
import sanitizeHtml from "../../../../.generated/sanitize-html.cjs";
import { z } from "zod";
import {
  backupRecords,
  recordReferences,
  toCamelCase,
} from "../repositories/backup-records.js";
import { invalidBackup } from "./backup-error.js";

const guid = z.guid();
const date = z.iso.date();
const instant = z.iso.datetime({ offset: true });
const recordSchema = z.looseObject({ id: guid });
const groupsSchema = z.strictObject(
  Object.fromEntries(
    backupRecords.map(({ name }) => [name, z.array(recordSchema).max(50_000)]),
  ),
);

const targetByField = {
  story: "Story",
  race: "Race",
  parentLocation: "Location",
  headquartersLocation: "Location",
  chapter: "Chapter",
  location: "Location",
  organization: "Organization",
  event: "Event",
  character: "Character",
  sourceCharacter: "Character",
  targetCharacter: "Character",
};
const optionalReferences = new Set([
  "Character.race",
  "Creature.race",
  "Location.parentLocation",
  "Organization.headquartersLocation",
  "Event.chapter",
  "Event.location",
  "Goal.story",
  "Idea.story",
]);
const integerColumns = new Set([
  "sort_order",
  "progress_percentage",
  "age",
  "order_index",
  "word_count",
  "sequence_order",
  "level",
  "current_value",
  "target_value",
]);
const nonBlankColumns = new Set([
  "client_id",
  "name",
  "title",
  "unit",
  "category",
  "relationship_type",
]);
const chapterTags = [
  "p",
  "br",
  "div",
  "span",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "h1",
  "h2",
  "h3",
  "blockquote",
  "ul",
  "ol",
  "li",
];

export function prepareRecords(input, ownerId) {
  const result = groupsSchema.safeParse(input);
  if (!result.success)
    throw invalidBackup(
      "O backup está incompleto ou contém registros inválidos.",
    );
  const count = Object.values(result.data).reduce(
    (total, group) => total + group.length,
    0,
  );
  if (count > 50_000) throw invalidBackup("O backup excede 50 mil registros.");

  const ids = new Map();
  for (const [name, group] of Object.entries(result.data)) {
    const entries = new Map();
    for (const row of group) {
      const id = row.id.toLowerCase();
      if (entries.has(id))
        throw invalidBackup("O backup contém identificadores repetidos.");
      const storyId = name === "Story" ? id : normalizeId(row.story?.id);
      entries.set(id, { id: randomUUID(), storyId });
    }
    ids.set(name, entries);
  }
  const groups = backupRecords.map((definition) => ({
    table: definition.table,
    rows: result.data[definition.name].map((row) =>
      prepareRecord(definition, row, ids, ownerId),
    ),
  }));
  return { groups, ids };
}

function prepareRecord(definition, row, ids, ownerId) {
  const { name, fields, aliases = {} } = definition;
  const source = ids.get(name).get(row.id.toLowerCase());
  const output = { id: source.id };
  for (const field of fields) {
    const value =
      row[toCamelCase(field)] ??
      (field === "client_id" ? row.id : field === "sort_order" ? 0 : null);
    output[field] = validateField(name, field, value);
  }
  for (const [field, column] of Object.entries(aliases))
    output[column] = validateField(name, column, row[field]);
  for (const [field, column] of Object.entries(recordReferences(definition))) {
    output[column] =
      field === "profile"
        ? ownerId
        : resolveReference(source, name, field, row[field], ids);
  }
  if (name === "Chapter" && output.content !== null)
    output.content = cleanChapterHtml(output.content);
  return output;
}

function resolveReference(source, name, field, reference, ids) {
  if (reference == null && optionalReferences.has(`${name}.${field}`))
    return null;
  const target = findReference(ids, targetByField[field], reference?.id);
  if (!target || target.storyId !== source.storyId) {
    throw invalidBackup(
      "O backup contém um vínculo inexistente ou de outra história.",
    );
  }
  return target.id;
}

function normalizeId(id) {
  return guid.safeParse(id).success ? id.toLowerCase() : undefined;
}

export function findReference(ids, type, id) {
  return ids.get(type).get(normalizeId(id));
}

function validateField(type, column, value) {
  if (
    (nonBlankColumns.has(column) &&
      !(type === "Idea" && column === "category")) ||
    (type === "Idea" && column === "content")
  ) {
    if (typeof value !== "string" || !value.trim())
      throw invalidBackup("O backup contém campos obrigatórios vazios.");
  }
  if (value == null) return null;
  if (column === "birth_date" && !date.safeParse(value).success)
    throw invalidBackup("O backup contém uma data de nascimento inválida.");
  if (
    ["created_at", "updated_at", "published_at"].includes(column) &&
    !instant.safeParse(value).success
  ) {
    throw invalidBackup("O backup contém uma data inválida.");
  }
  const valid = integerColumns.has(column)
    ? Number.isSafeInteger(value)
    : ["is_active", "completed"].includes(column)
      ? typeof value === "boolean"
      : typeof value === "string" && !value.includes("\u0000");
  if (!valid)
    throw invalidBackup("O backup contém campos com tipos inválidos.");
  return value;
}

export function cleanChapterHtml(content) {
  return sanitizeHtml(content, {
    allowedTags: chapterTags,
    allowedAttributes: {},
  });
}
