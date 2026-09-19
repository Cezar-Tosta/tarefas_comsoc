import type { Status, Subtask, Task } from "../types";

export function splitSubtasks(subtasks: Subtask[]): { open: Subtask[]; done: Subtask[] } {
  const open: Subtask[] = [];
  const done: Subtask[] = [];
  for (const subtask of subtasks) {
    if (subtask.done) {
      done.push(subtask);
    } else {
      open.push(subtask);
    }
  }
  return { open, done };
}

/** Percentual concluído: por subtarefas quando existem; senão, 100% só se a tarefa estiver concluída. */
export function taskProgress(task: Task): number {
  if (task.subtasks.length === 0) {
    return task.status === "done" ? 100 : 0;
  }
  const { done } = splitSubtasks(task.subtasks);
  return Math.round((done.length / task.subtasks.length) * 100);
}

/** Status exibido: as subtarefas prevalecem sobre o status manual quando o contradizem. */
export function effectiveStatus(task: Task): Status {
  const total = task.subtasks.length;
  if (total === 0) {
    return task.status;
  }
  const doneCount = splitSubtasks(task.subtasks).done.length;
  if (doneCount === total) {
    return "done";
  }
  if (task.status === "done") {
    return "doing";
  }
  if (task.status === "todo" && doneCount > 0) {
    return "doing";
  }
  return task.status;
}

export function isOverdue(task: Task, today: string): boolean {
  if (!task.end_date || effectiveStatus(task) === "done") {
    return false;
  }
  return task.end_date < today;
}

export function overallProgress(tasks: Task[]): number {
  if (tasks.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const task of tasks) {
    sum += taskProgress(task);
  }
  return Math.round(sum / tasks.length);
}
