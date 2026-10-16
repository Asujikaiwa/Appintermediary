import * as Crypto from "expo-crypto";

import { getDb } from "@/core/offline/db";

/**
 * Durable write queue (BLUEPRINT.md §1 sync flow). Mutations made while
 * offline are enqueued here and replayed in created_at order by the sync
 * engine. Every op carries an idempotency key so a replay that already
 * reached the server is harmless.
 */

export interface OutboxOp<TPayload = unknown> {
  id: string;
  opType: string;
  payload: TPayload;
  idempotencyKey: string;
  retryCount: number;
  nextRetryAt: number;
  createdAt: number;
}

const MAX_BACKOFF_MS = 60 * 60 * 1000; // 1h cap

export function enqueue(opType: string, payload: unknown): OutboxOp {
  const op: OutboxOp = {
    id: Crypto.randomUUID(),
    opType,
    payload,
    idempotencyKey: Crypto.randomUUID(),
    retryCount: 0,
    nextRetryAt: 0,
    createdAt: Date.now(),
  };
  getDb().runSync(
    `insert into outbox (id, op_type, payload, idempotency_key, retry_count, next_retry_at, created_at)
     values (?, ?, ?, ?, 0, 0, ?)`,
    [op.id, op.opType, JSON.stringify(op.payload), op.idempotencyKey, op.createdAt],
  );
  return op;
}

interface OutboxRow {
  id: string;
  op_type: string;
  payload: string;
  idempotency_key: string;
  retry_count: number;
  next_retry_at: number;
  created_at: number;
}

export function listDue(now = Date.now()): OutboxOp[] {
  const rows = getDb().getAllSync<OutboxRow>(
    `select * from outbox where next_retry_at <= ? order by created_at asc`,
    [now],
  );
  return rows.map((r) => ({
    id: r.id,
    opType: r.op_type,
    payload: JSON.parse(r.payload) as unknown,
    idempotencyKey: r.idempotency_key,
    retryCount: r.retry_count,
    nextRetryAt: r.next_retry_at,
    createdAt: r.created_at,
  }));
}

export function countPending(): number {
  const row = getDb().getFirstSync<{ n: number }>(
    "select count(*) as n from outbox",
  );
  return row?.n ?? 0;
}

export function remove(id: string): void {
  getDb().runSync("delete from outbox where id = ?", [id]);
}

/** Exponential backoff: 2^retries seconds, capped at 1h. */
export function markFailed(op: OutboxOp, now = Date.now()): void {
  const retries = op.retryCount + 1;
  const delayMs = Math.min(2 ** retries * 1000, MAX_BACKOFF_MS);
  getDb().runSync(
    "update outbox set retry_count = ?, next_retry_at = ? where id = ?",
    [retries, now + delayMs, op.id],
  );
}
