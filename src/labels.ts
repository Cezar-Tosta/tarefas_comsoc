import type { Priority, Role, Status } from "./types";

export const STATUS_LABEL: Record<Status, string> = {
  todo: "A fazer",
  doing: "Em andamento",
  blocked: "Bloqueada",
  done: "Concluída",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  user: "Usuário",
  viewer: "Visualizador",
  pending: "Aguardando aprovação",
};

export const STATUSES: Status[] = ["todo", "doing", "blocked", "done"];
export const PRIORITIES: Priority[] = ["low", "medium", "high"];
export const ROLES: Role[] = ["admin", "user", "viewer", "pending"];
