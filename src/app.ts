import * as api from "./api";
import { PRIORITIES, STATUSES } from "./labels";
import { tasksToCsv } from "./lib/csv";
import { todayISO } from "./lib/dates";
import { DEFAULT_FILTERS, filterTasks } from "./lib/filters";
import type { Zoom } from "./lib/gantt";
import { normalizeUrl } from "./lib/links";
import { canManageUsers, canSeeReports, visibleTasks } from "./lib/permissions";
import { currentUser, savePrefs, state, type View } from "./state";
import type { Priority, Role, Status, TaskInput } from "./types";
import { html, mount, type Safe } from "./ui/html";
import {
  chatMessages,
  commentsDialog,
  ganttView,
  linkDialog,
  loginView,
  pendingView,
  reportsView,
  setupView,
  shellView,
  subtaskDialog,
  summaryView,
  taskDialog,
  tasksView,
  toolbarView,
  usersView,
} from "./ui/views";

// ---------- utilidades ----------

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Elemento #${id} não encontrado`);
  }
  return el;
}

function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return "E-mail ou senha incorretos.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Confirme seu e-mail antes de entrar.";
  }
  if (/already registered/i.test(message)) {
    return "Este e-mail já está cadastrado.";
  }
  return message;
}

function toast(message: string, kind: "error" | "ok" = "error"): void {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  byId("toasts").append(el);
  setTimeout(() => el.remove(), 5000);
}

async function run(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    toast(friendly(error instanceof Error ? error.message : String(error)));
  }
}

