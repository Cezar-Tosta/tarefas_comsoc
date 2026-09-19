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
}

export type TaskInput = Omit<Task, "id" | "subtasks">;
export type SubtaskInput = Omit<Subtask, "id" | "position">;
