import pg from 'pg';

export type Row = Record<string, unknown>;

// Minimal database surface shared by node-postgres (production) and PGlite (local dev and tests).
export interface Db {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const wrapClient = (client: pg.ClientBase): Pick<Db, 'query'> => ({
  query: async <T extends Row>(sql: string, params?: unknown[]) =>
    (await client.query(sql, params)).rows as T[],
});

export function createPgDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 3, idleTimeoutMillis: 10_000 });
  return {
    query: async <T extends Row>(sql: string, params?: unknown[]) =>
      (await pool.query(sql, params)).rows as T[],
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        // Nested transactions are not supported: the inner Db runs on the same connection.
        const tx: Db = {
          ...wrapClient(client),
          transaction: () => Promise.reject(new Error('Nested transactions are not supported')),
          close: () => Promise.resolve(),
        };
        const result = await fn(tx);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
