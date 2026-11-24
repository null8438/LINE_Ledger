import { getCloudflareContext } from "@opennextjs/cloudflare";

// データベースは Cloudflare D1（wrangler.jsonc の binding "DB"）。
// ローカル開発では wrangler が用意するローカルの D1 を使う。

export type Stmt = { sql: string; args?: unknown[] };
export type Rows = { rows: Record<string, unknown>[]; rowsAffected: number };
export type DB = {
  execute(stmt: Stmt | string): Promise<Rows>;
  batch(stmts: (Stmt | string)[], mode?: "write"): Promise<void>;
};

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

let schemaReady: Promise<void> | null = null;

export async function db(): Promise<DB> {
  const { env } = await getCloudflareContext({ async: true });
  const d1 = (env as { DB?: D1Database }).DB;
  if (!d1) throw new Error("D1 binding 'DB' が見つかりません。wrangler.jsonc を確認してください。");
  const prep = (s: Stmt | string) =>
    typeof s === "string" ? d1.prepare(s) : d1.prepare(s.sql).bind(...(s.args ?? []).map((v) => (v === undefined ? null : v)));
  const client: DB = {
    async execute(s) {
      const r = await prep(s).all();
      return { rows: (r.results ?? []) as Record<string, unknown>[], rowsAffected: r.meta?.changes ?? 0 };
    },
    async batch(stmts) {
      if (stmts.length) await d1.batch(stmts.map(prep));
    },
  };
  schemaReady ??= client.batch(SCHEMA).catch((e) => {
    schemaReady = null;
    throw e;
  });
  await schemaReady;
  return client;
}

export function newId(len = 12): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function now(): string {
  return new Date().toISOString();
}
