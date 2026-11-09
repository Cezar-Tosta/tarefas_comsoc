// Mecanismos de controle de projeto: prazo, custo (valor agregado) e saúde.
// Tudo é calculado no cliente a partir da tarefa (datas, etapas, orçamento e despesas).

import type { Task } from "../types";
import { diffDays } from "./dates";
import { effectiveStatus, isOverdue, taskProgress } from "./progress";

export type Health = "ok" | "attention" | "critical" | "done";

export const HEALTH_LABEL: Record<Health, string> = {
  ok: "No rumo",
  attention: "Atenção",
  critical: "Crítico",
  done: "Concluído",
};

export const HEALTHS: Health[] = ["critical", "attention", "ok", "done"];

/** Abaixo disso o ritmo não é avaliado: no começo o índice oscila demais. */
const MIN_ELAPSED_TO_JUDGE = 20;
const SPI_CRITICAL = 0.7;
const SPI_ATTENTION = 0.9;
const CPI_ATTENTION = 0.9;
const BUDGET_ATTENTION = 90;

export interface Control {
  /** Avanço físico (%): pelas etapas concluídas. */
  progress: number;
  /** Quanto do prazo já passou (%); null sem início e fim. */
  elapsed: number | null;
  /** Índice de desempenho de prazo: avanço ÷ prazo decorrido (1 = no planejado). */
  spi: number | null;
  budget: number | null;
  spent: number;
  balance: number | null;
  /** Orçamento consumido (%). */
  budgetUsed: number | null;
  /** Valor agregado: quanto do orçamento corresponde ao que já foi entregue. */
  earned: number | null;
  /** Índice de desempenho de custo: valor agregado ÷ custo real (1 = no planejado). */
  cpi: number | null;
  /** Dias de adiamento do prazo final em relação à linha de base (negativo = adiantado). */
  slipDays: number | null;
  health: Health;
  /** Por que a saúde não está "no rumo". */
  reasons: string[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Percentual do período [start, end] (dias inclusivos) decorrido até `today`. */
export function elapsedPercent(
  start: string | null,
  end: string | null,
  today: string,
): number | null {
  if (!start || !end) {
    return null;
  }
  const duration = diffDays(start, end) + 1;
  if (duration <= 0) {
    return null;
  }
  const passed = Math.min(Math.max(diffDays(start, today), 0), duration);
  return Math.round((passed / duration) * 100);
}

export function spentOf(task: Task): number {
  let total = 0;
  for (const expense of task.expenses ?? []) {
    total += Number(expense.amount) || 0;
  }
  return round2(total);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function computeControl(task: Task, today: string): Control {
  const progress = taskProgress(task);
  const elapsed = elapsedPercent(task.start_date, task.end_date, today);
  // Sem etapas o avanço físico é 0 ou 100: o índice de prazo não diria nada.
  const measurable = task.subtasks.length > 0;
  const spi = measurable && elapsed !== null && elapsed > 0 ? round2(progress / elapsed) : null;
  const budget = task.budget === null || task.budget === undefined ? null : Number(task.budget);
  const spent = spentOf(task);
  const hasBudget = budget !== null && budget > 0;
  const budgetUsed = hasBudget ? Math.round((spent / budget) * 100) : null;
  const earned = budget === null ? null : round2((budget * progress) / 100);
  const cpi =
    measurable && hasBudget && earned !== null && spent > 0 ? round2(earned / spent) : null;
  const balance = budget === null ? null : round2(budget - spent);
  const slipDays =
    task.baseline_end && task.end_date ? diffDays(task.baseline_end, task.end_date) : null;

  const base = {
    progress,
    elapsed,
    spi,
    budget,
    spent,
    balance,
    budgetUsed,
    earned,
    cpi,
    slipDays,
  };
  if (effectiveStatus(task) === "done") {
    return { ...base, health: "done", reasons: [] };
  }

  const critical: string[] = [];
  const attention: string[] = [];
  if (isOverdue(task, today) && task.end_date) {
    critical.push(
      `Prazo final vencido há ${plural(diffDays(task.end_date, today), "dia", "dias")}`,
    );
  }
  if (budgetUsed !== null && budgetUsed > 100) {
    critical.push(`Orçamento estourado (${budgetUsed}% consumido)`);
  } else if (budgetUsed !== null && budgetUsed >= BUDGET_ATTENTION) {
    attention.push(`Orçamento quase esgotado (${budgetUsed}% consumido)`);
  }
  if (spi !== null && elapsed !== null && elapsed >= MIN_ELAPSED_TO_JUDGE) {
    if (spi < SPI_CRITICAL) {
      critical.push(`Avanço muito abaixo do previsto (${progress}% feito, ${elapsed}% do prazo)`);
    } else if (spi < SPI_ATTENTION) {
      attention.push(`Avanço abaixo do previsto (${progress}% feito, ${elapsed}% do prazo)`);
    }
  }
  if (cpi !== null && cpi < CPI_ATTENTION) {
    attention.push("Custo acima do valor já entregue");
  }
  if (effectiveStatus(task) === "blocked") {
    attention.push("Projeto bloqueado");
  }
  if (slipDays !== null && slipDays > 0) {
    attention.push(`Prazo adiado ${plural(slipDays, "dia", "dias")} em relação à linha de base`);
  }

  let health: Health = "ok";
  if (critical.length > 0) {
    health = "critical";
  } else if (attention.length > 0) {
    health = "attention";
  }
  return { ...base, health, reasons: [...critical, ...attention] };
}

export interface PortfolioSummary {
  total: number;
  health: Record<Health, number>;
  budget: number;
  spent: number;
}

export function portfolioSummary(tasks: Task[], today: string): PortfolioSummary {
  const health: Record<Health, number> = { ok: 0, attention: 0, critical: 0, done: 0 };
  let budget = 0;
  let spent = 0;
  for (const task of tasks) {
    const control = computeControl(task, today);
    health[control.health]++;
    budget += control.budget ?? 0;
    spent += control.spent;
  }
  return { total: tasks.length, health, budget: round2(budget), spent: round2(spent) };
}

export type SortKey = "deadline" | "health" | "progress" | "title";

export const SORT_LABEL: Record<SortKey, string> = {
  deadline: "Prazo",
  health: "Saúde",
  progress: "Progresso",
  title: "Nome",
};

export const SORT_KEYS: SortKey[] = ["deadline", "health", "progress", "title"];

const byTitle = (a: Task, b: Task): number => a.title.localeCompare(b.title, "pt-BR");

export function sortTasks(tasks: Task[], key: SortKey, today: string): Task[] {
  const controls = new Map(tasks.map((t) => [t.id, computeControl(t, today)]));
  const rank = (t: Task): number => HEALTHS.indexOf(controls.get(t.id)?.health ?? "ok");
  const progress = (t: Task): number => controls.get(t.id)?.progress ?? 0;
  return tasks.toSorted((a, b) => {
    let diff = 0;
    if (key === "deadline") {
      diff = (a.end_date ?? "9999-12-31").localeCompare(b.end_date ?? "9999-12-31");
    } else if (key === "health") {
      diff = rank(a) - rank(b);
    } else if (key === "progress") {
      diff = progress(b) - progress(a);
    }
    return diff === 0 ? byTitle(a, b) : diff;
  });
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(value: number): string {
  return BRL.format(value);
}
