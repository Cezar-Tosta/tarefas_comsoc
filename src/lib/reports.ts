import type { Profile, Status, Task } from "../types";
import { resolveSubtaskDates } from "./subtaskDates";
import { diffDays } from "./dates";
import { effectiveStatus, taskProgress } from "./progress";

export type DeadlineKind = "done" | "none" | "overdue" | "today" | "upcoming";

export interface Deadline {
  kind: DeadlineKind;
  /** Dias de atraso (overdue) ou dias que faltam (upcoming); 0 nos demais casos. */
  days: number;
}

export function deadlineInfo(end: string | null, done: boolean, today: string): Deadline {
  if (done) {
    return { kind: "done", days: 0 };
  }
  if (!end) {
    return { kind: "none", days: 0 };
  }
  const delta = diffDays(today, end);
  if (delta < 0) {
    return { kind: "overdue", days: -delta };
  }
  if (delta === 0) {
    return { kind: "today", days: 0 };
  }
  return { kind: "upcoming", days: delta };
}

function plural(n: number, singular: string, many: string): string {
  return `${n} ${n === 1 ? singular : many}`;
}

export function deadlineLabel(deadline: Deadline): string {
  switch (deadline.kind) {
    case "done":
      return "Concluída";
    case "none":
      return "Sem prazo";
    case "today":
      return "Vence hoje";
    case "overdue":
      return `Atrasada há ${plural(deadline.days, "dia", "dias")}`;
    case "upcoming":
      return `${deadline.days === 1 ? "Falta" : "Faltam"} ${plural(deadline.days, "dia", "dias")}`;
  }
}

/** Texto curto ao lado do título da tarefa: dias que faltam, dias de atraso ou "HOJE". */
export function deadlineCountdown(deadline: Deadline): string | null {
  switch (deadline.kind) {
    case "done":
    case "none":
      return null;
    case "today":
      return "HOJE";
    case "overdue":
      return `Atrasada há ${plural(deadline.days, "dia", "dias")}`;
    case "upcoming":
      return `${deadline.days === 1 ? "Falta" : "Faltam"} ${plural(deadline.days, "dia", "dias")}`;
  }
}

export interface NestedLine {
  line: ReportLine;
  /** Subtarefa exibida logo abaixo (e recuada em relação a) da tarefa dela. */
  nested: boolean;
}

/**
 * Coloca cada subtarefa logo abaixo da tarefa dela, quando ambas estão na lista.
 * Subtarefas cuja tarefa não está na lista ficam soltas, na posição original.
 */
export function nestLines(lines: ReportLine[]): NestedLine[] {
  const taskIds = new Set<string>();
  for (const line of lines) {
    if (line.kind === "task") {
      taskIds.add(line.id);
    }
  }
  const children = new Map<string, ReportLine[]>();
  for (const line of lines) {
    if (line.kind === "subtask" && taskIds.has(line.taskId)) {
      children.set(line.taskId, [...(children.get(line.taskId) ?? []), line]);
    }
  }
  const result: NestedLine[] = [];
  for (const line of lines) {
    if (line.kind === "subtask" && taskIds.has(line.taskId)) {
      continue;
    }
    result.push({ line, nested: false });
    for (const child of children.get(line.id) ?? []) {
      result.push({ line: child, nested: true });
    }
  }
  return result;
}

export const UNASSIGNED = "__unassigned__";

export interface ReportPerson {
  id: string;
  name: string;
}

export interface ReportLine {
  kind: "task" | "subtask";
  id: string;
  taskId: string;
  title: string;
  parentTitle: string | null;
  status: Status;
  progress: number;
  start: string | null;
  end: string | null;
  /** Subtarefa sem datas próprias: usa o período da tarefa. */
  inheritedDates: boolean;
  deadline: Deadline;
}

export interface TaskStats {
  total: number;
  todo: number;
  doing: number;
  blocked: number;
  done: number;
  late: number;
  progress: number;
}

export interface SubtaskStats {
  total: number;
  done: number;
  open: number;
  late: number;
  progress: number;
}

export interface PersonReport {
  person: ReportPerson;
  lines: ReportLine[];
  taskStats: TaskStats;
  subtaskStats: SubtaskStats;
  /** Maior atraso, em dias, entre os itens em aberto (0 se nenhum atrasado). */
  maxLateDays: number;
  /** Itens em aberto que vencem hoje ou nos próximos 7 dias. */
  dueSoon: number;
  nextDue: { title: string; days: number } | null;
}

const DUE_SOON_DAYS = 7;

function rank(deadline: Deadline): number {
  switch (deadline.kind) {
    case "overdue":
      return 0;
    case "today":
      return 1;
    case "upcoming":
      return 2;
    case "none":
      return 3;
    case "done":
      return 4;
  }
}

