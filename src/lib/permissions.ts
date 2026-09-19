import type { Profile, Subtask, Task } from "../types";
import { involvesPerson } from "./filters";

// Espelha as políticas RLS de supabase/schema.sql. A segurança real está no banco;
// estas funções só decidem o que mostrar na interface.

export function canCreateTask(me: Profile): boolean {
  return me.role === "admin";
}

export function canDeleteTask(me: Profile): boolean {
  return me.role === "admin";
}

export function canAssign(me: Profile): boolean {
  return me.role === "admin";
}

/** Aba Relatórios: administrador (visão da equipe) e usuário (visão própria). */
export function canSeeReports(me: Profile): boolean {
  return me.role === "admin" || me.role === "user";
}

export function canManageUsers(me: Profile): boolean {
  return me.role === "admin";
}

export function canEditTask(me: Profile, task: Task): boolean {
  if (me.role === "admin") {
    return true;
  }
  return me.role === "user" && task.assignee_id === me.id;
}

/** Criar, renomear e excluir subtarefas de uma tarefa. */
export function canManageSubtasks(me: Profile, task: Task): boolean {
  return canEditTask(me, task);
}

/** Comentários: administradores e usuários participam; visualizadores só leem. */
export function canComment(me: Profile): boolean {
  return me.role === "admin" || me.role === "user";
}

export function canDeleteComment(me: Profile, comment: { author_id: string | null }): boolean {
  if (me.role === "admin") {
    return true;
  }
  return me.role === "user" && comment.author_id === me.id;
}

/** Links da tarefa: quem pode editar a tarefa. */
export function canManageLinks(me: Profile, task: Task): boolean {
  return canEditTask(me, task);
}

/** Marcar/desmarcar (e editar) uma subtarefa: dono da tarefa ou responsável pela subtarefa. */
export function canToggleSubtask(me: Profile, task: Task, subtask: Subtask): boolean {
  if (canEditTask(me, task)) {
    return true;
  }
  return me.role === "user" && subtask.assignee_id === me.id;
}

/**
 * O que cada perfil enxerga nas abas Tarefas/Gantt: o usuário só vê o que está ligado a ele
 * (tarefa dele ou com subtarefa dele); administrador e visualizador veem tudo.
 * O banco aplica a mesma regra (supabase/003_user_visibility.sql); aqui é o reflexo na interface.
 */
export function visibleTasks(me: Profile, tasks: Task[]): Task[] {
  if (me.role === "admin" || me.role === "viewer") {
    return tasks;
  }
  if (me.role === "user") {
    return tasks.filter((task) => involvesPerson(task, me.id));
  }
  return [];
}
