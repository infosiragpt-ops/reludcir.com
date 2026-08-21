import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

declare global {
  // Reuse the pool during Next.js development hot reloads.
  var __reludcirDatabase: Database | undefined;
  var __reludcirPool: Pool | undefined;
}

function readPositiveInteger(name: string, fallback: number, maximum: number): number {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return Math.min(parsedValue, maximum);
}

function getConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.",
    );
  }

  return connectionString;
}

function createPool(): Pool {
  return new Pool({
    connectionString: getConnectionString(),
    max: readPositiveInteger("DATABASE_POOL_MAX", 10, 20),
    idleTimeoutMillis: readPositiveInteger(
      "DATABASE_POOL_IDLE_TIMEOUT_MS",
      10_000,
      120_000,
    ),
    connectionTimeoutMillis: readPositiveInteger(
      "DATABASE_POOL_CONNECTION_TIMEOUT_MS",
      5_000,
      30_000,
    ),
    application_name: process.env.DATABASE_APPLICATION_NAME ?? "reludcir-web",
  });
}

function getPool(): Pool {
  if (process.env.NODE_ENV === "production") {
    return globalThis.__reludcirPool ?? (globalThis.__reludcirPool = createPool());
  }

  globalThis.__reludcirPool ??= createPool();
  return globalThis.__reludcirPool;
}

export function getDb(): Database {
  globalThis.__reludcirDatabase ??= drizzle(getPool(), { schema });
  return globalThis.__reludcirDatabase;
}

export async function withTransaction<T>(
  callback: (transaction: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(callback);
}

export async function closeDb(): Promise<void> {
  const pool = globalThis.__reludcirPool;

  globalThis.__reludcirDatabase = undefined;
  globalThis.__reludcirPool = undefined;

  if (pool) {
    await pool.end();
  }
}

export { schema };
