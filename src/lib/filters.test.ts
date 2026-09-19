import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { DEFAULT_FILTERS, filterTasks, type Filters } from "./filters";

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
    subtasks: [],
    ...over,
  };
}

const today = "2026-09-19";
const f = (over: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...over });

const tasks = [
  task("relatório", {
    status: "doing",
    assignee_id: "u1",
    priority: "high",
    start_date: "2026-09-01",
    end_date: "2026-09-10",
  }),
  task("site", {
    status: "done",
    assignee_id: "u2",
    start_date: "2026-10-01",
    end_date: "2026-10-15",
  }),
  task("compras", { description: "Comprar cabos", status: "todo" }),
  task("infra", {
    subtasks: [
      {
        id: "s",
        task_id: "infra",
        title: "Migrar servidor",
        done: false,
        start_date: null,
        end_date: null,
        assignee_id: null,
        position: 0,
      },
    ],
  }),
];

const ids = (list: Task[]) => list.map((t) => t.id);

describe("filterTasks", () => {
  it("returns everything by default", () => {
    expect(ids(filterTasks(tasks, DEFAULT_FILTERS, today))).toEqual([
      "relatório",
      "site",
      "compras",
      "infra",
    ]);
  });

  it("searches title, description and subtask titles, ignoring case and accents", () => {
    expect(ids(filterTasks(tasks, f({ q: "RELATORIO" }), today))).toEqual(["relatório"]);
    expect(ids(filterTasks(tasks, f({ q: "cabos" }), today))).toEqual(["compras"]);
    expect(ids(filterTasks(tasks, f({ q: "servidor" }), today))).toEqual(["infra"]);
  });

  it("filters by status, including derived overdue", () => {
    expect(ids(filterTasks(tasks, f({ status: "done" }), today))).toEqual(["site"]);
    expect(ids(filterTasks(tasks, f({ status: "overdue" }), today))).toEqual(["relatório"]);
  });

  it("filters by assignee, priority and unassigned", () => {
    expect(ids(filterTasks(tasks, f({ assignee: "u2" }), today))).toEqual(["site"]);
    expect(ids(filterTasks(tasks, f({ assignee: "none" }), today))).toEqual(["compras", "infra"]);
    expect(ids(filterTasks(tasks, f({ priority: "high" }), today))).toEqual(["relatório"]);
  });

  it("filters by overlapping period and excludes undated tasks when a period is set", () => {
    expect(ids(filterTasks(tasks, f({ from: "2026-09-05", to: "2026-09-30" }), today))).toEqual([
      "relatório",
    ]);
    expect(ids(filterTasks(tasks, f({ from: "2026-10-10" }), today))).toEqual(["site"]);
    expect(ids(filterTasks(tasks, f({ to: "2026-09-02" }), today))).toEqual(["relatório"]);
  });

  it("hides done tasks on request", () => {
    expect(ids(filterTasks(tasks, f({ hideDone: true }), today))).toEqual([
      "relatório",
      "compras",
      "infra",
    ]);
  });
});
