import { transaction } from "../../../database/transaction.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { findUser } from "../../auth/repositories/auth.js";
import { readProfile, readSettings } from "../repositories/profile.js";

export function updateProfile(pool, ownerId, input) {
  return transaction(pool, async (client) => {
    await findUser(client, "id", ownerId, true);
    await client.query(
      `UPDATE profiles SET username = $2, display_name = $3, bio = $4, avatar_image = $5, updated_at = now()
       WHERE id = $1`,
      [
        ownerId,
        input.username.toLowerCase(),
        input.displayName,
        input.bio ?? null,
        input.avatarImage ?? null,
      ],
    );
    const { rows } = await client.query(
      "SELECT content FROM workspace_sections WHERE id = $1",
      [ownerId + ":profile"],
    );
    if (rows.length) {
      const value = {
        ...JSON.parse(rows[0].content),
        name: input.displayName,
        bio: input.bio ?? "",
        avatarUrl: input.avatarImage ?? "",
      };
      await client.query(
        "UPDATE workspace_sections SET content = $2, revision = revision + 1 WHERE id = $1",
        [ownerId + ":profile", JSON.stringify(value)],
      );
    }
    return readProfile(client, ownerId);
  });
}

export function updateSettings(pool, ownerId, input) {
  return transaction(pool, async (client) => {
    await findUser(client, "id", ownerId, true);
    const current = await readSettings(client, ownerId);
    if (current.revision !== input.revision) {
      throw new AppError(
        409,
        "REVISION_CONFLICT",
        "As preferências mudaram em outra sessão. Recarregue antes de salvar.",
      );
    }
    await client.query(
      `INSERT INTO workspace_sections (id, content, revision) VALUES ($1, $2, 1)
       ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, revision = workspace_sections.revision + 1`,
      [ownerId + ":settings", JSON.stringify(input.value)],
    );
    return { revision: current.revision + 1, value: input.value };
  });
}
