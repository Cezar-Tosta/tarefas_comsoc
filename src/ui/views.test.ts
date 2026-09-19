import { beforeEach, describe, expect, it } from "vitest";
import { state } from "../state";
import type { Profile, Task } from "../types";
import { ganttView, tasksView, toolbarView, usersView } from "./views";

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
