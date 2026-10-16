import * as SQLite from "expo-sqlite";

/**
 * Local SQLite (BLUEPRINT.md §3.3): outbox + drafts + kv_meta.
 * Query cache (feed/chat) is NOT here — it lives in MMKV via the TanStack
 * persister and can be thrown away. This DB holds only user-created data
 * that must survive a restart: pending writes and listing drafts.
 *
 * Migrations: PRAGMA user_version, applied in order on open.
 */

const MIGRATIONS: string[] = [
  // v1
  `
  create table if not exists outbox (
    id              text primary key,
    op_type         text not null,
    payload         text not null,          -- json
    idempotency_key text not null,
    retry_count     integer not null default 0,
    next_retry_at   integer not null default 0,  -- epoch ms
    created_at      integer not null             -- epoch ms; replay in this order
  );
  create table if not exists drafts (
    id         text primary key,
    kind       text not null,               -- 'listing'
    payload    text not null,               -- json
    updated_at integer not null
  );
  create table if not exists kv_meta (
    key   text primary key,
    value text
  );
  `,
];

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (db) return db;
  db = SQLite.openDatabaseSync("yodkai.db");
  db.execSync("pragma journal_mode = wal;");

  const row = db.getFirstSync<{ user_version: number }>(
    "pragma user_version;",
  );
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.execSync(MIGRATIONS[v]!);
    db.execSync(`pragma user_version = ${v + 1};`);
  }
  return db;
}
