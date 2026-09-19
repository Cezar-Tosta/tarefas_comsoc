import type { Profile, Subtask, Task } from "../types";

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

/** Marcar/desmarcar (e editar) uma subtarefa: dono da tarefa ou responsável pela subtarefa. */
export function canToggleSubtask(me: Profile, task: Task, subtask: Subtask): boolean {
  if (canEditTask(me, task)) {
    return true;
  }
  return me.role === "user" && subtask.assignee_id === me.id;
}
