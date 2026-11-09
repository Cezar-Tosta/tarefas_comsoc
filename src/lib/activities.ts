// Atividades: o que precisa ser feito. Cada etapa em aberto é uma atividade; um projeto sem
// etapas é, ele mesmo, uma atividade. Agrupadas pelo prazo.

import type { Subtask, Task } from "../types";
import { diffDays } from "./dates";
import { effectiveStatus } from "./progress";
import { resolveSubtaskDates } from "./subtaskDates";

export interface Activity {
  kind: "task" | "subtask";
  id: string;
  title: string;
  task: Task;
  subtask: Subtask | null;
  assigneeId: string | null;
  /** Prazo efetivo (o da etapa ou, sem ele, o do projeto). */
  end: string | null;
  /** O prazo veio do projeto porque a etapa não tem data própria. */
  inheritedDate: boolean;
}

export function buildActivities(tasks: Task[]): Activity[] {
  const items: Activity[] = [];
  for (const task of tasks) {
    if (task.subtasks.length === 0) {
      if (effectiveStatus(task) !== "done") {
        items.push({
          kind: "task",
          id: task.id,
          title: task.title,
          task,
          subtask: null,
          assigneeId: task.assignee_id,
          end: task.end_date,
          inheritedDate: false,
        });
      }
      continue;
    }
    for (const subtask of task.subtasks) {
      if (subtask.done) {
        continue;
      }
      const own = resolveSubtaskDates(subtask, task.subtasks).end;
      items.push({
        kind: "subtask",
        id: subtask.id,
        title: subtask.title,
        task,
        subtask,
        assigneeId: subtask.assignee_id,
        end: own ?? task.end_date,
        inheritedDate: own === null && task.end_date !== null,
      });
    }
  }
  return items;
}

/** É da pessoa: atribuída a ela, ou sem responsável dentro de um projeto dela. */
export function isMine(item: Activity, personId: string): boolean {
  if (item.assigneeId !== null) {
    return item.assigneeId === personId;
  }
  return item.task.assignee_id === personId;
}

export type DueKey = "overdue" | "today" | "week" | "later" | "undated";

export const DUE_LABEL: Record<DueKey, string> = {
  overdue: "Atrasadas",
  today: "Para hoje",
  week: "Próximos 7 dias",
  later: "Mais adiante",
  undated: "Sem prazo",
};

const DUE_ORDER: DueKey[] = ["overdue", "today", "week", "later", "undated"];

function dueKey(end: string | null, today: string): DueKey {
  if (end === null) {
    return "undated";
  }
  const days = diffDays(today, end);
  if (days < 0) {
    return "overdue";
  }
  if (days === 0) {
    return "today";
  }
  return days <= 7 ? "week" : "later";
}

export interface DueGroup {
  key: DueKey;
  items: Activity[];
}

export function groupByDue(items: Activity[], today: string): DueGroup[] {
  const sorted = items.toSorted((a, b) => {
    const byEnd = (a.end ?? "9999-12-31").localeCompare(b.end ?? "9999-12-31");
    return byEnd === 0 ? a.title.localeCompare(b.title, "pt-BR") : byEnd;
  });
  const groups: DueGroup[] = [];
  for (const key of DUE_ORDER) {
    const inGroup = sorted.filter((item) => dueKey(item.end, today) === key);
    if (inGroup.length > 0) {
      groups.push({ key, items: inGroup });
    }
  }
  return groups;
}
