import { readBackup } from "../repositories/export-backup.js";
import { backupTransaction } from "./backup-transaction.js";

export function exportBackup(pool, ownerId) {
  return backupTransaction(
    pool,
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    (client) => readBackup(client, ownerId),
  );
}
