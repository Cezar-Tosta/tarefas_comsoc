import { describe, expect, it } from "vitest";
import type { Subtask, Task } from "../types";
import { isArchived, splitArchived } from "./archive";

const base: Task = {
  id: "t",
  title: "t",
  description: "",
  status: "done",
  priority: "low",
  start_date: null,
  end_date: null,
  assignee_id: null,
  links: [],
  comment_count: 0,
  subtasks: [],
};

const doneAt = (day: string, patch: Partial<Task> = {}): Task => ({
  ...base,
  completed_at: `${day}T15:00:00`,
  ...patch,
});

const sub: Subtask = {
  id: "s",
  task_id: "t",
  title: "s",
  done: false,
  start_date: null,
  end_date: null,
  assignee_id: null,
  position: 0,
};

describe("isArchived", () => {
  it("archives a task finished 10 or more days ago", () => {
    expect(isArchived(doneAt("2026-09-09"), "2026-09-19")).toBe(true);
    expect(isArchived(doneAt("2026-08-01"), "2026-09-19")).toBe(true);
  });

  it("keeps recent completions in the active list", () => {
    expect(isArchived(doneAt("2026-09-10"), "2026-09-19")).toBe(false);
    expect(isArchived(doneAt("2026-09-19"), "2026-09-19")).toBe(false);
  });

  it("never archives tasks that are not done, or without a completion date", () => {
    expect(isArchived(doneAt("2026-08-01", { status: "doing" }), "2026-09-19")).toBe(false);
    expect(isArchived(base, "2026-09-19")).toBe(false);
    expect(isArchived({ ...base, completed_at: null }, "2026-09-19")).toBe(false);
  });

  it("follows the subtasks: an open subtask reopens a done task", () => {
    expect(isArchived(doneAt("2026-08-01", { subtasks: [sub] }), "2026-09-19")).toBe(false);
    const finished = doneAt("2026-08-01", { subtasks: [{ ...sub, done: true }] });
    expect(isArchived(finished, "2026-09-19")).toBe(true);
  });
});

describe("splitArchived", () => {
  it("separates active and archived, keeping the order", () => {
    const a = doneAt("2026-09-01", { id: "a" });
    const b: Task = { ...base, id: "b", status: "todo" };
    const c = doneAt("2026-09-18", { id: "c" });
    const out = splitArchived([a, b, c], "2026-09-19");
    expect(out.archived.map((t) => t.id)).toEqual(["a"]);
    expect(out.active.map((t) => t.id)).toEqual(["b", "c"]);
  });
});
