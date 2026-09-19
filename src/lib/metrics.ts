import type { Profile, Task } from "../types";
import { involvesPerson } from "./filters";
import { effectiveStatus, isOverdue, overallProgress } from "./progress";

export interface Metrics {
  total: number;
  doing: number;
  done: number;
  late: number;
  overall: number;
}

/**
 * Quais tarefas entram nas métricas de quem está logado:
 * administrador = todas (visão geral); usuário = só as suas (tarefa ou subtarefa atribuída a ele);
 * visualizador e contas pendentes = nenhuma (o painel não é exibido).
 */
export function metricsScope(me: Profile, tasks: Task[]): Task[] | null {
  if (me.role === "admin") {
    return tasks;
  }
  if (me.role === "user") {
    return tasks.filter((task) => involvesPerson(task, me.id));
  }
  return null;
}

export function computeMetrics(tasks: Task[], today: string): Metrics {
  let doing = 0;
  let done = 0;
  let late = 0;
  for (const task of tasks) {
    const status = effectiveStatus(task);
    if (status === "doing") {
      doing++;
    }
    if (status === "done") {
      done++;
    }
    if (isOverdue(task, today)) {
      late++;
    }
  }
  return { total: tasks.length, doing, done, late, overall: overallProgress(tasks) };
}
