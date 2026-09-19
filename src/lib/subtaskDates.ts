import type { Subtask } from "../types";
import { addDays } from "./dates";

export interface DateRange {
  start: string | null;
  end: string | null;
}

function byId(subtasks: Subtask[]): Map<string, Subtask> {
  return new Map(subtasks.map((s) => [s.id, s]));
}

function resolve(subtask: Subtask, index: Map<string, Subtask>, seen: Set<string>): DateRange {
  let start = subtask.start_date;
  const predecessor = subtask.start_after_id ? index.get(subtask.start_after_id) : undefined;
  if (predecessor && !seen.has(subtask.id)) {
    seen.add(subtask.id);
    const before = resolve(predecessor, index, seen);
    const predecessorEnd = before.end ?? before.start;
    if (predecessorEnd) {
      start = addDays(predecessorEnd, 1); // começa no dia seguinte ao término da anterior
    }
  }
  let end = subtask.end_date;
  if (start && end && end < start) {
    end = start; // fim anterior ao início vinculado: dura pelo menos um dia
  }
  return { start, end };
}

/**
 * Datas de uma subtarefa. Quando ela está vinculada ao término de outra (`start_after_id`),
 * o início é o dia seguinte ao fim da anterior; o fim continua sendo o próprio.
 */
export function resolveSubtaskDates(subtask: Subtask, siblings: Subtask[]): DateRange {
  return resolve(subtask, byId(siblings), new Set());
}

/** Vincular `subtaskId` ao término de `predecessorId` criaria um ciclo (A após B após A…)? */
export function wouldCreateCycle(
  subtasks: Subtask[],
  subtaskId: string,
  predecessorId: string,
): boolean {
  const index = byId(subtasks);
  const seen = new Set<string>();
  let current: string | null | undefined = predecessorId;
  while (current && !seen.has(current)) {
    if (current === subtaskId) {
      return true;
    }
    seen.add(current);
    current = index.get(current)?.start_after_id;
  }
  return false;
}
