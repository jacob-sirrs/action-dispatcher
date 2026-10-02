// POC persistence for Session Action History — browser localStorage only.
// No server, no database, no Cloudflare KV/D1, no multi-user identity. Scope
// is intentionally limited to "survives a reload/restart on this browser" —
// see docs/IMPLEMENTATION_LOG.md for the fuller architecture discussion and
// why this is deliberately not the future persisted, multi-user ADM-07 audit
// log.

import { z } from "zod";

export const HISTORY_STORAGE_KEY = "action-dispatch:history:v1";

/** Oldest entries are dropped first once this many are stored, so a
 * long-lived browser profile never grows this without bound. */
export const HISTORY_ENTRY_CAP = 200;

const PersistedHistoryEntrySchema = z.object({
  id: z.string(),
  appName: z.string(),
  actionType: z.string(),
  accountLabel: z.string(),
  status: z.enum(["succeeded", "failed"]),
  message: z.string(),
  ranAt: z.string(),
});

const PersistedHistorySchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(PersistedHistoryEntrySchema),
});

export type PersistedHistoryEntry = z.infer<typeof PersistedHistoryEntrySchema>;

/**
 * Reads this browser's persisted action history. Any corrupted, foreign, or
 * schema-mismatched content — including a missing/different schemaVersion —
 * is discarded and treated as empty. Never throws: a read failure (quota
 * errors, storage disabled, unavailable entirely) degrades to no history
 * rather than crashing the app.
 */
export function loadHistory(): PersistedHistoryEntry[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(HISTORY_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const result = PersistedHistorySchema.safeParse(parsed);
  if (!result.success) return [];
  return result.data.entries.slice(-HISTORY_ENTRY_CAP);
}

/**
 * Persists this browser's action history, capped to the most recent
 * HISTORY_ENTRY_CAP entries (oldest dropped first). Never throws — a write
 * failure (quota exceeded, storage disabled) is swallowed, since this is a
 * best-effort convenience, not a source of truth the app depends on.
 */
export function saveHistory(entries: PersistedHistoryEntry[]): void {
  const capped = entries.slice(-HISTORY_ENTRY_CAP);
  try {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, entries: capped }),
    );
  } catch {
    // Best-effort — e.g. quota exceeded or storage unavailable.
  }
}
