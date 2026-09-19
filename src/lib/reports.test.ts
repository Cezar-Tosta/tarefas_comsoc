import { describe, expect, it } from "vitest";
import type { Profile, Subtask, Task } from "../types";
import {
  buildPersonReport,
  buildTeamReport,
  deadlineInfo,
  deadlineLabel,
  UNASSIGNED,
} from "./reports";

const today = "2026-09-19";

describe("deadlineInfo / deadlineLabel", () => {
  it("counts days late, today and days remaining", () => {
    expect(deadlineInfo("2026-09-10", false, today)).toEqual({ kind: "overdue", days: 9 });
    expect(deadlineInfo("2026-09-19", false, today)).toEqual({ kind: "today", days: 0 });
    expect(deadlineInfo("2026-09-22", false, today)).toEqual({ kind: "upcoming", days: 3 });
  });

  it("is done or without deadline regardless of dates", () => {
    expect(deadlineInfo("2026-09-01", true, today)).toEqual({ kind: "done", days: 0 });
    expect(deadlineInfo(null, false, today)).toEqual({ kind: "none", days: 0 });
  });

  it("writes labels in Portuguese with singular and plural", () => {
    expect(deadlineLabel({ kind: "overdue", days: 9 })).toBe("Atrasada há 9 dias");
    expect(deadlineLabel({ kind: "overdue", days: 1 })).toBe("Atrasada há 1 dia");
    expect(deadlineLabel({ kind: "today", days: 0 })).toBe("Vence hoje");
    expect(deadlineLabel({ kind: "upcoming", days: 3 })).toBe("Faltam 3 dias");
    expect(deadlineLabel({ kind: "upcoming", days: 1 })).toBe("Falta 1 dia");
    expect(deadlineLabel({ kind: "none", days: 0 })).toBe("Sem prazo");
    expect(deadlineLabel({ kind: "done", days: 0 })).toBe("Concluída");
  });
});

const ana: Profile = { id: "u1", email: "ana@x", name: "Ana", role: "user" };
const bia: Profile = { id: "u2", email: "bia@x", name: "Bia", role: "user" };
const admin: Profile = { id: "a", email: "a@x", name: "Adm", role: "admin" };
const viewer: Profile = { id: "v", email: "v@x", name: "Vera", role: "viewer" };

function sub(id: string, taskId: string, over: Partial<Subtask> = {}): Subtask {
  return {
    id,
    task_id: taskId,
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

const tasks: Task[] = [
  task("T1", {
    assignee_id: "u1",
    status: "doing",
    start_date: "2026-09-01",
    end_date: "2026-09-30",
    subtasks: [
      sub("s1", "T1", { done: true }), // sem dono: é de quem é dono da tarefa (Ana)
      sub("s2", "T1", { assignee_id: "u2", end_date: "2026-09-10" }), // da Bia, atrasada 9 dias
      sub("s3", "T1"), // sem dono e sem datas: herda o fim da tarefa (11 dias)
    ],
  }),
  task("T2", { assignee_id: "u2", end_date: "2026-09-15" }), // atrasada 4 dias
  task("T3", { status: "done", end_date: "2026-09-01" }), // sem responsável
];

describe("buildPersonReport", () => {
  it("groups tasks by owner and subtasks by their responsible (own or the task's)", () => {
    const r = buildPersonReport({ id: "u1", name: "Ana" }, tasks, today);
    expect(r.lines.map((l) => `${l.kind}:${l.id}`).toSorted()).toEqual([
      "subtask:s1",
      "subtask:s3",
      "task:T1",
    ]);
  });

  it("computes task and subtask stats", () => {
    const r = buildPersonReport({ id: "u1", name: "Ana" }, tasks, today);
    expect(r.taskStats).toEqual({
      total: 1,
      todo: 0,
      doing: 1,
      blocked: 0,
      done: 0,
      late: 0,
      progress: 33,
    });
    expect(r.subtaskStats).toEqual({ total: 2, done: 1, open: 1, late: 0, progress: 50 });
  });

  it("puts subtasks assigned to someone else in that person's report, with days late", () => {
    const r = buildPersonReport({ id: "u2", name: "Bia" }, tasks, today);
    expect(r.taskStats.late).toBe(1);
    expect(r.subtaskStats).toMatchObject({ total: 1, open: 1, late: 1 });
    expect(r.maxLateDays).toBe(9);
    // mais atrasada primeiro
    expect(r.lines.map((l) => l.id)).toEqual(["s2", "T2"]);
    expect(r.lines[0]?.deadline).toEqual({ kind: "overdue", days: 9 });
    expect(r.lines[0]?.parentTitle).toBe("T1");
  });

  it("inherits the task deadline for undated subtasks", () => {
    const r = buildPersonReport({ id: "u1", name: "Ana" }, tasks, today);
    const s3 = r.lines.find((l) => l.id === "s3");
    expect(s3?.inheritedDates).toBe(true);
    expect(s3?.end).toBe("2026-09-30");
    expect(s3?.deadline).toEqual({ kind: "upcoming", days: 11 });
  });

  it("finds the next due item and how many are due within 7 days", () => {
    const sample = [
      task("A", { assignee_id: "u1", end_date: "2026-09-22" }),
      task("B", { assignee_id: "u1", end_date: "2026-09-19" }),
      task("C", { assignee_id: "u1", end_date: "2026-10-30" }),
      task("D", { assignee_id: "u1", status: "done", end_date: "2026-09-20" }),
    ];
    const r = buildPersonReport({ id: "u1", name: "Ana" }, sample, today);
    expect(r.nextDue).toEqual({ title: "B", days: 0 });
    expect(r.dueSoon).toBe(2);
    expect(r.maxLateDays).toBe(0);
  });

  it("orders lines: late (worst first), today, upcoming, no deadline, done", () => {
    const sample = [
      task("done", { assignee_id: "u1", status: "done", end_date: "2026-09-01" }),
      task("none", { assignee_id: "u1" }),
      task("soon", { assignee_id: "u1", end_date: "2026-09-25" }),
      task("hoje", { assignee_id: "u1", end_date: "2026-09-19" }),
      task("late2", { assignee_id: "u1", end_date: "2026-09-17" }),
      task("late9", { assignee_id: "u1", end_date: "2026-09-10" }),
    ];
    const r = buildPersonReport({ id: "u1", name: "Ana" }, sample, today);
    expect(r.lines.map((l) => l.id)).toEqual(["late9", "late2", "hoje", "soon", "none", "done"]);
  });
});

describe("buildTeamReport", () => {
  it("has one report per admin/user, worst first, plus an unassigned bucket", () => {
    const team = buildTeamReport([admin, ana, bia, viewer], tasks, today);
    expect(team.map((r) => r.person.name)).toEqual(["Bia", "Adm", "Ana", "Sem responsável"]);
    expect(team.at(-1)?.person.id).toBe(UNASSIGNED);
    expect(team.at(-1)?.taskStats.total).toBe(1);
  });

  it("omits the unassigned bucket when nothing is unassigned", () => {
    const team = buildTeamReport([ana], [task("X", { assignee_id: "u1" })], today);
    expect(team.map((r) => r.person.name)).toEqual(["Ana"]);
  });
});
