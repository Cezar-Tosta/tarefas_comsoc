import { describe, expect, it } from "vitest";
import type { Profile, Subtask, Task } from "../types";
import {
  canAssign,
  canComment,
  canCreateTask,
  canDeleteComment,
  canDeleteTask,
  canEditTask,
  canManageLinks,
  canManageSubtasks,
  canManageUsers,
  canSeeReports,
  canToggleSubtask,
  visibleTasks,
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
  links: [],
  comment_count: 0,
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

  it("admins and users comment; viewers and pending only read", () => {
    expect(canComment(admin)).toBe(true);
    expect(canComment(user)).toBe(true);
    expect(canComment(viewer)).toBe(false);
    expect(canComment(pending)).toBe(false);
  });

  it("a comment can be removed by its author or an admin", () => {
    expect(canDeleteComment(user, { author_id: "u" })).toBe(true);
    expect(canDeleteComment(user, { author_id: "o" })).toBe(false);
    expect(canDeleteComment(admin, { author_id: "o" })).toBe(true);
    expect(canDeleteComment(viewer, { author_id: "v" })).toBe(false);
    expect(canDeleteComment(user, { author_id: null })).toBe(false);
  });

  it("links are managed by whoever can edit the task", () => {
    expect(canManageLinks(user, t("u"))).toBe(true);
    expect(canManageLinks(user, t("o"))).toBe(false);
    expect(canManageLinks(admin, t("o"))).toBe(true);
    expect(canManageLinks(viewer, t("v"))).toBe(false);
  });

  it("a user sees only tasks linked to them (own task or own subtask); others see everything", () => {
    const mine = t("u");
    const viaSubtask = t("o", [s("u")]);
    const foreign = t("o", [s("o")]);
    const nobody = t(null);
    const all = [mine, viaSubtask, foreign, nobody];
    expect(visibleTasks(user, all)).toEqual([mine, viaSubtask]);
    expect(visibleTasks(admin, all)).toEqual(all);
    expect(visibleTasks(viewer, all)).toEqual(all);
    expect(visibleTasks(pending, all)).toEqual([]);
  });

  it("a brand new user with nothing assigned sees no tasks", () => {
    const fresh: Profile = { id: "new", email: "n@x", name: "N", role: "user" };
    expect(visibleTasks(fresh, [t("u"), t("o", [s("o")])])).toEqual([]);
  });

  it("reports are for admins (team) and users (own); not for viewers or pending", () => {
    expect(canSeeReports(admin)).toBe(true);
    expect(canSeeReports(user)).toBe(true);
    expect(canSeeReports(viewer)).toBe(false);
    expect(canSeeReports(pending)).toBe(false);
  });
});
