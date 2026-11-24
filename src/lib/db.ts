import { createClient, type Client } from "@libsql/client";

// ローカルは SQLite ファイル、本番は Turso（libsql://...）を DATABASE_URL で指定する。
const url = process.env.DATABASE_URL ?? "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- active | settling | completed
    created_at TEXT NOT NULL,
    settled_at TEXT,
    completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    user_id TEXT,      -- LINEのuserId（ゲストは guest:xxxx）
    picture_url TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS members_trip_user ON members(trip_id, user_id) WHERE user_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS members_user ON members(user_id)`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount INTEGER NOT NULL,
    payer_id TEXT NOT NULL REFERENCES members(id),
    created_by TEXT REFERENCES members(id),
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS expenses_trip ON expenses(trip_id)`,
  `CREATE TABLE IF NOT EXISTS expense_shares (
    expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES members(id),
    PRIMARY KEY (expense_id, member_id)
  )`,
  `CREATE TABLE IF NOT EXISTS settlements (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    from_id TEXT NOT NULL REFERENCES members(id),
    to_id TEXT NOT NULL REFERENCES members(id),
    amount INTEGER NOT NULL,
    paid_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS settlements_trip ON settlements(trip_id)`,
];

const g = globalThis as unknown as { __db?: Promise<Client> };

export function db(): Promise<Client> {
  if (!g.__db) {
    g.__db = (async () => {
      const client = createClient({ url, authToken });
      await client.batch(SCHEMA, "write");
      return client;
    })().catch((e) => {
      g.__db = undefined;
      throw e;
    });
  }
  return g.__db;
}

export function newId(len = 12): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function now(): string {
  return new Date().toISOString();
}
