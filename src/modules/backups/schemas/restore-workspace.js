import { z } from "zod";
import { invalidBackup } from "./backup-error.js";
import { cleanChapterHtml, findReference } from "./restore-records.js";

const optionalText = (max) => z.string().max(max).nullish();
const requiredText = (max) =>
  z
    .string()
    .max(max)
    .refine((text) => Boolean(text.trim()));
const projectId = z.guid();
const id = requiredText(100);

export const workspaceValueSchemas = {
  goals: z
    .array(
      z.looseObject({
        id,
        projectId: projectId.nullish(),
        title: requiredText(180),
        unit: requiredText(50),
        current: z.int32().min(0),
        target: z.int32().positive(),
        completed: z.boolean().optional(),
      }),
    )
    .max(5000),
  ideas: z
    .array(
      z.looseObject({
        id,
        projectId,
        content: requiredText(100000),
        category: optionalText(100),
        createdAt: optionalText(100),
      }),
    )
    .max(5000),
  concepts: z
    .array(
      z.looseObject({
        id,
        projectId,
        title: requiredText(150),
        description: requiredText(100000),
        region: optionalText(100),
        category: z.enum([
          "Local",
          "Regra de Magia",
          "Lore / História",
          "Organização",
        ]),
        notes: optionalText(100000),
        imageUrl: optionalText(2000000),
      }),
    )
    .max(5000),
  events: z
    .array(
      z.looseObject({
        id,
        projectId,
        title: requiredText(200),
        yearOrDate: requiredText(100),
        description: optionalText(100000),
        characters: optionalText(5000),
      }),
    )
    .max(5000),
  profile: z.looseObject({
    name: requiredText(100).nullish(),
    penName: optionalText(100000),
    email: optionalText(100000),
    websiteUrl: optionalText(100000),
    avatarUrl: optionalText(2000000),
    bio: optionalText(100000),
    quote: optionalText(100000),
    favoriteGenres: z.array(z.string().max(100)).max(50).optional(),
  }),
  settings: z.looseObject({
    themeMode: z.enum(["system", "light", "dark"]).optional(),
    fontSize: z.enum(["sm", "md", "lg"]).optional(),
    dailyReminder: z.boolean().optional(),
    goalAlerts: z.boolean().optional(),
    reminderTime: z
      .string()
      .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
      .optional(),
  }),
  writing: z.looseObject({
    projectId: projectId.nullish(),
    chapterId: z.guid().nullish(),
    title: optionalText(200),
    content: optionalText(2000000),
  }),
};

const sections = workspaceValueSchemas;
export const workspaceSections = Object.keys(sections);
const workspaceSchema = z.strictObject(
  Object.fromEntries(
    Object.entries(sections).map(([section, schema]) => [
      section,
      z.object({ value: schema }).optional(),
    ]),
  ),
);

export function prepareWorkspace(input, ids) {
  const result = workspaceSchema.safeParse(input);
  if (!result.success)
    throw invalidBackup("O espaço de trabalho do backup é inválido.");

  const workspace = {};
  for (const [section, { value }] of Object.entries(result.data)) {
    if (Array.isArray(value)) {
      const keys = new Set(value.map((item) => item.id));
      if (keys.size !== value.length)
        throw invalidBackup(
          "O espaço de trabalho contém identificadores repetidos.",
        );
      for (const item of value) remapStory(item, ids);
    } else if (section === "writing") {
      const oldStoryId = value.projectId?.toLowerCase();
      remapStory(value, ids);
      if (value.chapterId) {
        const chapter = findReference(ids, "Chapter", value.chapterId);
        if (chapter && chapter.storyId === oldStoryId) {
          value.chapterId = chapter.id;
          value.chapterRevision = 0;
          value.chapterVersion = 0;
        } else delete value.chapterId;
      }
      if (typeof value.content === "string")
        value.content = cleanChapterHtml(value.content);
    }
    if (JSON.stringify(value).length > 5_000_000)
      throw invalidBackup("O espaço de trabalho excede o tamanho permitido.");
    workspace[section] = value;
  }
  return workspace;
}

function remapStory(value, ids) {
  if (value.projectId == null) return;
  const story = findReference(ids, "Story", value.projectId);
  if (!story)
    throw invalidBackup(
      "O espaço de trabalho referencia uma história ausente no backup.",
    );
  value.projectId = story.id;
}
