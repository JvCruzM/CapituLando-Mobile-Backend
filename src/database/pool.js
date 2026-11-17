import pg from "pg";

export function createPool(connectionString) {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });
  pool.on("error", (error) => {
    console.error("Conexão PostgreSQL interrompida.", error.code ?? "");
  });
  return pool;
}