function field(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

function pick<T extends string>(allowed: readonly T[], value: string, fallback: T): T {
  return allowed.find((item) => item === value) ?? fallback;
}

// ---------- renderização ----------

export function render(): void {
  const app = byId("app");
  switch (state.screen) {
    case "loading":
      mount(app, html`<main class="auth"><p class="muted center">Carregando…</p></main>`);
      return;
    case "setup":
      mount(app, setupView());
      return;
    case "login":
      mount(app, loginView());
      return;
    case "pending":
      mount(app, pendingView());
      return;
    case "main":
      mount(app, shellView());
      mount(
        byId("toolbar"),
        state.view === "users" || state.view === "reports" ? html`` : toolbarView(),
      );
      renderContent();
      return;
  }
}

/** Atualiza resumo e conteúdo sem recriar a barra de filtros (preserva foco ao digitar). */
function renderContent(): void {
  mount(byId("summary"), summaryView(todayISO()));
  let content: Safe;
  if (state.view === "gantt") {
    content = ganttView();
  } else if (state.view === "reports") {
    content = reportsView();
  } else if (state.view === "users") {
    content = usersView();
  } else {
    content = tasksView();
  }
  mount(byId("content"), content);
  if (state.view === "gantt") {
    scrollGanttToToday();
  }
}

function scrollGanttToToday(): void {
  const scroller = document.getElementById("gantt-scroll");
  if (!scroller) {
    return;
  }
  const todayLeft = Number(scroller.dataset["todayLeft"] ?? 0);
  scroller.scrollLeft = Math.max(0, todayLeft - scroller.clientWidth / 3);
}

// ---------- carga de dados ----------

async function loadTasks(): Promise<void> {
  const { tasks, extras } = await api.fetchTasks();
  state.tasks = visibleTasks(currentUser(), tasks);
  state.extras = extras;
}

async function loadAll(): Promise<void> {
  const [loaded, profiles] = await Promise.all([api.fetchTasks(), api.fetchProfiles()]);
  state.tasks = visibleTasks(currentUser(), loaded.tasks);
  state.extras = loaded.extras;
  state.profiles = profiles;
}

export async function boot(): Promise<void> {
  if (!api.isConfigured) {
    state.screen = "setup";
    render();
    return;
  }
  try {
    const session = await api.getSession();
    if (!session) {
      state.me = null;
      state.screen = "login";
      render();
      return;
    }
    const profile = await api.fetchProfile(session.user.id);
    if (!profile) {
      throw new Error(
        "Perfil não encontrado. Execute supabase/schema.sql no seu projeto Supabase.",
      );
    }
    state.me = profile;
    if (profile.role === "pending") {
      state.screen = "pending";
      render();
      return;
    }
    await loadAll();
    if (state.view === "users" && !canManageUsers(profile)) {
      state.view = "tasks";
    }
    if (state.view === "reports" && !canSeeReports(profile)) {
      state.view = "tasks";
    }
    if (profile.role === "user") {
      state.openReports.add(profile.id); // o usuário já vê o próprio detalhamento aberto
    }
    state.screen = "main";
    render();
    if (!state.extras) {
      toast(
        "Comentários e links indisponíveis: execute supabase/002_comments_links.sql no Supabase.",
      );
    }
  } catch (error) {
    state.screen = "login";
    render();
    toast(friendly(error instanceof Error ? error.message : String(error)));
  }
}

export function watchAuth(): void {
  if (!api.isConfigured) {
    return;
  }
  api.onAuthChange((userId) => {
    if (userId !== (state.me?.id ?? null)) {
      setTimeout(() => void boot(), 0);
    }
  });
}

// ---------- diálogos ----------

function openDialog(content: Safe): void {
  const dialog = byId("dialog") as HTMLDialogElement;
  mount(dialog, content);
  if (!dialog.open) {
    dialog.showModal();
  }
  dialog.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select")?.focus();
}

function closeDialog(): void {
  const dialog = byId("dialog") as HTMLDialogElement;
  if (dialog.open) {
    dialog.close();
  }
}

function formError(form: HTMLFormElement, message: string): void {
  const el = form.querySelector<HTMLElement>("[data-error]");
  if (el) {
    el.textContent = message;
  }
}

function findSubtask(id: string): { task: (typeof state.tasks)[number]; index: number } | null {
  for (const task of state.tasks) {
    const index = task.subtasks.findIndex((s) => s.id === id);
    if (index >= 0) {
      return { task, index };
    }
  }
  return null;
}

// ---------- comentários (chat) ----------

const CHAT_POLL_MS = 8000;
let chatTimer: ReturnType<typeof setInterval> | undefined;

function stopChatPolling(): void {
  clearInterval(chatTimer);
  chatTimer = undefined;
  state.chatTaskId = null;
}

function scrollChatToEnd(): void {
  const list = document.getElementById("chat-list");
  if (list) {
    list.scrollTop = list.scrollHeight;
  }
}

const signature = (list: { id: string }[]): string => list.map((c) => c.id).join(",");

/** Busca os comentários da conversa aberta e atualiza a lista só se algo mudou. */
async function refreshChat(forceScroll = false): Promise<void> {
  const taskId = state.chatTaskId;
  if (!taskId) {
    return;
  }
  const fresh = await api.fetchComments(taskId);
  if (state.chatTaskId !== taskId) {
    return;
  }
  const changed = signature(fresh) !== signature(state.comments);
  state.comments = fresh;
  const task = state.tasks.find((t) => t.id === taskId);
  if (task && task.comment_count !== fresh.length) {
    task.comment_count = fresh.length;
    renderContent();
  }
  const list = document.getElementById("chat-list");
  if (!list || !(changed || forceScroll)) {
    return;
  }
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  mount(list, chatMessages(fresh));
  if (nearBottom || forceScroll) {
    scrollChatToEnd();
  }
}

function startChatPolling(): void {
  clearInterval(chatTimer);
  chatTimer = setInterval(() => {
    refreshChat().catch(() => {
      // falha de rede momentânea: tenta de novo no próximo ciclo
    });
  }, CHAT_POLL_MS);
}

// ---------- ações ----------

type Handler = (el: HTMLElement) => void | Promise<void>;

const FILTER_KEYS = Object.keys(DEFAULT_FILTERS);

const actions: Record<string, Handler> = {
  "toggle-auth": () => {
    state.authMode = state.authMode === "signin" ? "signup" : "signin";
    state.authMessage = "";
    render();
  },

  logout: () =>
    run(async () => {
      await api.signOut();
    }),

  refresh: () =>
    run(async () => {
      await boot();
    }),

  nav: (el) => {
    const view = el.dataset["view"] as View | undefined;
    if (!view) {
      return;
    }
    state.view = view;
    savePrefs();
    render();
  },

  "set-zoom": (el) => {
    state.zoom = pick<Zoom>(["day", "week", "month"], el.dataset["zoom"] ?? "", "week");
    savePrefs();
    renderContent();
  },

  "scroll-today": scrollGanttToToday,

  "toggle-filters": (el) => {
    state.filtersOpen = !state.filtersOpen;
    el.setAttribute("aria-expanded", String(state.filtersOpen));
    document.getElementById("filters-panel")?.classList.toggle("open", state.filtersOpen);
  },

  "reset-filters": () => {
    state.filters = { ...DEFAULT_FILTERS };
    savePrefs();
    render();
  },

  "export-csv": () => {
    const rows = filterTasks(state.tasks, state.filters, todayISO());
    const csv = "\uFEFF" + tasksToCsv(rows, state.profiles); // BOM: o Excel reconhece UTF-8
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `tarefas-${todayISO()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  },

  "new-task": () => openDialog(taskDialog(null)),

  "edit-task": (el) => {
    const task = state.tasks.find((t) => t.id === el.dataset["id"]);
    if (task) {
      openDialog(taskDialog(task));
    }
  },

  "delete-task": (el) =>
    run(async () => {
      const task = state.tasks.find((t) => t.id === el.dataset["id"]);
      if (!task) {
        return;
      }
      const extra = task.subtasks.length > 0 ? ` e suas ${task.subtasks.length} subtarefas` : "";
      if (!confirm(`Excluir a tarefa "${task.title}"${extra}? Esta ação não pode ser desfeita.`)) {
        return;
      }
      await api.deleteTask(task.id);
      await loadTasks();
      renderContent();
    }),

  "edit-sub": (el) => {
    const found = findSubtask(el.dataset["id"] ?? "");
    const subtask = found?.task.subtasks[found.index];
    if (found && subtask) {
      openDialog(subtaskDialog(found.task, subtask));
    }
  },

  "delete-sub": (el) =>
    run(async () => {
      const found = findSubtask(el.dataset["id"] ?? "");
      const subtask = found?.task.subtasks[found.index];
      if (!subtask) {
        return;
      }
      if (!confirm(`Excluir a subtarefa "${subtask.title}"?`)) {
        return;
      }
      await api.deleteSubtask(subtask.id);
      await loadTasks();
      renderContent();
    }),

  "toggle-sub": (el) =>
    run(async () => {
      const found = findSubtask(el.dataset["id"] ?? "");
      const subtask = found?.task.subtasks[found.index];
      if (!subtask || !(el instanceof HTMLInputElement)) {
        return;
      }
      const done = el.checked;
      subtask.done = done; // otimista
      renderContent();
      try {
        await api.updateSubtask(subtask.id, { done });
      } catch (error) {
        await loadTasks();
        renderContent();
        throw error;
      }
    }),

  "set-role": (el) =>
    run(async () => {
      if (!(el instanceof HTMLSelectElement)) {
        return;
      }
      try {
        await api.setRole(el.dataset["id"] ?? "", el.value as Role);
      } finally {
        state.profiles = await api.fetchProfiles();
        renderContent();
      }
    }),

  "open-comments": (el) =>
    run(async () => {
      const task = state.tasks.find((t) => t.id === el.dataset["id"]);
      if (!task) {
        return;
      }
      state.chatTaskId = task.id;
      state.comments = await api.fetchComments(task.id);
      openDialog(commentsDialog(task, state.comments));
      scrollChatToEnd();
      startChatPolling();
    }),

  "delete-comment": (el) =>
    run(async () => {
      if (!confirm("Apagar este comentário?")) {
        return;
      }
      await api.deleteComment(el.dataset["id"] ?? "");
      await refreshChat();
    }),

  "add-link": (el) => {
    const task = state.tasks.find((t) => t.id === el.dataset["id"]);
    if (task) {
      openDialog(linkDialog(task));
    }
  },

  "delete-link": (el) =>
    run(async () => {
      await api.deleteLink(el.dataset["id"] ?? "");
      await loadTasks();
      renderContent();
    }),

  "close-dialog": closeDialog,
};

// ---------- formulários ----------

async function submitAuth(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const email = field(data, "email").trim();
  const password = field(data, "password");
  if (state.authMode === "signup") {
    const loggedIn = await api.signUp(email, password, field(data, "name").trim());
    if (!loggedIn) {
      state.authMode = "signin";
      state.authMessage =
        "Conta criada! Se o e-mail exigir confirmação, confirme-o e depois entre. Um administrador precisará liberar seu acesso.";
      render();
    }
    return;
  }
  await api.signIn(email, password);
}

async function submitTask(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const id = form.dataset["id"] || null;
  const existing = id ? state.tasks.find((t) => t.id === id) : undefined;
  const start = field(data, "start_date") || null;
  const end = field(data, "end_date") || null;
  if (start && end && end < start) {
    formError(form, "A data de fim não pode ser anterior à de início.");
    return;
  }
  const input: TaskInput = {
    title: field(data, "title").trim(),
    description: field(data, "description").trim(),
    status: pick<Status>(STATUSES, field(data, "status"), "todo"),
    priority: pick<Priority>(PRIORITIES, field(data, "priority"), "medium"),
    start_date: start,
    end_date: end,
    assignee_id: data.has("assignee_id")
      ? field(data, "assignee_id") || null
      : (existing?.assignee_id ?? null),
  };
  if (!input.title) {
    formError(form, "Informe um título.");
    return;
  }
  await api.saveTask(id, input);
  closeDialog();
  await loadTasks();
  renderContent();
}

async function submitSubtask(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const id = form.dataset["id"] ?? "";
  const start = field(data, "start_date") || null;
  const end = field(data, "end_date") || null;
  if (start && end && end < start) {
    formError(form, "A data de fim não pode ser anterior à de início.");
    return;
  }
  const title = field(data, "title").trim();
  if (!title) {
    formError(form, "Informe um título.");
    return;
  }
  await api.updateSubtask(id, {
    title,
    start_date: start,
    end_date: end,
    done: data.has("done"),
    ...(data.has("assignee_id") ? { assignee_id: field(data, "assignee_id") || null } : {}),
  });
  closeDialog();
  await loadTasks();
  renderContent();
}

async function submitAddSub(form: HTMLFormElement): Promise<void> {
  const task = state.tasks.find((t) => t.id === form.dataset["task"]);
  const title = field(new FormData(form), "title").trim();
  if (!task || !title) {
    return;
  }
  let position = 0;
  for (const subtask of task.subtasks) {
    position = Math.max(position, subtask.position + 1);
  }
  await api.createSubtask(task.id, position, { title });
  await loadTasks();
  renderContent();
}

async function submitComment(form: HTMLFormElement): Promise<void> {
  const taskId = form.dataset["task"];
  const body = field(new FormData(form), "body").trim();
  if (!taskId || !body) {
    return;
  }
  await api.addComment(taskId, body);
  form.reset();
  await refreshChat(true);
}

async function submitLink(form: HTMLFormElement): Promise<void> {
  const taskId = form.dataset["task"];
  const data = new FormData(form);
  const url = normalizeUrl(field(data, "url"));
  if (!taskId) {
    return;
  }
  if (!url) {
    formError(form, "Informe um endereço válido (http ou https).");
    return;
  }
  await api.addLink(taskId, url, field(data, "title").trim());
  closeDialog();
  await loadTasks();
  renderContent();
}

const forms: Record<string, (form: HTMLFormElement) => Promise<void>> = {
  auth: submitAuth,
  task: submitTask,
  subtask: submitSubtask,
  "add-sub": submitAddSub,
  comment: submitComment,
  link: submitLink,
};

// ---------- ligação de eventos ----------

function setFilter(key: string, value: string | boolean): void {
  if (!FILTER_KEYS.includes(key)) {
    return;
  }
  Object.assign(state.filters, { [key]: value });
  savePrefs();
  renderContent();
}

export function bindEvents(): void {
  // Enter envia o comentário; Shift+Enter quebra a linha.
  document.addEventListener("keydown", (event) => {
    const el = event.target;
    if (
      el instanceof HTMLTextAreaElement &&
      el.hasAttribute("data-chat-input") &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      el.form?.requestSubmit();
    }
  });

  byId("dialog").addEventListener("close", stopChatPolling);

  document.addEventListener("click", (event) => {
    const el = (event.target as Element).closest<HTMLElement>("[data-action]");
    // checkboxes e selects são tratados no evento "change"
    if (!el || el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
      return;
    }
    const handler = actions[el.dataset["action"] ?? ""];
    if (handler) {
      void handler(el);
    }
  });

  document.addEventListener("change", (event) => {
    const el = (event.target as Element).closest<HTMLElement>("[data-action]");
    if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) {
      return;
    }
    const handler = actions[el.dataset["action"] ?? ""];
    if (handler) {
      void handler(el);
    }
  });

  document.addEventListener("input", (event) => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) {
      return;
    }
    const filter = el.dataset["filter"];
    if (filter) {
      setFilter(
        filter,
        el instanceof HTMLInputElement && el.type === "checkbox" ? el.checked : el.value,
      );
      return;
    }
    if (el.dataset["pref"] === "showSubtasks" && el instanceof HTMLInputElement) {
      state.showSubtasks = el.checked;
      savePrefs();
      renderContent();
    }
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }
    const handler = forms[form.dataset["form"] ?? ""];
    if (!handler) {
      return;
    }
    event.preventDefault();
    void run(() => handler(form));
  });

  // "toggle" não borbulha: captura para lembrar quais grupos de concluídas estão abertos.
  document.addEventListener(
    "toggle",
    (event) => {
      const el = event.target;
      if (el instanceof HTMLDetailsElement && el.classList.contains("report-details")) {
        const reportId = el.dataset["report"];
        if (reportId) {
          if (el.open) {
            state.openReports.add(reportId);
          } else {
            state.openReports.delete(reportId);
          }
        }
        return;
      }
      if (!(el instanceof HTMLDetailsElement) || !el.classList.contains("done-group")) {
        return;
      }
      const id = el.dataset["task"];
      if (id) {
        if (el.open) {
          state.openDone.add(id);
        } else {
          state.openDone.delete(id);
        }
      }
    },
    true,
  );
}
