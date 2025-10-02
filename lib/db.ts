import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? 'postgres',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? 'devuser',
  password: process.env.POSTGRES_PASSWORD ?? 'devpass',
  database: process.env.POSTGRES_DB ?? 'insta-followers',
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

let schemaInitialized: Promise<void> | null = null;

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        deleted_at TIMESTAMPTZ
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS follower_history (
        id BIGSERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        followers INTEGER NOT NULL,
        following INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT follower_history_unique UNIQUE(account_id, date)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS account_followers (
        id BIGSERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        follower_username TEXT NOT NULL,
        full_name TEXT,
        profile_pic_url TEXT,
        is_private BOOLEAN,
        is_verified BOOLEAN,
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT account_followers_unique UNIQUE(account_id, follower_username)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS account_followers_account_id_idx
      ON account_followers (account_id)
    `);

    await client.query(`
      ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE
    `);

    await client.query(`
      ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS accounts_is_deleted_idx
      ON accounts (is_deleted, COALESCE(deleted_at, '1970-01-01'::timestamptz), username)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_devices (
        id SERIAL PRIMARY KEY,
        device_uuid TEXT NOT NULL UNIQUE,
        label TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function ensureSchema() {
  if (!schemaInitialized) {
    schemaInitialized = runMigrations();
  }
  return schemaInitialized;
}

export default pool;
