import { beforeEach, describe, expect, it, vi } from "vitest";
import { state } from "../state";
import type { Profile, Task } from "../types";
import {
  chatMessages,
  commentsDialog,
  ganttView,
  linkDialog,
  loginView,
  pendingView,
  reportPeopleIds,
  reportsView,
  shellView,
  subtaskDialog,
  summaryView,
  tasksView,
  toolbarView,
  userDialog,
  usersView,
} from "./views";

const admin: Profile = { id: "a", email: "a@x", name: "Ada", role: "admin" };
const ana: Profile = { id: "u1", email: "ana@x", name: "Ana", role: "user" };
const bia: Profile = { id: "u2", email: "bia@x", name: "Bia", role: "user" };
const vera: Profile = { id: "v", email: "v@x", name: "Vera", role: "viewer" };

function makeTasks(): Task[] {
  return [
    {
      id: "t1",
      title: "Relatório <b>anual</b>",
      description: "",
      status: "doing",
      priority: "high",
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      assignee_id: "u1",
      links: [],
      comment_count: 0,
      subtasks: [
        {
          id: "s1",
          task_id: "t1",
          title: "Coletar dados",
          done: true,
          start_date: "2026-09-01",
          end_date: "2026-09-05",
          assignee_id: null,
          position: 0,
        },
        {
          id: "s2",
          task_id: "t1",
          title: "Escrever",
          done: false,
          start_date: "2026-09-06",
          end_date: "2026-09-20",
          assignee_id: "u1",
          position: 1,
        },
      ],
    },
    {
      id: "t2",
      title: "Sem datas",
      description: "",
      status: "todo",
      priority: "low",
      start_date: null,
      end_date: null,
      assignee_id: "u2",
      links: [],
      comment_count: 0,
      subtasks: [],
    },
  ];
}

function as(me: Profile): void {
  state.me = me;
  state.profiles = [admin, ana, bia, vera];
  state.tasks = makeTasks();
  state.openDone = new Set();
  state.openTasks = new Set(["t1", "t2"]);
  state.openPeople = new Set(["a", "u1", "u2", "__unassigned__"]);
}

beforeEach(() => as(admin));

