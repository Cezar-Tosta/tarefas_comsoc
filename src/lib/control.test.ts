import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import {
  computeControl,
  elapsedPercent,
  formatBRL,
  portfolioSummary,
  sortTasks,
  spentOf,
} from "./control";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t",
    title: "Projeto",
    description: "",
    status: "doing",
    priority: "medium",
    start_date: "2026-01-01",
    end_date: "2026-01-11",
    assignee_id: null,
    subtasks: [],
    links: [],
    comment_count: 0,
    ...overrides,
  };
}

function subs(done: number, total: number): Task["subtasks"] {
  const list: Task["subtasks"] = [];
  for (let i = 0; i < total; i++) {
    list.push({
      id: `s${i}`,
      task_id: "t",
      title: `Etapa ${i}`,
      done: i < done,
      start_date: null,
      end_date: null,
      assignee_id: null,
      position: i,
    });
  }
  return list;
}

function expense(amount: number): NonNullable<Task["expenses"]>[number] {
  return {
    id: `e${amount}`,
    task_id: "t",
    description: "Gasto",
    amount,
    spent_on: "2026-01-02",
    created_at: "2026-01-02T10:00:00Z",
  };
}

describe("elapsedPercent", () => {
  it("is 0 before the start and 100 after the end", () => {
    expect(elapsedPercent("2026-01-01", "2026-01-10", "2025-12-31")).toBe(0);
    expect(elapsedPercent("2026-01-01", "2026-01-10", "2026-01-11")).toBe(100);
  });

  it("is proportional in between", () => {
    // 11 dias (01 a 11); em 06/01 passaram 5
    expect(elapsedPercent("2026-01-01", "2026-01-11", "2026-01-06")).toBe(45);
  });

  it("is null without both dates", () => {
    expect(elapsedPercent(null, "2026-01-10", "2026-01-05")).toBeNull();
    expect(elapsedPercent("2026-01-01", null, "2026-01-05")).toBeNull();
  });
});

describe("spentOf", () => {
  it("sums the expenses and tolerates missing data", () => {
    expect(spentOf(task())).toBe(0);
    expect(spentOf(task({ expenses: [expense(10.5), expense(4.25)] }))).toBeCloseTo(14.75);
  });
});

describe("computeControl", () => {
  it("computes schedule and cost performance (earned value)", () => {
    const c = computeControl(
      task({ subtasks: subs(1, 2), budget: 1000, expenses: [expense(400)] }),
      "2026-01-06",
    );
    expect(c.progress).toBe(50);
    expect(c.elapsed).toBe(45);
    expect(c.spi).toBeCloseTo(1.11, 2);
    expect(c.earned).toBe(500);
    expect(c.cpi).toBeCloseTo(1.25, 2);
    expect(c.budgetUsed).toBe(40);
    expect(c.balance).toBe(600);
    expect(c.health).toBe("ok");
    expect(c.reasons).toEqual([]);
  });

  it("flags a late project as critical", () => {
    const c = computeControl(task(), "2026-01-20");
    expect(c.health).toBe("critical");
    expect(c.reasons.join(" ")).toMatch(/vencido/);
  });

  it("flags a blown budget as critical", () => {
    const c = computeControl(task({ budget: 100, expenses: [expense(150)] }), "2026-01-02");
    expect(c.health).toBe("critical");
    expect(c.reasons.join(" ")).toMatch(/estourado/);
  });

  it("flags progress below plan as attention", () => {
    const c = computeControl(task({ subtasks: subs(3, 10) }), "2026-01-06");
    // 30% feito com 45% do prazo: SPI 0,67 → crítico; com 4/10 → 0,89 → atenção
    expect(c.health).toBe("critical");
    const d = computeControl(task({ subtasks: subs(4, 10) }), "2026-01-06");
    expect(d.health).toBe("attention");
  });

  it("does not judge the pace at the very beginning", () => {
    const c = computeControl(task({ subtasks: subs(0, 10) }), "2026-01-02");
    expect(c.health).toBe("ok");
  });

  it("flags a postponed deadline (baseline slip) and a blocked project", () => {
    const c = computeControl(task({ baseline_end: "2026-01-05", status: "blocked" }), "2026-01-01");
    expect(c.slipDays).toBe(6);
    expect(c.health).toBe("attention");
    expect(c.reasons.length).toBe(2);
  });

  it("treats a finished project as done regardless of the rest", () => {
    const c = computeControl(
      task({ status: "done", budget: 1, expenses: [expense(9)] }),
      "2026-02-01",
    );
    expect(c.health).toBe("done");
  });

  it("has no cost indexes without a budget", () => {
    const c = computeControl(task(), "2026-01-06");
    expect(c.budget).toBeNull();
    expect(c.budgetUsed).toBeNull();
    expect(c.cpi).toBeNull();
    expect(c.earned).toBeNull();
  });
});

describe("portfolioSummary", () => {
  it("counts health and money", () => {
    const today = "2026-01-06";
    const s = portfolioSummary(
      [
        task({ id: "a", budget: 100, expenses: [expense(20)] }),
        task({ id: "b", end_date: "2026-01-02" }),
        task({ id: "c", status: "done" }),
      ],
      today,
    );
    expect(s.total).toBe(3);
    expect(s.health).toEqual({ ok: 1, attention: 0, critical: 1, done: 1 });
    expect(s.budget).toBe(100);
    expect(s.spent).toBe(20);
  });
});

describe("sortTasks", () => {
  const list = [
    task({ id: "a", title: "Beta", end_date: "2026-03-01" }),
    task({ id: "b", title: "Alfa", end_date: "2026-01-02" }),
    task({ id: "c", title: "Gama", end_date: null, subtasks: subs(2, 2) }),
  ];

  it("orders by deadline with undated last", () => {
    expect(sortTasks(list, "deadline", "2026-01-01").map((t) => t.id)).toEqual(["b", "a", "c"]);
  });

  it("orders by name", () => {
    expect(sortTasks(list, "title", "2026-01-01").map((t) => t.id)).toEqual(["b", "a", "c"]);
  });

  it("orders by health, worst first", () => {
    expect(sortTasks(list, "health", "2026-01-05")[0]?.id).toBe("b");
  });

  it("orders by progress, highest first", () => {
    expect(sortTasks(list, "progress", "2026-01-01")[0]?.id).toBe("c");
  });
});

describe("formatBRL", () => {
  it("formats as Brazilian currency", () => {
    expect(formatBRL(1234.5)).toMatch(/R\$\s1\.234,50/);
  });
});
