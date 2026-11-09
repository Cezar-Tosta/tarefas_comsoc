// Diário de bordo: a memória do projeto. Os registros nunca são editados; só se acrescentam.

import type { JournalEntry, JournalKind } from "../types";
import { todayISO } from "./dates";

export const JOURNAL_KINDS: JournalKind[] = [
  "note",
  "progress",
  "decision",
  "risk",
  "issue",
  "milestone",
  "system",
];

/** O que uma pessoa pode registrar (os automáticos vêm do banco). */
export const MANUAL_KINDS: JournalKind[] = JOURNAL_KINDS.filter((kind) => kind !== "system");

/** "all" = tudo; "manual" = sem os registros automáticos. */
export type JournalFilter = JournalKind | "all" | "manual";

export function filterJournal(entries: JournalEntry[], filter: JournalFilter): JournalEntry[] {
  if (filter === "all") {
    return entries;
  }
  if (filter === "manual") {
    return entries.filter((entry) => entry.kind !== "system");
  }
  return entries.filter((entry) => entry.kind === filter);
}

export interface JournalDay {
  /** Dia local (AAAA-MM-DD). */
  day: string;
  entries: JournalEntry[];
}

/** Agrupa por dia, do mais recente para o mais antigo (e, no dia, do último para o primeiro). */
export function groupJournalByDay(entries: JournalEntry[]): JournalDay[] {
  const sorted = entries.toSorted((a, b) => b.created_at.localeCompare(a.created_at));
  const groups: JournalDay[] = [];
  for (const entry of sorted) {
    const date = new Date(entry.created_at);
    const day = Number.isNaN(date.getTime()) ? entry.created_at.slice(0, 10) : todayISO(date);
    const last = groups.at(-1);
    if (last && last.day === day) {
      last.entries.push(entry);
    } else {
      groups.push({ day, entries: [entry] });
    }
  }
  return groups;
}

export function countByKind(entries: JournalEntry[]): Record<JournalKind, number> {
  const counts = Object.fromEntries(JOURNAL_KINDS.map((kind) => [kind, 0])) as Record<
    JournalKind,
    number
  >;
  for (const entry of entries) {
    counts[entry.kind]++;
  }
  return counts;
}