describe("tasksView", () => {
  it("escapes user text", () => {
    const out = tasksView().value;
    expect(out).toContain("Relatório &lt;b&gt;anual&lt;/b&gt;");
    expect(out).not.toContain("<b>anual</b>");
  });

  it("groups done subtasks in a collapsed details and shows the percentage", () => {
    const out = tasksView().value;
    expect(out).toMatch(/<details\s+class="done-group"[^>]*>/);
    expect(out).not.toMatch(/<details[^>]*\sopen/);
    expect(out).toContain("Concluídas (1)");
    expect(out).toContain("50%");
    expect(out).toContain("1/2 subtarefas");
  });

  it("reopens the done group when remembered", () => {
    state.openDone.add("t1");
    expect(tasksView().value).toMatch(/<details\s+class="done-group"[^>]*\sopen/);
  });

  it("gives admins every control", () => {
    const out = tasksView().value;
    expect(out).toContain('data-action="delete-task"');
    expect(out).toContain('data-action="edit-task" data-id="t2"');
    expect(toolbarView().value).toContain('data-action="new-task"');
  });

  it("lets a user edit only what is assigned to them", () => {
    as(ana);
    const out = tasksView().value;
    expect(out).toContain('data-action="edit-task" data-id="t1"');
    expect(out).not.toContain('data-action="edit-task" data-id="t2"');
    expect(out).not.toContain('data-action="delete-task"');
    expect(toolbarView().value).not.toContain('data-action="new-task"');
    expect(out).toContain('data-form="add-sub" data-task="t1"');
    expect(out).not.toContain('data-form="add-sub" data-task="t2"');
  });

  it("has a collapsible filters panel with the active-filter count", () => {
    state.filtersOpen = false;
    state.filters = { ...state.filters, status: "done", hideDone: true };
    const out = toolbarView().value;
    expect(out).toContain('data-action="toggle-filters"');
    expect(out).toMatch(/id="filters-panel"\s+class="filters-panel\s*"/);
    expect(out).toMatch(/count-pill">2</);
    state.filtersOpen = true;
    expect(toolbarView().value).toMatch(/class="filters-panel\s+open"/);
    state.filtersOpen = false;
    state.filters = { ...state.filters, status: "all", hideDone: false };
  });

  it("is read-only for viewers", () => {
    as(vera);
    const out = tasksView().value;
    expect(out).not.toContain('data-action="edit-');
    expect(out).not.toContain("delete-");
    expect(out).not.toContain("data-form=");
    expect(out).toMatch(/type="checkbox"[^>]*disabled/);
  });
});

describe("ganttView", () => {
  it("renders bars for dated tasks (and subtasks) and lists undated ones", () => {
    const out = ganttView().value;
    expect(out).toContain('class="bar');
    expect(out).toContain("Coletar dados");
    expect(out).toContain("Sem datas (fora do Gantt)");
  });

  it("draws undated subtasks with the task period, marked as inherited", () => {
    const task = state.tasks[0];
    if (!task) {
      throw new Error("fixture vazia");
    }
    task.subtasks.push({
      id: "s9",
      task_id: "t1",
      title: "Sem data própria",
      done: false,
      start_date: null,
      end_date: null,
      assignee_id: null,
      position: 9,
    });
    const out = ganttView().value;
    expect(out).toContain("Sem data própria");
    expect(out).toContain("bar-inherited");
    expect(out).toContain("usa as da tarefa");
  });

  it("hides subtask rows when disabled", () => {
    state.showSubtasks = false;
    const out = ganttView().value;
    expect(out).not.toContain("Coletar dados");
    state.showSubtasks = true;
  });
});

describe("usersView", () => {
  it("lists everyone in a table with edit and delete buttons", () => {
    const out = usersView().value;
    expect(out).toContain('class="users-table"');
    expect(out).toMatch(/data-action="edit-user"\s+data-id="u1"/);
    expect(out).toMatch(/data-action="delete-user"\s+data-id="u1"/);
  });

  it("locks edit and delete on the current user's own row", () => {
    const out = usersView().value;
    expect(out).toMatch(/data-action="edit-user"\s+data-id="a"[^>]*disabled/);
    expect(out).toMatch(/data-action="delete-user"\s+data-id="a"[^>]*disabled/);
    expect(out).not.toMatch(/data-action="edit-user"\s+data-id="u1"[^>]*disabled/);
  });

  it("summarises how many users there are and of which types", () => {
    const out = usersView().value;
    expect(out).toContain('class="user-info"');
    expect(out).toContain("<strong>4</strong> usuários cadastrados");
    expect(out).toContain('class="pie"');
    expect(out).toMatch(/pie-admin"[^>]*><\/i>Administrador\s*<b>1<\/b>/);
    expect(out).toMatch(/pie-user"[^>]*><\/i>Usuário\s*<b>2<\/b>/);
  });

  it("edits name and role in a dialog", () => {
    const out = userDialog(ana).value;
    expect(out).toContain('data-form="user" data-id="u1"');
    expect(out).toContain('name="name"');
    expect(out).toContain('name="role"');
  });
});

function withLinks(): void {
  const task = state.tasks[0];
  if (!task) {
    throw new Error("fixture vazia");
  }
  task.comment_count = 3;
  task.links = [
    {
      id: "l1",
      task_id: "t1",
      title: "Planilha",
      url: "https://exemplo.com/p",
      created_at: "2026-09-01T10:00:00Z",
    },
    {
      id: "l2",
      task_id: "t1",
      title: "Perigoso",
      url: "javascript:alert(1)",
      created_at: "2026-09-01T11:00:00Z",
    },
  ];
}

describe("links and comments", () => {
  it("shows the comment count and safe links; unsafe URLs are never anchors", () => {
    withLinks();
    const out = tasksView().value;
    expect(out).toMatch(/data-action="open-comments"\s+data-id="t1"/);
    expect(out).toMatch(/count-pill">3</);
    expect(out).toContain('href="https://exemplo.com/p"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).not.toContain('href="javascript:');
  });

  it("lets only whoever edits the task add or remove links", () => {
    withLinks();
    expect(tasksView().value).toContain('data-action="add-link" data-id="t1"');
    as(ana); // dona de t1
    withLinks();
    expect(tasksView().value).toContain('data-action="add-link" data-id="t1"');
    expect(tasksView().value).not.toContain('data-action="add-link" data-id="t2"');
    as(vera);
    withLinks();
    const out = tasksView().value;
    expect(out).not.toContain("add-link");
    expect(out).not.toContain("delete-link");
    expect(out).toContain('href="https://exemplo.com/p"');
  });

  it("renders the chat with escaped, linkified messages and a composer for admins and users", () => {
    const task = state.tasks[0]!;
    const comments = [
      {
        id: "c1",
        task_id: "t1",
        author_id: "u1",
        body: "veja https://exemplo.com <b>x</b>",
        created_at: "2026-09-19T17:05:00Z",
      },
      { id: "c2", task_id: "t1", author_id: "a", body: "ok", created_at: "2026-09-19T17:06:00Z" },
    ];
    const out = commentsDialog(task, comments).value;
    expect(out).toContain("Ana");
    expect(out).toMatch(/<a href="https:\/\/exemplo.com"/);
    expect(out).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(out).toContain('data-form="comment"');
    expect(out).toContain("msg mine"); // admin é o usuário atual
    expect(out).toMatch(/data-action="delete-comment"\s+data-id="c2"/);
  });

  it("gives viewers a read-only chat", () => {
    as(vera);
    const task = state.tasks[0]!;
    const out = commentsDialog(task, []).value;
    expect(out).not.toContain('data-form="comment"');
    expect(out).toContain("somente leitura");
    expect(out).toContain("Nenhum comentário ainda");
  });

  it("hides delete on other people's comments for a regular user", () => {
    as(ana);
    const list = chatMessages([
      { id: "c1", task_id: "t1", author_id: "u1", body: "meu", created_at: "2026-09-19T17:05:00Z" },
      { id: "c2", task_id: "t1", author_id: "a", body: "dele", created_at: "2026-09-19T17:06:00Z" },
    ]).value;
    expect(list).toMatch(/data-action="delete-comment"\s+data-id="c1"/);
    expect(list).not.toMatch(/data-action="delete-comment"\s+data-id="c2"/);
  });

  it("builds the link dialog for a task", () => {
    const task = state.tasks[0]!;
    expect(linkDialog(task).value).toContain('data-form="link" data-task="t1"');
  });
});

describe("assignee filter includes subtask assignees", () => {
  it("shows a task in the person's filter when only a subtask is theirs", () => {
    const task = state.tasks[1]; // t2 é da Bia
    if (!task) {
      throw new Error("fixture vazia");
    }
    task.subtasks.push({
      id: "sx",
      task_id: "t2",
      title: "Parte da Ana",
      done: false,
      start_date: null,
      end_date: null,
      assignee_id: "u1",
      position: 0,
    });
    state.filters = { ...state.filters, assignee: "u1" };
    const out = tasksView().value;
    expect(out).toContain("Sem datas"); // t2 aparece
    expect(out).toContain("Parte da Ana");
    state.filters = { ...state.filters, assignee: "all" };
  });
});

describe("without the comments/links migration", () => {
  it("hides the comment button and link area", () => {
    state.extras = false;
    const out = tasksView().value;
    state.extras = true;
    expect(out).not.toContain("open-comments");
    expect(out).not.toContain("add-link");
  });
});

describe("hide done", () => {
  it("also hides done subtasks in the task list", () => {
    state.filters = { ...state.filters, hideDone: true };
    const hidden = tasksView().value;
    state.filters = { ...state.filters, hideDone: false };
    const shown = tasksView().value;
    expect(shown).toContain("Coletar dados");
    expect(shown).toContain("Concluídas (1)");
    expect(hidden).not.toContain("Coletar dados");
    expect(hidden).not.toContain("done-group");
    expect(hidden).toContain("Escrever"); // subtarefa em aberto continua
    expect(hidden).toContain("1/2 subtarefas"); // o progresso continua contando as concluídas
  });

  it("also hides done subtasks in the Gantt", () => {
    state.filters = { ...state.filters, hideDone: true };
    const hidden = ganttView().value;
    state.filters = { ...state.filters, hideDone: false };
    expect(hidden).not.toContain("Coletar dados");
    expect(hidden).toContain("Escrever");
  });
});

describe("summary metrics per profile", () => {
  const TODAY = "2026-09-19";

  it("shows each card's share of the total, except the Tarefas base card", () => {
    const out = summaryView(TODAY).value;
    expect(out.match(/stat-pct/g)).toHaveLength(3); // andamento, concluídas, atrasadas
    expect(out).not.toMatch(/stat-value">2<small/);
  });

  it("admin sees the general overview with every task", () => {
    const out = summaryView(TODAY).value;
    expect(out).toContain("Visão geral");
    expect(out).toContain("Progresso geral");
    expect(out).toMatch(/stat-value">2</); // t1 e t2
  });

  it("a user sees only their own metrics", () => {
    as(ana); // t1 é dela (dona); t2 é da Bia, sem subtarefa da Ana
    const out = summaryView(TODAY).value;
    expect(out).toContain("Minhas tarefas");
    expect(out).toContain("Progresso das minhas tarefas");
    expect(out).toMatch(/stat-value">1</);
    expect(out).not.toMatch(/stat-value">2</);
  });

  it("a viewer sees no metrics at all", () => {
    as(vera);
    expect(summaryView(TODAY).value).toBe("");
  });
});

describe("collapsible task cards", () => {
  it("shows only the title while collapsed", () => {
    state.openTasks = new Set();
    const out = tasksView().value;
    expect(out).toContain("is-collapsed");
    expect(out).toMatch(/data-action="toggle-task"\s+data-id="t1"\s+aria-expanded="false"/);
    expect(out).not.toContain("Coletar dados");
    expect(out).not.toContain('data-action="edit-task"');
    expect(out).not.toContain("Prioridade");
  });

  it("opens one card at a time and keeps done subtasks collapsed", () => {
    state.openTasks = new Set(["t1"]);
    const out = tasksView().value;
    expect(out).toMatch(/data-id="t1"\s+aria-expanded="true"/);
    expect(out).toMatch(/data-id="t2"\s+aria-expanded="false"/);
    expect(out).toMatch(/<details\s+class="done-group"[^>]*>/);
    expect(out).not.toMatch(/<details[^>]*\sopen/);
  });

  it("has an expand/collapse-all switch that reflects the state", () => {
    state.openTasks = new Set();
    expect(tasksView().value).toMatch(/role="switch"[^>]*aria-checked="false"/);
    state.openTasks = new Set(["t1", "t2"]);
    expect(tasksView().value).toMatch(/role="switch"[^>]*aria-checked="true"/);
  });
});

describe("task deadline countdown", () => {
  // t1 termina em 2026-09-30; o teste fixa "hoje" via fake timers
  it("shows how many days remain next to the title, even when collapsed", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 27, 12));
    state.openTasks = new Set();
    expect(tasksView().value).toMatch(/dl-soon">Faltam 3 dias</);
    vi.setSystemTime(new Date(2026, 8, 30, 12));
    expect(tasksView().value).toMatch(/dl-today">HOJE</);
    vi.setSystemTime(new Date(2026, 9, 2, 12));
    expect(tasksView().value).toMatch(/dl-overdue">Atrasada há 2 dias</);
    vi.useRealTimers();
  });

  it("shows nothing for tasks without an end date", () => {
    state.openTasks = new Set();
    state.tasks = state.tasks.filter((t) => t.id === "t2");
    expect(tasksView().value).not.toContain("deadline");
  });
});

function link(): void {
  const s2 = state.tasks[0]?.subtasks[1];
  if (!s2) {
    throw new Error("fixture vazia");
  }
  s2.start_after_id = "s1"; // s1 termina em 05/09 → s2 começa em 06/09
  s2.start_date = "2026-09-10"; // ignorada enquanto vinculada
}

describe("subtask starting after another", () => {
  it("offers the sibling subtasks in the edit dialog, without cycles", () => {
    const task = state.tasks[0];
    const s1 = task?.subtasks[0];
    if (!task || !s1) {
      throw new Error("fixture vazia");
    }
    const out = subtaskDialog(task, s1).value;
    expect(out).toContain('name="start_after_id"');
    expect(out).toContain("Escrever");
    link();
    const cyclic = subtaskDialog(task, s1).value; // s1 não pode vir depois de s2, que vem depois de s1
    expect(cyclic).not.toContain("Escrever");
  });

  it("marks the linked subtask and shows the computed dates", () => {
    link();
    const out = tasksView().value;
    expect(out).toContain("↳ após Coletar dados");
    expect(out).toContain("06/09/2026");
    expect(out).not.toContain("10/09/2026");
  });

  it("draws the linked subtask in the Gantt from the computed start", () => {
    link();
    expect(ganttView().value).toContain("06/09/2026 – 20/09/2026");
  });

  it("locks the start date field while linked", () => {
    link();
    const task = state.tasks[0];
    const s2 = task?.subtasks[1];
    if (!task || !s2) {
      throw new Error("fixture vazia");
    }
    expect(subtaskDialog(task, s2).value).toMatch(/name="start_date"[^>]*readonly/);
  });
});

describe("gantt toolbar", () => {
  it("keeps only the filters: no new task, export or refresh", () => {
    const out = toolbarView("gantt").value;
    expect(out).toContain('data-filter="q"');
    expect(out).toContain('data-filter="status"');
    expect(out).not.toContain('data-action="new-task"');
    expect(out).not.toContain('data-action="export-csv"');
    expect(out).not.toContain('data-action="refresh"');
    expect(out).not.toContain('data-filter="hideDone"');
  });

  it("puts hide-done next to show-subtasks in the Gantt controls", () => {
    const out = ganttView().value;
    expect(out).toMatch(/data-pref="showSubtasks"[\s\S]*data-filter="hideDone"/);
  });
});

describe("collapsible reports", () => {
  it("shows only the person's name while collapsed", () => {
    state.openPeople = new Set();
    const out = reportsView().value;
    expect(out).toContain("report is-collapsed");
    expect(out).toMatch(/data-action="toggle-person"\s+data-id="u1"\s+aria-expanded="false"/);
    expect(out).not.toContain("Maior atraso");
    expect(out).not.toContain('class="pie"');
  });

  it("expands a single person and has an expand/collapse-all switch", () => {
    state.openPeople = new Set(["u1"]);
    const out = reportsView().value;
    expect(out).toMatch(/data-id="u1"\s+aria-expanded="true"/);
    expect(out).toMatch(/data-action="toggle-all-people"[^>]*aria-checked="false"/);
    expect(out).toContain("Maior atraso");
  });

  it("lists the ids shown so the switch can act on all of them", () => {
    expect(reportPeopleIds()).toEqual(expect.arrayContaining(["a", "u1", "u2"]));
  });
});

describe("reports tab", () => {
  it("is named Relatório and shows pie charts", () => {
    expect(shellView().value).toMatch(/data-view="reports"[^>]*>\s*Relatório\s*</);
    const out = reportsView().value;
    expect(out).toContain('class="pie"');
    expect(out).toContain("<svg");
  });

  it("is offered to admins and users, but not to viewers", () => {
    expect(shellView().value).toContain('data-view="reports"');
    as(ana);
    expect(shellView().value).toContain('data-view="reports"');
    as(vera);
    expect(shellView().value).not.toContain('data-view="reports"');
  });

  it("gives the admin one card per person with the deadline breakdown", () => {
    const out = reportsView().value;
    expect(out).toContain("Andamento por pessoa");
    for (const name of ["Ada", "Ana", "Bia"]) {
      expect(out).toContain(`<span>${name}</span>`);
    }
    expect(out).toContain("Maior atraso");
    expect(out).toContain("Próximo prazo");
    expect(out).toContain("Vencem em até 7 dias");
    expect(out).toContain("Tarefas e subtarefas (");
  });

  it("gives a user only their own report, already expanded", () => {
    as(ana);
    state.openReports = new Set(["u1"]);
    const out = reportsView().value;
    expect(out).toContain("Como estão as suas tarefas e subtarefas");
    expect(out).toContain("<span>Ana</span>");
    expect(out).not.toContain("<span>Bia</span>");
    expect(out).not.toContain("<span>Ada</span>");
    expect(out).toMatch(/<details\s+class="report-details"[^>]*\sopen/);
    expect(out).toContain("Escrever"); // subtarefa atribuída a ela
    state.openReports = new Set();
  });

  it("refuses viewers", () => {
    as(vera);
    expect(reportsView().value).toContain("não está disponível");
  });
});

describe("a user with nothing assigned", () => {
  it("sees a friendly empty state on Tarefas, Gantt and Relatórios", () => {
    as(ana);
    state.tasks = [];
    expect(tasksView().value).toContain("Você ainda não tem tarefas atribuídas");
    expect(ganttView().value).toContain("Você ainda não tem tarefas atribuídas");
    const report = reportsView().value;
    expect(report).toContain("Você ainda não tem tarefas atribuídas");
    expect(report).toContain("Nada atribuído");
  });
});

describe("logo", () => {
  it("replaces the text title on the login screen and keeps an accessible name", () => {
    const out = loginView().value;
    expect(out).toMatch(/<img[^>]*alt="Tarefas COMSOC"/);
    expect(out).not.toContain("<h1>Tarefas COMSOC</h1>");
  });

  it("shows the logo in the top bar instead of the text title", () => {
    const out = shellView().value;
    expect(out).toMatch(/<h1 class="brand">\s*<img[^>]*alt="Tarefas COMSOC"/);
    expect(out).not.toContain("<h1>Tarefas COMSOC</h1>");
  });

  it("shows the logo on the pending approval screen", () => {
    as(vera);
    state.me = { ...vera, role: "pending" };
    expect(pendingView().value).toContain("brand-hero");
  });
});
