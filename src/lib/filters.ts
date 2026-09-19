import type { Priority, Status, Task } from "../types";
import { effectiveStatus, isOverdue } from "./progress";

export interface Filters {
  q: string;
  status: Status | "overdue" | "all";
  assignee: string; // id, "none" (sem responsável) ou "all"
  priority: Priority | "all";
  from: string; // "" = sem limite
  to: string;
  hideDone: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  q: "",
  status: "all",
  assignee: "all",
  priority: "all",
  from: "",
  to: "",
  hideDone: false,
};

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function matchesText(task: Task, needle: string): boolean {
  if (!needle) {
    return true;
  }
  const haystacks = [task.title, task.description];
  for (const subtask of task.subtasks) {
    haystacks.push(subtask.title);
  }
  for (const text of haystacks) {
    if (normalize(text).includes(needle)) {
      return true;
    }
  }
  return false;
}

/** A pessoa está envolvida se é responsável pela tarefa ou por qualquer subtarefa dela. */
export function involvesPerson(task: Task, personId: string): boolean {
  if (task.assignee_id === personId) {
    return true;
  }
  return task.subtasks.some((subtask) => subtask.assignee_id === personId);
}

function hasNoAssignee(task: Task): boolean {
  return (
    task.assignee_id === null && task.subtasks.every((subtask) => subtask.assignee_id === null)
  );
}

function matchesPeriod(task: Task, from: string, to: string): boolean {
  if (!from && !to) {
    return true;
  }
  const start = task.start_date ?? task.end_date;
  const end = task.end_date ?? task.start_date;
  if (!start || !end) {
    return false;
  }
  if (from && end < from) {
    return false;
  }
  if (to && start > to) {
    return false;
  }
  return true;
}

export function filterTasks(tasks: Task[], filters: Filters, today: string): Task[] {
  const needle = normalize(filters.q.trim());
  const result: Task[] = [];
  for (const task of tasks) {
    const status = effectiveStatus(task);
    if (filters.hideDone && status === "done") {
      continue;
    }
    if (filters.status === "overdue") {
      if (!isOverdue(task, today)) {
        continue;
      }
    } else if (filters.status !== "all" && status !== filters.status) {
      continue;
    }
    if (filters.priority !== "all" && task.priority !== filters.priority) {
      continue;
    }
    if (filters.assignee === "none") {
      if (!hasNoAssignee(task)) {
        continue;
      }
    } else if (filters.assignee !== "all" && !involvesPerson(task, filters.assignee)) {
      continue;
    }
    if (!matchesPeriod(task, filters.from, filters.to)) {
      continue;
    }
    if (!matchesText(task, needle)) {
      continue;
    }
    result.push(task);
  }
  return result;
}
