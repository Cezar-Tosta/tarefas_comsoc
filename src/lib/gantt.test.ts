import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { barGeometry, buildGanttItems, buildScale, computeRange } from "./gantt";

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

describe("computeRange", () => {
  it("covers all items and today with padding (day zoom)", () => {
    const r = computeRange([{ start: "2026-09-10", end: "2026-09-20" }], "2026-09-15", "day", 2);
    expect(r).toEqual({ start: "2026-09-08", end: "2026-09-22", days: 15 });
  });

  it("includes today even when items are in the past", () => {
    const r = computeRange([{ start: "2026-01-10", end: "2026-01-12" }], "2026-09-15", "day", 0);
    expect(r.start).toBe("2026-01-10");
    expect(r.end).toBe("2026-09-15");
  });

  it("aligns to Monday..Sunday for week zoom and month edges for month zoom", () => {
    const week = computeRange(
      [{ start: "2026-09-16", end: "2026-09-17" }],
      "2026-09-16",
      "week",
      0,
    );
    expect(week.start).toBe("2026-09-14");
    expect(week.end).toBe("2026-09-20");
    const month = computeRange(
      [{ start: "2026-09-16", end: "2026-10-17" }],
      "2026-09-16",
      "month",
      0,
    );
    expect(month.start).toBe("2026-09-01");
    expect(month.end).toBe("2026-10-31");
  });

  it("falls back to a window around today when there are no items", () => {
    const r = computeRange([], "2026-09-15", "day", 0);
    expect(r.start < "2026-09-15" && r.end > "2026-09-15").toBe(true);
  });
});

describe("barGeometry", () => {
  it("is inclusive of both start and end days", () => {
    const range = { start: "2026-09-01", end: "2026-09-30", days: 30 };
    expect(barGeometry(range, { start: "2026-09-03", end: "2026-09-05" }, 10)).toEqual({
      left: 20,
      width: 30,
    });
    expect(barGeometry(range, { start: "2026-09-01", end: "2026-09-01" }, 10)).toEqual({
      left: 0,
      width: 10,
    });
  });
});

describe("buildScale", () => {
  it("splits days by month for the day zoom", () => {
    const range = { start: "2026-09-29", end: "2026-10-02", days: 4 };
    const scale = buildScale(range, "day", 10);
    expect(scale.top).toEqual([
      { label: "set/2026", left: 0, width: 20 },
      { label: "out/2026", left: 20, width: 20 },
    ]);
    expect(scale.bottom.map((c) => c.label)).toEqual(["29", "30", "1", "2"]);
    expect(scale.bottom.every((c) => c.width === 10)).toBe(true);
  });

  it("groups by ISO week for the week zoom", () => {
    const range = { start: "2026-09-14", end: "2026-09-27", days: 14 };
    const scale = buildScale(range, "week", 4);
    expect(scale.bottom).toEqual([
      { label: "14", left: 0, width: 28 },
      { label: "21", left: 28, width: 28 },
    ]);
  });

  it("uses year over month for the month zoom", () => {
    const range = { start: "2026-11-01", end: "2027-01-31", days: 92 };
    const scale = buildScale(range, "month", 2);
    expect(scale.top.map((c) => c.label)).toEqual(["2026", "2027"]);
    expect(scale.bottom.map((c) => c.label)).toEqual(["nov", "dez", "jan"]);
  });
});

describe("buildGanttItems", () => {
  const today = "2026-09-19";

  it("emits dated tasks with progress and flags undated ones", () => {
    const tasks = [
      task("a", { start_date: "2026-09-01", end_date: "2026-09-10", status: "doing" }),
      task("b"),
    ];
    const { items, undated } = buildGanttItems(tasks, false, today);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "a",
      kind: "task",
      start: "2026-09-01",
      end: "2026-09-10",
      overdue: true,
    });
    expect(undated.map((t) => t.id)).toEqual(["b"]);
  });

  it("uses the single available date for both ends", () => {
    const { items } = buildGanttItems([task("a", { end_date: "2026-09-25" })], false, today);
    expect(items[0]).toMatchObject({ start: "2026-09-25", end: "2026-09-25" });
  });

  it("nests subtasks under their task when requested; undated ones inherit the task period", () => {
    const t = task("a", {
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      links: [],
      comment_count: 0,
      subtasks: [
        {
          id: "s1",
          task_id: "a",
          title: "s1",
          done: true,
          start_date: "2026-09-02",
          end_date: "2026-09-04",
          assignee_id: null,
          position: 0,
        },
        {
          id: "s2",
          task_id: "a",
          title: "s2",
          done: false,
          start_date: null,
          end_date: null,
          assignee_id: null,
          position: 1,
        },
      ],
    });
    expect(buildGanttItems([t], false, today).items.map((i) => i.id)).toEqual(["a"]);
    const nested = buildGanttItems([t], true, today).items;
    expect(nested.map((i) => i.id)).toEqual(["a", "s1", "s2"]);
    expect(nested[1]).toMatchObject({
      kind: "subtask",
      parentId: "a",
      progress: 100,
      done: true,
      inherited: false,
    });
    expect(nested[2]).toMatchObject({
      start: "2026-09-01",
      end: "2026-09-30",
      progress: 0,
      inherited: true,
    });
  });

  it("omits done subtasks when hiding done items", () => {
    const t = task("a", {
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      subtasks: [
        {
          id: "s1",
          task_id: "a",
          title: "feita",
          done: true,
          start_date: "2026-09-02",
          end_date: "2026-09-04",
          assignee_id: null,
          position: 0,
        },
        {
          id: "s2",
          task_id: "a",
          title: "aberta",
          done: false,
          start_date: "2026-09-05",
          end_date: "2026-09-08",
          assignee_id: null,
          position: 1,
        },
      ],
    });
    expect(buildGanttItems([t], true, today, true).items.map((i) => i.id)).toEqual(["a", "s2"]);
    expect(buildGanttItems([t], true, today).items.map((i) => i.id)).toEqual(["a", "s1", "s2"]);
  });
});
