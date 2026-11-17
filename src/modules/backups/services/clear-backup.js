import {
  clearOwnedRecords,
  clearWorkspaceSections,
  lockBackupOwner,
} from "../repositories/restore-backup.js";
import { backupTransaction } from "./backup-transaction.js";

export function clearAccountContent(pool, ownerId) {
  return backupTransaction(pool, "BEGIN", async (client) => {
    await lockBackupOwner(client, ownerId);
    await clearOwnedRecords(client, ownerId);
    await clearWorkspaceSections(client, ownerId);
  });
}
