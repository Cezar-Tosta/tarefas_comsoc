import { describe, expect, it } from "vitest";
import type { Subtask, Task } from "../types";
import {
  effectiveStatus,
  isOverdue,
  overallProgress,
  splitSubtasks,
  taskProgress,
} from "./progress";

function sub(id: string, done: boolean): Subtask {
  return {
    id,
    task_id: "t",
    title: id,
    done,
    start_date: null,
    end_date: null,
    assignee_id: null,
    position: 0,
  };
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t",
    title: "T",
    description: "",
    status: "todo",
    priority: "medium",
    start_date: null,
    end_date: null,
    assignee_id: null,
    links: [],
    comment_count: 0,
    subtasks: [],
    ...over,
  };
}

describe("taskProgress", () => {
  it("is the rounded percentage of done subtasks", () => {
    const t = task({ subtasks: [sub("a", true), sub("b", false), sub("c", false)] });
    expect(taskProgress(t)).toBe(33);
    expect(taskProgress(task({ subtasks: [sub("a", true), sub("b", true)] }))).toBe(100);
  });

  it("falls back to status when there are no subtasks", () => {
    expect(taskProgress(task({ status: "done" }))).toBe(100);
    expect(taskProgress(task({ status: "doing" }))).toBe(0);
  });
});

describe("splitSubtasks", () => {
  it("separates open from done keeping order", () => {
    const { open, done } = splitSubtasks([sub("a", true), sub("b", false), sub("c", true)]);
    expect(open.map((s) => s.id)).toEqual(["b"]);
    expect(done.map((s) => s.id)).toEqual(["a", "c"]);
  });
});

describe("effectiveStatus", () => {
  it("is done when every subtask is done", () => {
    expect(effectiveStatus(task({ subtasks: [sub("a", true)] }))).toBe("done");
  });

  it("is doing when some subtasks are done but the stored status is todo/done", () => {
    const subs = [sub("a", true), sub("b", false)];
    expect(effectiveStatus(task({ status: "todo", subtasks: subs }))).toBe("doing");
    expect(effectiveStatus(task({ status: "done", subtasks: subs }))).toBe("doing");
  });

  it("keeps blocked and stored status otherwise", () => {
    const subs = [sub("a", true), sub("b", false)];
    expect(effectiveStatus(task({ status: "blocked", subtasks: subs }))).toBe("blocked");
    expect(effectiveStatus(task({ status: "todo", subtasks: [sub("a", false)] }))).toBe("todo");
    expect(effectiveStatus(task({ status: "done" }))).toBe("done");
  });
});

describe("isOverdue", () => {
  it("flags unfinished tasks past their end date", () => {
    expect(isOverdue(task({ end_date: "2026-09-01" }), "2026-09-19")).toBe(true);
  });

  it("does not flag done tasks, future or undated tasks", () => {
    expect(isOverdue(task({ end_date: "2026-09-01", status: "done" }), "2026-09-19")).toBe(false);
    expect(isOverdue(task({ end_date: "2026-09-19" }), "2026-09-19")).toBe(false);
    expect(isOverdue(task(), "2026-09-19")).toBe(false);
  });
});

describe("overallProgress", () => {
  it("averages task progress and is 0 for empty input", () => {
    const tasks = [task({ status: "done" }), task({ subtasks: [sub("a", true), sub("b", false)] })];
    expect(overallProgress(tasks)).toBe(75);
    expect(overallProgress([])).toBe(0);
  });
});
