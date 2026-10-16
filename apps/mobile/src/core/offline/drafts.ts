import { getDb } from "@/core/offline/db";

/**
 * Draft autosave (BLUEPRINT.md §5.2 screen 11). One draft per kind for the
 * MVP — the sell wizard restores it silently on open and deletes it after a
 * successful submit/enqueue.
 */

export function saveDraft(kind: string, payload: unknown): void {
  getDb().runSync(
    `insert into drafts (id, kind, payload, updated_at) values (?, ?, ?, ?)
     on conflict (id) do update set payload = excluded.payload, updated_at = excluded.updated_at`,
    [kind, kind, JSON.stringify(payload), Date.now()],
  );
}

export function loadDraft<T>(kind: string): T | null {
  const row = getDb().getFirstSync<{ payload: string }>(
    "select payload from drafts where id = ?",
    [kind],
  );
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export function deleteDraft(kind: string): void {
  getDb().runSync("delete from drafts where id = ?", [kind]);
}
