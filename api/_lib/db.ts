import mysql from "mysql2/promise";
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

// One pool per lambda instance (Hostpoint shared MySQL has a low connection
// budget, so keep the limit small — each serverless instance gets its own pool).
const globalForPool = globalThis as unknown as { mysqlPool?: Pool };

function createPool(): Pool {
  const host = process.env.MYSQL_HOST;
  if (!host) throw new Error("MYSQL_HOST environment variable is not set");
  return mysql.createPool({
    host,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: Number(process.env.MYSQL_PORT || 3306), // `||`: an empty env var must not become port 0
    waitForConnections: true,
    connectionLimit: 5,
    charset: "utf8mb4",
    ssl: { rejectUnauthorized: false },
  });
}

export const pool: Pool = globalForPool.mysqlPool ?? createPool();
globalForPool.mysqlPool = pool;

export type SqlParam = string | number | boolean | Date | null;

export async function query<T = Record<string, unknown>>(
  sql: string,
  args: SqlParam[] = []
): Promise<T[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(sql, args);
  return rows as unknown as T[];
}

/** Use for INSERT/UPDATE/DELETE when you need insertId or affectedRows. */
export async function execute(
  sql: string,
  args: SqlParam[] = []
): Promise<{ insertId: number; affectedRows: number }> {
  const [result] = await pool.execute<ResultSetHeader>(sql, args);
  return { insertId: result.insertId, affectedRows: result.affectedRows };
}
