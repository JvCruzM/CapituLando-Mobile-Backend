export async function backupTransaction(pool, begin, action) {
  const client = await pool.connect();
  let discardConnection = false;
  try {
    await client.query(begin);
    const result = await action(client);
    await client.query("COMMIT");
    return result;
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
