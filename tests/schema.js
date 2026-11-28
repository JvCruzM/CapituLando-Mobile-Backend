import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function installProjectSchema(db) {
  const directory = process.env.TEST_MIGRATIONS_DIR;
  if (directory) {
    const files = (await readdir(directory))
      .filter((file) => /^V\d+__.*\.sql$/.test(file))
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    for (const file of files)
      await db.exec(await readFile(join(directory, file), "utf8"));
    return;
  }
  await db.exec(
    await readFile(new URL("./project-schema.sql", import.meta.url), "utf8"),
  );
}
