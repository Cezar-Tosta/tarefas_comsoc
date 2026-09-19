import { describe, expect, it } from "vitest";
import type { Profile, Subtask, Task } from "../types";
import { computeMetrics, metricsScope } from "./metrics";

const admin: Profile = { id: "a", email: "a@x", name: "A", role: "admin" };
const ana: Profile = { id: "u1", email: "u1@x", name: "Ana", role: "user" };
const viewer: Profile = { id: "v", email: "v@x", name: "V", role: "viewer" };
const pending: Profile = { id: "p", email: "p@x", name: "P", role: "pending" };

function sub(id: string, taskId: string, done: boolean, who: string | null): Subtask {
  return {
    id,
    task_id: taskId,
    title: id,
    done,
    start_date: null,
    end_date: null,
    assignee_id: who,
    position: 0,
  };
}

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
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

const today = "2026-09-19";

const tasks = [
  task("da-ana", { assignee_id: "u1", status: "doing", end_date: "2026-09-01" }),
  task("do-bia", { assignee_id: "u2", status: "done" }),
  task("so-subtarefa", {
    assignee_id: "u2",
    subtasks: [sub("s1", "so-subtarefa", true, "u1"), sub("s2", "so-subtarefa", false, "u2")],
  }),
  task("ninguem"),
];

describe("metricsScope", () => {
  it("gives admins every task", () => {
    expect(metricsScope(admin, tasks)?.map((t) => t.id)).toEqual([
      "da-ana",
      "do-bia",
      "so-subtarefa",
      "ninguem",
    ]);
  });

  it("gives users only the tasks they are involved in (task or subtask)", () => {
    expect(metricsScope(ana, tasks)?.map((t) => t.id)).toEqual(["da-ana", "so-subtarefa"]);
  });

  it("gives viewers and pending accounts no metrics", () => {
    expect(metricsScope(viewer, tasks)).toBeNull();
    expect(metricsScope(pending, tasks)).toBeNull();
  });
});

describe("computeMetrics", () => {
  it("counts total, in progress, done, overdue and overall progress", () => {
    const m = computeMetrics(tasks, today);
    expect(m).toEqual({ total: 4, doing: 2, done: 1, late: 1, overall: 38 });
  });

  it("is all zeros for an empty scope", () => {
    expect(computeMetrics([], today)).toEqual({ total: 0, doing: 0, done: 0, late: 0, overall: 0 });
  });

  it("differs per person: Ana's scope excludes the others' tasks", () => {
    const scope = metricsScope(ana, tasks) ?? [];
    expect(computeMetrics(scope, today)).toEqual({
      total: 2,
      doing: 2,
      done: 0,
      late: 1,
      overall: 25,
    });
  });
});
