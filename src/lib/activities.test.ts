import { describe, expect, it } from "vitest";
import type { Subtask, Task } from "../types";
import { buildActivities, groupByDue, isMine } from "./activities";

const today = "2026-11-10";

function sub(id: string, over: Partial<Subtask> = {}): Subtask {
  return {
    id,
    task_id: "t1",
    title: id,
    done: false,
    start_date: null,
    end_date: null,
    assignee_id: null,
    position: 0,
    ...over,
  };
}

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: "",
    status: "doing",
    priority: "medium",
    start_date: "2026-11-01",
    end_date: "2026-11-30",
    assignee_id: "u1",
    subtasks: [],
    links: [],
    comment_count: 0,
    ...over,
  };
}

describe("buildActivities", () => {
  it("turns open subtasks into activities and skips done ones", () => {
    const t = task("t1", {
      subtasks: [sub("a", { end_date: "2026-11-12" }), sub("b", { done: true })],
    });
    const items = buildActivities([t]);
    expect(items.map((i) => i.id)).toEqual(["a"]);
    expect(items[0]?.kind).toBe("subtask");
    expect(items[0]?.end).toBe("2026-11-12");
  });

  it("uses the task deadline for subtasks without their own date", () => {
    const items = buildActivities([task("t1", { subtasks: [sub("a")] })]);
    expect(items[0]?.end).toBe("2026-11-30");
    expect(items[0]?.inheritedDate).toBe(true);
  });

  it("treats a task without subtasks as a single activity, unless it is done", () => {
    expect(buildActivities([task("solo")]).map((i) => [i.kind, i.id])).toEqual([["task", "solo"]]);
    expect(buildActivities([task("solo", { status: "done" })])).toEqual([]);
  });
});

describe("isMine", () => {
  it("counts own subtasks and unassigned subtasks of own tasks", () => {
    const t = task("t1", {
      assignee_id: "u1",
      subtasks: [
        sub("mine", { assignee_id: "u1" }),
        sub("free"),
        sub("other", { assignee_id: "u2" }),
      ],
    });
    const items = buildActivities([t]);
    expect(items.filter((i) => isMine(i, "u1")).map((i) => i.id)).toEqual(["mine", "free"]);
    expect(items.filter((i) => isMine(i, "u2")).map((i) => i.id)).toEqual(["other"]);
  });
});

describe("groupByDue", () => {
  it("buckets by deadline in a fixed order, soonest first, empty buckets omitted", () => {
    const t = task("t1", {
      end_date: null,
      subtasks: [
        sub("late", { end_date: "2026-11-01" }),
        sub("today", { end_date: today }),
        sub("week2", { end_date: "2026-11-17" }),
        sub("week1", { end_date: "2026-11-11" }),
        sub("later", { end_date: "2026-12-20" }),
        sub("none"),
      ],
    });
    const groups = groupByDue(buildActivities([t]), today);
    expect(groups.map((g) => g.key)).toEqual(["overdue", "today", "week", "later", "undated"]);
    expect(groups.find((g) => g.key === "week")?.items.map((i) => i.id)).toEqual([
      "week1",
      "week2",
    ]);
  });
});
