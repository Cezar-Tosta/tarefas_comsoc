import type { Task } from "../types";
import { diffDays, todayISO } from "./dates";
import { effectiveStatus } from "./progress";

/** Dias após a conclusão em que a tarefa passa para "Arquivados". */
export const ARCHIVE_AFTER_DAYS = 10;

/** Data (local, AAAA-MM-DD) em que a tarefa foi concluída, ou null se não há registro. */
export function completedOn(task: Task): string | null {
  if (!task.completed_at) {
    return null;
  }
  const when = new Date(task.completed_at);
  return Number.isNaN(when.getTime()) ? null : todayISO(when);
}

/**
 * Tarefa concluída há 10 dias ou mais. Sem `completed_at` (migração 007 ainda não aplicada)
 * nunca arquiva: melhor uma lista longa do que esconder tarefa por engano.
 */
export function isArchived(task: Task, today: string): boolean {
  if (effectiveStatus(task) !== "done") {
    return false;
  }
  const done = completedOn(task);
  return done !== null && diffDays(done, today) >= ARCHIVE_AFTER_DAYS;
}

export function splitArchived(tasks: Task[], today: string): { active: Task[]; archived: Task[] } {
  const active: Task[] = [];
  const archived: Task[] = [];
  for (const task of tasks) {
    if (isArchived(task, today)) {
      archived.push(task);
    } else {
      active.push(task);
    }
  }
  return { active, archived };
}
