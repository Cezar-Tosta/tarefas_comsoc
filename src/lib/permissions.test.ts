import { describe, expect, it } from "vitest";
import type { Profile, Subtask, Task } from "../types";
import {
  canAssign,
  canCreateTask,
  canDeleteTask,
  canEditTask,
  canManageSubtasks,
  canManageUsers,
  canToggleSubtask,
} from "./permissions";

const admin: Profile = { id: "a", email: "a@x", name: "A", role: "admin" };
const user: Profile = { id: "u", email: "u@x", name: "U", role: "user" };
const other: Profile = { id: "o", email: "o@x", name: "O", role: "user" };
const viewer: Profile = { id: "v", email: "v@x", name: "V", role: "viewer" };
const pending: Profile = { id: "p", email: "p@x", name: "P", role: "pending" };

const s = (assignee: string | null): Subtask => ({
  id: "s",
  task_id: "t",
  title: "s",
  done: false,
  start_date: null,
  end_date: null,
  assignee_id: assignee,
  position: 0,
});

const t = (assignee: string | null, subtasks: Subtask[] = []): Task => ({
  id: "t",
  title: "t",
  description: "",
  status: "todo",
  priority: "low",
  start_date: null,
  end_date: null,
  assignee_id: assignee,
  subtasks,
});

describe("permissions", () => {
  it("only admins create, delete, assign and manage users", () => {
    for (const p of [user, viewer, pending]) {
      expect(canCreateTask(p)).toBe(false);
      expect(canDeleteTask(p)).toBe(false);
      expect(canAssign(p)).toBe(false);
      expect(canManageUsers(p)).toBe(false);
    }
    expect(canCreateTask(admin)).toBe(true);
    expect(canDeleteTask(admin)).toBe(true);
    expect(canAssign(admin)).toBe(true);
    expect(canManageUsers(admin)).toBe(true);
  });

  it("users edit only tasks assigned to them", () => {
    expect(canEditTask(user, t("u"))).toBe(true);
    expect(canEditTask(user, t("o"))).toBe(false);
    expect(canEditTask(user, t(null))).toBe(false);
    expect(canEditTask(admin, t("o"))).toBe(true);
    expect(canEditTask(viewer, t("v"))).toBe(false);
  });

  it("subtask structure is managed by the task owner or admin", () => {
    expect(canManageSubtasks(user, t("u"))).toBe(true);
    expect(canManageSubtasks(other, t("u"))).toBe(false);
    expect(canManageSubtasks(admin, t("u"))).toBe(true);
    expect(canManageSubtasks(viewer, t("v"))).toBe(false);
  });

  it("a subtask can be toggled by its assignee even on someone else's task", () => {
    const task = t("o", [s("u")]);
    expect(canToggleSubtask(user, task, s("u"))).toBe(true);
    expect(canToggleSubtask(user, task, s("o"))).toBe(false);
    expect(canToggleSubtask(other, task, s("u"))).toBe(true);
    expect(canToggleSubtask(viewer, task, s("v"))).toBe(false);
    expect(canToggleSubtask(admin, task, s(null))).toBe(true);
  });
});
