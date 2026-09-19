import { beforeEach, describe, expect, it } from "vitest";
import { state } from "../state";
import type { Profile, Task } from "../types";
import {
  chatMessages,
  commentsDialog,
  ganttView,
  linkDialog,
  summaryView,
  tasksView,
  toolbarView,
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
  it("locks the current user's own role select", () => {
    const out = usersView().value;
    expect(out).toMatch(/data-id="a"[^>]*disabled/);
    expect(out).not.toMatch(/data-id="u1"[^>]*disabled/);
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
