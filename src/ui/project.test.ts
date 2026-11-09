import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FILTERS } from "../lib/filters";
import { emptyReadState } from "../lib/unread";
import { state } from "../state";
import type { JournalEntry, Profile, Task } from "../types";
import { dashboardTasks, dashboardView, projectView } from "./project";

const admin: Profile = { id: "a", email: "a@x", name: "Ada", role: "admin" };
const ana: Profile = { id: "u1", email: "ana@x", name: "Ana", role: "user" };
const vera: Profile = { id: "v", email: "v@x", name: "Vera", role: "viewer" };

function makeTasks(): Task[] {
  return [
    {
      id: "p1",
      title: "Portal <novo>",
      description: "Site institucional",
      status: "doing",
      priority: "high",
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      assignee_id: "u1",
      links: [],
      comment_count: 0,
      scope: "Entregar 5 páginas",
      success_criteria: "Aprovado pela diretoria",
      budget: 1000,
      baseline_start: "2026-09-01",
      baseline_end: "2026-09-25",
      expenses: [
        {
          id: "e1",
          task_id: "p1",
          description: "Hospedagem",
          amount: 250,
          spent_on: "2026-09-02",
          created_at: "2026-09-02T10:00:00Z",
        },
      ],
      subtasks: [
        {
          id: "s1",
          task_id: "p1",
          title: "Layout",
          done: true,
          start_date: "2026-09-01",
          end_date: "2026-09-10",
          assignee_id: "u1",
          position: 0,
        },
        {
          id: "s2",
          task_id: "p1",
          title: "Conteúdo",
          done: false,
          start_date: "2026-09-11",
          end_date: "2026-09-30",
          assignee_id: null,
          position: 1,
        },
      ],
    },
    {
      id: "p2",
      title: "Campanha encerrada",
      description: "",
      status: "done",
      priority: "low",
      start_date: "2026-08-01",
      end_date: "2026-08-10",
      assignee_id: null,
      links: [],
      comment_count: 0,
      subtasks: [],
    },
  ];
}

const journal: JournalEntry[] = [
  {
    id: "j1",
    task_id: "p1",
    author_id: "a",
    kind: "decision",
    body: "Usar o tema <escuro>",
    created_at: "2026-09-05T12:00:00Z",
  },
  {
    id: "j2",
    task_id: "p1",
    author_id: null,
    kind: "system",
    body: "Etapa concluída: Layout",
    created_at: "2026-09-10T12:00:00Z",
  },
];

function as(me: Profile): void {
  state.me = me;
  state.profiles = [admin, ana, vera];
  state.tasks = makeTasks();
  state.read = emptyReadState();
  state.filters = { ...DEFAULT_FILTERS };
  state.project = true;
  state.extras = true;
  state.dashLayout = "cards";
  state.dashScope = "open";
  state.dashSort = "deadline";
  state.projectId = "p1";
  state.journal = journal;
  state.journalFilter = "all";
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T12:00:00"));
  as(admin);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("dashboardView", () => {
  it("shows the projects in progress as cards that open the project page", () => {
    const out = dashboardView().value;
    expect(out).toContain('class="dash-cards"');
    expect(out).toContain('data-action="open-project" data-id="p1"');
    expect(out).toContain("Portal &lt;novo&gt;");
    expect(out).not.toContain("Campanha encerrada");
    expect(out).toContain("health-");
  });

  it("includes finished projects when the scope is 'all'", () => {
    state.dashScope = "all";
    expect(dashboardView().value).toContain("Campanha encerrada");
    expect(dashboardTasks().map((t) => t.id)).toEqual(["p2", "p1"]);
  });

  it("switches to a list (table) layout with labels for small screens", () => {
    state.dashLayout = "list";
    const out = dashboardView().value;
    expect(out).toContain("<table");
    expect(out).toContain('data-label="Saúde"');
    expect(out).not.toContain('class="dash-cards"');
  });

  it("applies the shared filters", () => {
    state.filters.q = "nada disso";
    const out = dashboardView().value;
    expect(out).not.toContain("Portal");
    expect(out).toContain("Nenhum projeto");
  });

  it("summarizes the portfolio, with money only when the project migration exists", () => {
    expect(dashboardView().value).toMatch(/R\$\s1\.000,00/);
    state.project = false;
    expect(dashboardView().value).not.toContain("R$");
  });

  it("offers the layout, scope and sort controls", () => {
    const out = dashboardView().value;
    expect(out).toContain('data-action="set-layout"');
    expect(out).toContain('data-action="set-scope"');
    expect(out).toContain('data-pref="dashSort"');
  });
});

describe("projectView", () => {
  it("shows scope, schedule, budget, control and the logbook, escaping text", () => {
    const out = projectView().value;
    expect(out).toContain("Entregar 5 páginas");
    expect(out).toContain("Aprovado pela diretoria");
    expect(out).toContain("Hospedagem");
    expect(out).toMatch(/R\$\s250,00/);
    expect(out).toMatch(/R\$\s750,00/); // saldo
    expect(out).toContain("Linha de base");
    expect(out).toContain("5 dias"); // adiamento 25/09 → 30/09
    expect(out).toContain("SPI");
    expect(out).toContain("CPI");
    expect(out).toContain("Diário de bordo");
    expect(out).toContain("Usar o tema &lt;escuro&gt;");
    expect(out).not.toContain("<escuro>");
    expect(out).toContain('data-action="back"');
  });

  it("lets the admin log expenses and delete manual (not automatic) entries", () => {
    const out = projectView().value;
    expect(out).toContain('data-form="expense"');
    expect(out).toContain('data-action="delete-expense" data-id="e1"');
    expect(out).toContain('data-form="journal"');
    expect(out).toContain('data-action="delete-journal" data-id="j1"');
    expect(out).not.toContain('data-action="delete-journal" data-id="j2"');
    expect(out).toContain('data-action="edit-task" data-id="p1"');
  });

  it("lets a user write in the logbook, but not touch the budget or the task", () => {
    as(ana);
    const out = projectView().value;
    expect(out).toContain('data-form="journal"');
    expect(out).not.toContain('data-form="expense"');
    expect(out).not.toContain('data-action="delete-expense"');
    expect(out).not.toContain('data-action="delete-journal"');
    expect(out).not.toContain('data-action="edit-task"');
  });

  it("is read-only for viewers", () => {
    as(vera);
    const out = projectView().value;
    expect(out).not.toContain('data-form="journal"');
    expect(out).not.toContain('data-form="expense"');
  });

  it("filters the logbook by kind", () => {
    state.journalFilter = "system";
    const out = projectView().value;
    expect(out).toContain("Etapa concluída: Layout");
    expect(out).not.toContain("Usar o tema");
  });

  it("explains when the project migration is missing", () => {
    state.project = false;
    const out = projectView().value;
    expect(out).toContain("008_project_management.sql");
    expect(out).not.toContain('data-form="journal"');
  });

  it("handles a project that no longer exists", () => {
    state.projectId = "nope";
    const out = projectView().value;
    expect(out).toContain("Projeto não encontrado");
    expect(out).toContain('data-action="back"');
  });
});
