export type Role = "admin" | "user" | "viewer" | "pending";
export type Status = "todo" | "doing" | "blocked" | "done";
export type Priority = "low" | "medium" | "high";

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  start_date: string | null;
  end_date: string | null;
  assignee_id: string | null;
  position: number;
  /** Subtarefa (da mesma tarefa) após cujo término esta começa; ausente sem a migração 005. */
  start_after_id?: string | null;
}

export interface TaskLink {
  id: string;
  task_id: string;
  title: string;
  url: string;
  created_at: string;
}

export interface Comment {
  id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface Expense {
  id: string;
  task_id: string;
  description: string;
  amount: number;
  /** Data do gasto (AAAA-MM-DD). */
  spent_on: string;
  created_at: string;
}

/** Tipos de registro do diário de bordo; "system" é gerado pelo banco (gatilhos). */
export type JournalKind =
  | "note"
  | "progress"
  | "decision"
  | "risk"
  | "issue"
  | "milestone"
  | "system";

export interface JournalEntry {
  id: string;
  task_id: string;
  author_id: string | null;
  kind: JournalKind;
  body: string;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  start_date: string | null;
  end_date: string | null;
  assignee_id: string | null;
  subtasks: Subtask[];
  links: TaskLink[];
  comment_count: number;
  /** Quando foi concluída (calculado pelo banco; ausente sem a migração 007). */
  completed_at?: string | null;
  // ---- gestão de projeto (migração 008; ausentes sem ela) ----
  /** Escopo: objetivo, entregáveis e o que fica de fora. */
  scope?: string;
  /** Critérios de aceite: como saber que o projeto terminou bem. */
  success_criteria?: string;
  /** Orçamento previsto (R$). */
  budget?: number | null;
  /** Linha de base: datas originalmente planejadas (o banco grava na primeira definição). */
  baseline_start?: string | null;
  baseline_end?: string | null;
  expenses?: Expense[];
}

export type TaskInput = Omit<
  Task,
  "id" | "subtasks" | "links" | "comment_count" | "completed_at" | "expenses"
>;
export type SubtaskInput = Omit<Subtask, "id" | "position">;
