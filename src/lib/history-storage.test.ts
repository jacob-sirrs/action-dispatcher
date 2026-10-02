import { beforeEach, describe, expect, it } from "vitest";
import {
  HISTORY_ENTRY_CAP,
  HISTORY_STORAGE_KEY,
  loadHistory,
  saveHistory,
  type PersistedHistoryEntry,
} from "./history-storage";

beforeEach(() => {
  localStorage.clear();
});

function makeEntry(overrides: Partial<PersistedHistoryEntry> = {}): PersistedHistoryEntry {
  return {
    id: "e1",
    appName: "Gmail",
    actionType: "Send Email",
    accountLabel: "user@example.com",
    status: "succeeded",
    message: "Send Email completed via Gmail (user@example.com).",
    ranAt: "2026-09-30T10:00:00.000Z",
    ...overrides,
  };
}

describe("loadHistory", () => {
  it("returns an empty array when nothing has been stored", () => {
    expect(loadHistory()).toEqual([]);
  });

  it("returns an empty array when the stored value is not valid JSON", () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, "{not json");
    expect(loadHistory()).toEqual([]);
  });

  it("returns an empty array when the stored JSON doesn't match the expected shape", () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ foo: "bar" }));
    expect(loadHistory()).toEqual([]);
  });

  it("returns an empty array when the schema version doesn't match", () => {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 999, entries: [makeEntry()] }),
    );
    expect(loadHistory()).toEqual([]);
  });

  it("returns an empty array when the stored value is a bare array, not the wrapper object", () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([makeEntry()]));
    expect(loadHistory()).toEqual([]);
  });

  it("loads entries that were previously saved, unchanged", () => {
    const entry = makeEntry({ status: "failed", message: "Zapier action failed." });
    saveHistory([entry]);
    expect(loadHistory()).toEqual([entry]);
  });

  it("strips any unexpected extra field from a stored entry rather than trusting it", () => {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        entries: [{ ...makeEntry(), secretToken: "should-not-survive" }],
      }),
    );
    const [entry] = loadHistory();
    expect(entry).not.toHaveProperty("secretToken");
    expect(JSON.stringify(entry)).not.toContain("should-not-survive");
  });
});

describe("saveHistory", () => {
  it("caps stored history at HISTORY_ENTRY_CAP entries, dropping the oldest first", () => {
    const entries = Array.from({ length: HISTORY_ENTRY_CAP + 5 }, (_, i) =>
      makeEntry({ id: `e${i}`, ranAt: `2026-09-30T10:${String(i).padStart(2, "0")}:00.000Z` }),
    );
    saveHistory(entries);
    const loaded = loadHistory();
    expect(loaded).toHaveLength(HISTORY_ENTRY_CAP);
    // The oldest 5 (e0..e4) should have been dropped; the newest should remain.
    expect(loaded[0].id).toBe("e5");
    expect(loaded[loaded.length - 1].id).toBe(`e${HISTORY_ENTRY_CAP + 4}`);
  });

  it("never persists fields outside the known safe set", () => {
    saveHistory([makeEntry()]);
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)!;
    expect(raw).not.toContain("sourceQuote");
    expect(raw).not.toContain("params");
  });
});
