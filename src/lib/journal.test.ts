import { describe, expect, it } from "vitest";
import type { JournalEntry } from "../types";
import { countByKind, filterJournal, groupJournalByDay } from "./journal";

function entry(id: string, created_at: string, kind: JournalEntry["kind"] = "note"): JournalEntry {
  return { id, task_id: "t", author_id: "a", kind, body: id, created_at };
}

const list = [
  entry("a", "2026-01-01T09:00:00"),
  entry("b", "2026-01-02T10:00:00", "risk"),
  entry("c", "2026-01-02T18:00:00", "system"),
];

describe("groupJournalByDay", () => {
  it("groups by local day, newest day and newest entry first", () => {
    const groups = groupJournalByDay(list);
    expect(groups.map((g) => g.day)).toEqual(["2026-01-02", "2026-01-01"]);
    expect(groups[0]?.entries.map((e) => e.id)).toEqual(["c", "b"]);
  });

  it("is empty for no entries", () => {
    expect(groupJournalByDay([])).toEqual([]);
  });
});

describe("filterJournal", () => {
  it("keeps everything with 'all' and filters by kind otherwise", () => {
    expect(filterJournal(list, "all")).toHaveLength(3);
    expect(filterJournal(list, "risk").map((e) => e.id)).toEqual(["b"]);
  });

  it("hides automatic entries when asked", () => {
    expect(filterJournal(list, "manual").map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("countByKind", () => {
  it("counts each kind", () => {
    const counts = countByKind(list);
    expect(counts.note).toBe(1);
    expect(counts.risk).toBe(1);
    expect(counts.system).toBe(1);
    expect(counts.decision).toBe(0);
  });
});