function compareLines(a: ReportLine, b: ReportLine): number {
  const byRank = rank(a.deadline) - rank(b.deadline);
  if (byRank !== 0) {
    return byRank;
  }
  if (a.deadline.kind === "overdue") {
    return b.deadline.days - a.deadline.days; // mais atrasada primeiro
  }
  if (a.deadline.kind === "upcoming") {
    return a.deadline.days - b.deadline.days; // vence antes primeiro
  }
  return a.title.localeCompare(b.title, "pt-BR");
}

/**
 * Relatório de uma pessoa (ou do bloco "sem responsável").
 * Tarefas: as atribuídas a ela. Subtarefas: as atribuídas a ela e as sem dono das tarefas dela.
 */
export function buildPersonReport(
  person: ReportPerson,
  tasks: Task[],
  today: string,
): PersonReport {
  const owner = person.id === UNASSIGNED ? null : person.id;
  const lines: ReportLine[] = [];
  const ownTasks: Task[] = [];
  let subtaskTotal = 0;
  let subtaskDone = 0;
  let subtaskLate = 0;

  for (const task of tasks) {
    if (task.assignee_id === owner) {
      ownTasks.push(task);
      const status = effectiveStatus(task);
      lines.push({
        kind: "task",
        id: task.id,
        taskId: task.id,
        title: task.title,
        parentTitle: null,
        status,
        progress: taskProgress(task),
        start: task.start_date,
        end: task.end_date,
        inheritedDates: false,
        deadline: deadlineInfo(task.end_date, status === "done", today),
      });
    }
    for (const subtask of task.subtasks) {
      if ((subtask.assignee_id ?? task.assignee_id) !== owner) {
        continue;
      }
      const dates = resolveSubtaskDates(subtask, task.subtasks);
      const own = dates.start !== null || dates.end !== null;
      const start = own ? (dates.start ?? dates.end) : task.start_date;
      const end = own ? (dates.end ?? dates.start) : task.end_date;
      const deadline = deadlineInfo(end, subtask.done, today);
      subtaskTotal++;
      if (subtask.done) {
        subtaskDone++;
      }
      if (deadline.kind === "overdue") {
        subtaskLate++;
      }
      lines.push({
        kind: "subtask",
        id: subtask.id,
        taskId: task.id,
        title: subtask.title,
        parentTitle: task.title,
        status: subtask.done ? "done" : "todo",
        progress: subtask.done ? 100 : 0,
        start,
        end,
        inheritedDates: !own,
        deadline,
      });
    }
  }

  const taskStats: TaskStats = {
    total: ownTasks.length,
    todo: 0,
    doing: 0,
    blocked: 0,
    done: 0,
    late: 0,
    progress: 0,
  };
  let progressSum = 0;
  for (const task of ownTasks) {
    taskStats[effectiveStatus(task)]++;
    progressSum += taskProgress(task);
  }
  taskStats.progress = ownTasks.length === 0 ? 0 : Math.round(progressSum / ownTasks.length);

  let maxLateDays = 0;
  let dueSoon = 0;
  let nextDue: PersonReport["nextDue"] = null;
  for (const line of lines) {
    const { kind, days } = line.deadline;
    if (kind === "overdue") {
      maxLateDays = Math.max(maxLateDays, days);
      if (line.kind === "task") {
        taskStats.late++;
      }
    }
    if (kind === "today" || kind === "upcoming") {
      if (days <= DUE_SOON_DAYS) {
        dueSoon++;
      }
      if (nextDue === null || days < nextDue.days) {
        nextDue = { title: line.title, days };
      }
    }
  }

  return {
    person,
    lines: lines.toSorted(compareLines),
    taskStats,
    subtaskStats: {
      total: subtaskTotal,
      done: subtaskDone,
      open: subtaskTotal - subtaskDone,
      late: subtaskLate,
      progress: subtaskTotal === 0 ? 0 : Math.round((subtaskDone / subtaskTotal) * 100),
    },
    maxLateDays,
    dueSoon,
    nextDue,
  };
}

function lateCount(report: PersonReport): number {
  return report.taskStats.late + report.subtaskStats.late;
}

/** Um relatório por administrador/usuário (mais atrasos primeiro) + "sem responsável" se houver. */
export function buildTeamReport(people: Profile[], tasks: Task[], today: string): PersonReport[] {
  const reports: PersonReport[] = [];
  for (const profile of people) {
    if (profile.role !== "admin" && profile.role !== "user") {
      continue;
    }
    reports.push(
      buildPersonReport({ id: profile.id, name: profile.name || profile.email }, tasks, today),
    );
  }
  reports.sort((a, b) => {
    const byLate = lateCount(b) - lateCount(a);
    return byLate === 0 ? a.person.name.localeCompare(b.person.name, "pt-BR") : byLate;
  });
  const unassigned = buildPersonReport({ id: UNASSIGNED, name: "Sem responsável" }, tasks, today);
  if (unassigned.lines.length > 0) {
    reports.push(unassigned);
  }
  return reports;
}
