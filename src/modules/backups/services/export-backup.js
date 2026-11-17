import { readBackup } from "../repositories/export-backup.js";

export async function exportBackup(pool, ownerId) {
  const client = await pool.connect();
  let discardConnection = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const backup = await readBackup(client, ownerId);
    await client.query("COMMIT");
    return backup;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discardConnection = true;
    }
    throw error;
  } finally {
    client.release(discardConnection);
  }
}
