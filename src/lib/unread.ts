import type { Profile, Task } from "../types";
import { involvesPerson } from "./filters";

/**
 * Controle local (por navegador) de comentários lidos.
 * seen: quantos comentários de cada tarefa o usuário já viu; mine: tarefas em que ele comentou.
 */
export interface ReadState {
  seen: Record<string, number>;
  mine: string[];
}

export function emptyReadState(): ReadState {
  return { seen: {}, mine: [] };
}

/**
 * Ajusta o controle ao que veio do banco: tarefa vista pela primeira vez vira a linha de base
 * (comentários antigos não contam como novos) e comentários apagados não deixam o contador "à frente".
 * Devolve true se algo mudou (para salvar).
 */
export function reconcile(read: ReadState, tasks: Task[]): boolean {
  let changed = false;
  for (const task of tasks) {
    const seen = read.seen[task.id];
    if (seen === undefined || seen > task.comment_count) {
      read.seen[task.id] = task.comment_count;
      changed = true;
    }
  }
  return changed;
}

export function unreadCount(read: ReadState, task: Task): number {
  const seen = read.seen[task.id];
  return seen === undefined ? 0 : Math.max(0, task.comment_count - seen);
}

/** Participa da conversa: responsável pela tarefa, responsável por subtarefa ou já comentou nela. */
export function participates(me: Profile, read: ReadState, task: Task): boolean {
  if (me.role !== "admin" && me.role !== "user") {
    return false;
  }
  return involvesPerson(task, me.id) || read.mine.includes(task.id);
}

export interface UnreadItem {
  task: Task;
  count: number;
}

/** Tarefas com comentários novos nas quais a pessoa participa. */
export function unreadTasks(me: Profile, read: ReadState, tasks: Task[]): UnreadItem[] {
  const items: UnreadItem[] = [];
  for (const task of tasks) {
    const count = unreadCount(read, task);
    if (count > 0 && participates(me, read, task)) {
      items.push({ task, count });
    }
  }
  return items;
}

export function markSeen(read: ReadState, taskId: string, count: number): void {
  read.seen[taskId] = count;
}

export function markMine(read: ReadState, taskId: string): void {
  if (!read.mine.includes(taskId)) {
    read.mine.push(taskId);
  }
}
