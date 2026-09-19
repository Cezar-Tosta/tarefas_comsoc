import { PRIORITY_LABEL, STATUS_LABEL } from "../labels";
import type { Profile, Task } from "../types";
import { formatBR } from "./dates";
import { effectiveStatus, taskProgress } from "./progress";

const HEADER = [
  "Tipo",
  "Título",
  "Tarefa",
  "Status",
  "Prioridade",
  "Responsável",
  "Início",
  "Fim",
  "Progresso (%)",
];

/** Escapa para CSV com ";" e neutraliza fórmulas de planilha (=, +, -, @). */
export function csvCell(value: string): string {
  let text = value;
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  if (/[";\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function tasksToCsv(tasks: Task[], profiles: Profile[]): string {
  const names = new Map<string, string>();
  for (const profile of profiles) {
    names.set(profile.id, profile.name || profile.email);
  }
  const rows: string[][] = [HEADER];
  for (const task of tasks) {
    rows.push([
      "Tarefa",
      task.title,
      "",
      STATUS_LABEL[effectiveStatus(task)],
      PRIORITY_LABEL[task.priority],
      (task.assignee_id && names.get(task.assignee_id)) || "",
      formatBR(task.start_date),
      formatBR(task.end_date),
      String(taskProgress(task)),
    ]);
    for (const subtask of task.subtasks) {
      rows.push([
        "Subtarefa",
        subtask.title,
        task.title,
        subtask.done ? STATUS_LABEL.done : STATUS_LABEL.todo,
        "",
        (subtask.assignee_id && names.get(subtask.assignee_id)) || "",
        formatBR(subtask.start_date),
        formatBR(subtask.end_date),
        subtask.done ? "100" : "0",
      ]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}
