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
}

export type TaskInput = Omit<Task, "id" | "subtasks" | "links" | "comment_count">;
export type SubtaskInput = Omit<Subtask, "id" | "position">;
