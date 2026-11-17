import { z } from "zod";
import {
  lockBackupOwner,
  replaceRecords,
  replaceWorkspace,
} from "../repositories/restore-backup.js";
import { invalidBackup } from "../schemas/backup-error.js";
import { prepareRecords } from "../schemas/restore-records.js";
import { prepareWorkspace } from "../schemas/restore-workspace.js";
import { backupTransaction } from "./backup-transaction.js";

const envelope = z.object({
  schemaVersion: z.literal(1),
  records: z.record(z.string(), z.unknown()),
  workspace: z.record(z.string(), z.unknown()),
});

export async function restoreBackup(pool, ownerId, body) {
  const result = envelope.safeParse(body);
  if (!result.success) throw invalidBackup("Formato de backup incompatível.");
  const { groups, ids } = prepareRecords(result.data.records, ownerId);
  const workspace = prepareWorkspace(result.data.workspace, ids);

  try {
    await backupTransaction(pool, "BEGIN", async (client) => {
      const { email } = await lockBackupOwner(client, ownerId);
      await replaceRecords(client, ownerId, groups);
      await replaceWorkspace(client, ownerId, workspace, email);
    });
  } catch (error) {
    if (
      typeof error.code === "string" &&
      /^(22[0-9A-Z]{3}|23502|23503|23505|23514)$/.test(error.code)
    ) {
      throw invalidBackup(
        "O arquivo contém campos ou vínculos incompatíveis com o banco.",
      );
    }
    throw error;
  }
}
