import * as api from "./api";
import { PRIORITIES, ROLE_LABEL, ROLES, STATUSES } from "./labels";
import { SORT_KEYS, type SortKey } from "./lib/control";
import { JOURNAL_KINDS, MANUAL_KINDS, type JournalFilter } from "./lib/journal";
import { tasksToCsv } from "./lib/csv";
import { todayISO } from "./lib/dates";
import { DEFAULT_FILTERS, filterTasks } from "./lib/filters";
import type { Zoom } from "./lib/gantt";
import { normalizeUrl } from "./lib/links";
import { markMine, markSeen, reconcile } from "./lib/unread";
import { wouldCreateCycle } from "./lib/subtaskDates";
import { canManageUsers, canSeeReports, visibleTasks } from "./lib/permissions";
import { currentUser, loadRead, saveRead, savePrefs, state, type View } from "./state";
import { dashboardView, projectView } from "./ui/project";
import type { JournalKind, Priority, Role, Status, TaskInput } from "./types";
import { html, mount, type Safe } from "./ui/html";
import {
  chatMessages,
  currentTaskList,
  commentsDialog,
  accountDialog,
  confirmDialog,
  type ConfirmOptions,
  pendingBanner,
  ganttView,
  linkDialog,
  loginView,
  pendingView,
  reportPeopleIds,
  reportsView,
  setupView,
  shellView,
  subtaskDialog,
  summaryView,
  taskDialog,
  tasksView,
  toolbarView,
  userDialog,
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
  if (/different from the old password/i.test(message)) {
    return "A nova senha precisa ser diferente da atual.";
  }
  if (/password should be at least/i.test(message)) {
    return "A nova senha é curta demais.";
  }
  if (/weak password|password is known to be weak/i.test(message)) {
    return "Senha fraca: use letras, números e símbolos.";
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
        state.view === "users" || state.view === "reports" || state.view === "project"
          ? html``
          : toolbarView(state.view === "gantt" ? "gantt" : "tasks"),
      );
      renderContent();
      return;
  }
}

/** Atualiza resumo e conteúdo sem recriar a barra de filtros (preserva foco ao digitar). */
function renderContent(): void {
  mount(byId("alerts"), pendingBanner());
  mount(byId("summary"), state.view === "reports" ? summaryView(todayISO()) : html``);
  let content: Safe;
  if (state.view === "gantt") {
    content = ganttView();
  } else if (state.view === "reports") {
    content = reportsView();
  } else if (state.view === "users") {
    content = usersView();
  } else if (state.view === "dashboard") {
    content = dashboardView();
  } else if (state.view === "project") {
    content = projectView();
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

/** Ajusta o controle de comentários lidos ao que veio do banco. */
function syncRead(): void {
  if (state.me && reconcile(state.read, state.tasks)) {
    saveRead(state.me.id, state.read);
  }
}

async function loadTasks(): Promise<void> {
  const { tasks, extras, project } = await api.fetchTasks();
  state.tasks = visibleTasks(currentUser(), tasks);
  state.extras = extras;
  state.project = project;
  syncRead();
}

/** Diário de bordo do projeto aberto (o banco acrescenta registros a cada mudança). */
async function loadJournal(): Promise<void> {
  const taskId = state.projectId;
  if (state.view !== "project" || !taskId || !state.project) {
    return;
  }
  const entries = await api.fetchJournal(taskId);
  if (state.projectId === taskId) {
    state.journal = entries;
  }
}

/** Recarrega as tarefas (e o diário, se um projeto estiver aberto) e redesenha. */
async function reload(): Promise<void> {
  await loadTasks();
  await loadJournal();
  renderContent();
}

async function loadAll(): Promise<void> {
  const [loaded, profiles] = await Promise.all([api.fetchTasks(), api.fetchProfiles()]);
  state.tasks = visibleTasks(currentUser(), loaded.tasks);
  state.extras = loaded.extras;
  state.project = loaded.project;
  state.profiles = profiles;
  syncRead();
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
    state.read = loadRead(profile.id);
    if (profile.role === "pending") {
      state.screen = "pending";
      render();
      return;
    }
    await loadAll();
    await loadJournal();
    if (state.view === "users" && !canManageUsers(profile)) {
      state.view = "tasks";
    }
    if (state.view === "reports" && !canSeeReports(profile)) {
      state.view = "tasks";
    }
    if (profile.role === "user") {
      // o usuário já vê o próprio relatório e o detalhamento abertos
      state.openPeople.add(profile.id);
      state.openReports.add(profile.id);
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

/** Popup de confirmação no visual do site (fica por cima de qualquer diálogo aberto). */
function askConfirm(options: ConfirmOptions): Promise<boolean> {
  const dialog = byId("confirm") as HTMLDialogElement;
  mount(dialog, confirmDialog(options));
  dialog.returnValue = "";
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), { once: true });
    dialog.showModal();
  });
}

function confirmDelete(subject: string, title: string, message: string): Promise<boolean> {
  return askConfirm({ title, subject, message, confirmLabel: "Excluir", tone: "danger" });
}

function confirmDone(kind: "tarefa" | "subtarefa", title: string): Promise<boolean> {
  return askConfirm({
    title: kind === "tarefa" ? "Concluir tarefa?" : "Concluir subtarefa?",
    subject: title,
    message: "Ela será marcada como concluída. Você pode reabri-la depois.",
    confirmLabel: "Concluir",
  });
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
  markSeen(state.read, taskId, fresh.length); // conversa aberta: tudo o que chega já está visto
  if (state.me) {
    saveRead(state.me.id, state.read);
  }
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

// ---------- atualização em segundo plano ----------

const BACKGROUND_REFRESH_MS = 60_000;

/** Só atualiza quando não atrapalha: aba visível, sem diálogo aberto e sem digitação em curso. */
async function backgroundRefresh(): Promise<void> {
  if (state.screen !== "main" || document.hidden || state.chatTaskId !== null) {
    return;
  }
  const typing = document.activeElement;
  if (
    typing instanceof HTMLInputElement ||
    typing instanceof HTMLTextAreaElement ||
    typing instanceof HTMLSelectElement
  ) {
    return;
  }
  for (const id of ["dialog", "confirm"]) {
    if ((document.getElementById(id) as HTMLDialogElement | null)?.open) {
      return;
    }
  }
  try {
    const before = JSON.stringify([state.tasks, state.journal]);
    await loadTasks();
    await loadJournal();
    // O administrador também precisa ver quem acabou de se cadastrar.
    if (state.me && canManageUsers(state.me)) {
      const profiles = await api.fetchProfiles();
      if (JSON.stringify(profiles) !== JSON.stringify(state.profiles)) {
        state.profiles = profiles;
        render(); // o contador da aba Usuários fica no topo
        return;
      }
    }
    if (JSON.stringify([state.tasks, state.journal]) !== before) {
      renderContent();
    }
  } catch {
    // sem rede ou sessão expirada: tenta de novo no próximo ciclo
  }
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
    state.projectId = null;
    state.journal = [];
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

  "toggle-task": (el) => {
    const id = el.dataset["id"];
    if (!id) {
      return;
    }
    if (state.openTasks.has(id)) {
      state.openTasks.delete(id);
    } else {
      state.openTasks.add(id);
    }
    renderContent();
  },

  "toggle-person": (el) => {
    const id = el.dataset["id"];
    if (!id) {
      return;
    }
    if (state.openPeople.has(id)) {
      state.openPeople.delete(id);
    } else {
      state.openPeople.add(id);
    }
    renderContent();
  },

  "toggle-all-people": () => {
    const ids = reportPeopleIds();
    const allOpen = ids.every((id) => state.openPeople.has(id));
    for (const id of ids) {
      if (allOpen) {
        state.openPeople.delete(id);
      } else {
        state.openPeople.add(id);
      }
    }
    renderContent();
  },

  "toggle-all": () => {
    const visible = currentTaskList();
    const allOpen = visible.every((t) => state.openTasks.has(t.id));
    for (const task of visible) {
      if (allOpen) {
        state.openTasks.delete(task.id);
      } else {
        state.openTasks.add(task.id);
      }
    }
    renderContent();
  },

  "set-list": (el) => {
    state.taskList = el.dataset["list"] === "archived" ? "archived" : "active";
    renderContent();
  },

  "complete-task": (el) =>
    run(async () => {
      const task = state.tasks.find((t) => t.id === el.dataset["id"]);
      if (!task || !(await confirmDone("tarefa", task.title))) {
        return;
      }
      await api.completeTask(task.id);
      await reload();
    }),

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
      const extra =
        task.subtasks.length > 0
          ? ` As ${task.subtasks.length} subtarefas dela também serão excluídas.`
          : "";
      if (
        !(await confirmDelete(
          task.title,
          "Excluir tarefa?",
          `Esta ação não pode ser desfeita.${extra}`,
        ))
      ) {
        return;
      }
      await api.deleteTask(task.id);
      if (state.view === "project") {
        leaveProject();
      }
      await reload();
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
      if (
        !(await confirmDelete(
          subtask.title,
          "Excluir subtarefa?",
          "Esta ação não pode ser desfeita.",
        ))
      ) {
        return;
      }
      await api.deleteSubtask(subtask.id);
      await reload();
    }),

  "toggle-sub": (el) =>
    run(async () => {
      const found = findSubtask(el.dataset["id"] ?? "");
      const subtask = found?.task.subtasks[found.index];
      if (!subtask || !(el instanceof HTMLInputElement)) {
        return;
      }
      const done = el.checked;
      if (done && !(await confirmDone("subtarefa", subtask.title))) {
        el.checked = false;
        return;
      }
      subtask.done = done; // otimista
      renderContent();
      try {
        await api.updateSubtask(subtask.id, { done });
        if (state.view === "project") {
          await reload(); // traz o registro automático do diário
        }
      } catch (error) {
        await reload();
        throw error;
      }
    }),

  account: () => openDialog(accountDialog()),

  "approve-user": (el) =>
    run(async () => {
      const person = state.profiles.find((p) => p.id === el.dataset["id"]);
      if (!person) {
        return;
      }
      const role = pick<Role>(["user", "viewer", "admin"], el.dataset["role"] ?? "", "user");
      await api.updateProfile(person.id, { name: person.name || person.email, role });
      state.profiles = await api.fetchProfiles();
      render();
      toast(`${person.name || person.email} aprovado(a) como ${ROLE_LABEL[role]}.`, "ok");
    }),

  "edit-user": (el) => {
    const person = state.profiles.find((p) => p.id === el.dataset["id"]);
    if (person) {
      openDialog(userDialog(person));
    }
  },

  "delete-user": (el) =>
    run(async () => {
      const person = state.profiles.find((p) => p.id === el.dataset["id"]);
      if (!person) {
        return;
      }
      const label = person.name || person.email;
      if (
        !(await confirmDelete(
          label,
          "Excluir usuário?",
          "O acesso dele é removido e as tarefas atribuídas a ele ficam sem responsável. Esta ação não pode ser desfeita.",
        ))
      ) {
        return;
      }
      await api.deleteUser(person.id);
      closeDialog();
      await loadAll();
      render(); // atualiza também o contador de pendentes no topo
    }),

  "open-comments": (el) =>
    run(async () => {
      const task = state.tasks.find((t) => t.id === el.dataset["id"]);
      if (!task) {
        return;
      }
      state.chatTaskId = task.id;
      state.comments = await api.fetchComments(task.id);
      markSeen(state.read, task.id, state.comments.length);
      saveRead(currentUser().id, state.read);
      openDialog(commentsDialog(task, state.comments));
      scrollChatToEnd();
      startChatPolling();
    }),

  "delete-comment": (el) =>
    run(async () => {
      const comment = state.comments.find((c) => c.id === el.dataset["id"]);
      const excerpt = comment ? comment.body.slice(0, 80) : "";
      if (
        !(await askConfirm({
          title: "Apagar comentário?",
          subject: excerpt,
          message: "Esta ação não pode ser desfeita.",
          confirmLabel: "Apagar",
          tone: "danger",
        }))
      ) {
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
      await reload();
    }),

  // Início vinculado ao término de outra subtarefa: trava o campo de data de início.
  "link-start": (el) => {
    const start = el.closest("form")?.querySelector<HTMLInputElement>('input[name="start_date"]');
    if (start && el instanceof HTMLSelectElement) {
      start.readOnly = el.value !== "";
    }
  },

  "open-project": (el) =>
    run(async () => {
      const id = el.dataset["id"];
      if (!id) {
        return;
      }
      if (state.view !== "project") {
        state.projectBack = state.view;
        history.pushState({ project: id }, "");
      }
      state.projectId = id;
      state.journal = [];
      state.journalFilter = "all";
      state.view = "project";
      closeDialog();
      render();
      window.scrollTo({ top: 0 });
      await loadJournal();
      renderContent();
    }),

  back: () => {
    if ((history.state as { project?: string } | null)?.project) {
      history.back(); // o "popstate" chama leaveProject
      return;
    }
    leaveProject();
  },

  "set-layout": (el) => {
    state.dashLayout = el.dataset["layout"] === "list" ? "list" : "cards";
    savePrefs();
    renderContent();
  },

  "set-scope": (el) => {
    state.dashScope = el.dataset["scope"] === "all" ? "all" : "open";
    savePrefs();
    renderContent();
  },

  "journal-filter": (el) => {
    const kind = el.dataset["kind"] ?? "all";
    state.journalFilter = pick<JournalFilter>(["all", "manual", ...JOURNAL_KINDS], kind, "all");
    renderContent();
  },

  "delete-expense": (el) =>
    run(async () => {
      const task = state.tasks.find((t) => t.id === state.projectId);
      const expense = task?.expenses?.find((e) => e.id === el.dataset["id"]);
      if (!expense) {
        return;
      }
      if (
        !(await confirmDelete(
          expense.description,
          "Remover despesa?",
          "O valor deixa de contar no realizado. A remoção fica registrada no diário de bordo.",
        ))
      ) {
        return;
      }
      await api.deleteExpense(expense.id);
      await reload();
    }),

  "delete-journal": (el) =>
    run(async () => {
      const entry = state.journal.find((j) => j.id === el.dataset["id"]);
      if (!entry) {
        return;
      }
      if (
        !(await confirmDelete(
          entry.body.slice(0, 80),
          "Apagar registro do diário?",
          "Esta ação não pode ser desfeita.",
        ))
      ) {
        return;
      }
      await api.deleteJournal(entry.id);
      await loadJournal();
      renderContent();
    }),

  "close-dialog": closeDialog,
};

/** Sai da página do projeto para a aba de onde ela foi aberta. */
function leaveProject(): void {
  if (state.view !== "project") {
    return;
  }
  state.view = state.projectBack;
  state.projectId = null;
  state.journal = [];
  render();
}

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
        "Conta criada! Agora é só entrar e aguardar: um administrador precisará liberar seu acesso.";
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
  if (state.project) {
    const budgetText = field(data, "budget").trim().replace(",", ".");
    const budget = budgetText === "" ? null : Number(budgetText);
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
      formError(form, "Informe um orçamento válido (zero ou mais).");
      return;
    }
    input.scope = field(data, "scope").trim();
    input.success_criteria = field(data, "success_criteria").trim();
    input.budget = budget;
    if (data.has("reset_baseline")) {
      input.baseline_start = start;
      input.baseline_end = end;
    }
  }
  if (!input.title) {
    formError(form, "Informe um título.");
    return;
  }
  if (input.status === "done" && existing?.status !== "done") {
    if (!(await confirmDone("tarefa", input.title))) {
      return;
    }
  }
  await api.saveTask(id, input);
  closeDialog();
  await reload();
}

async function submitSubtask(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const id = form.dataset["id"] ?? "";
  const start = field(data, "start_date") || null;
  const end = field(data, "end_date") || null;
  const found = findSubtask(id);
  const after = field(data, "start_after_id") || null;
  // Com início vinculado, a data de início digitada é ignorada (não há o que comparar).
  if (!after && start && end && end < start) {
    formError(form, "A data de fim não pode ser anterior à de início.");
    return;
  }
  if (found && after && wouldCreateCycle(found.task.subtasks, id, after)) {
    formError(form, "Essa escolha criaria um ciclo entre subtarefas.");
    return;
  }
  const title = field(data, "title").trim();
  if (!title) {
    formError(form, "Informe um título.");
    return;
  }
  const current = found?.task.subtasks[found.index];
  const before = current?.start_after_id ?? null;
  if (data.has("done") && !current?.done && !(await confirmDone("subtarefa", title))) {
    return;
  }
  await api.updateSubtask(id, {
    title,
    start_date: start,
    end_date: end,
    // só envia quando muda: sem a migração 005 a coluna não existe e o restante ainda salva
    ...(after === before ? {} : { start_after_id: after }),
    done: data.has("done"),
    ...(data.has("assignee_id") ? { assignee_id: field(data, "assignee_id") || null } : {}),
  });
  closeDialog();
  await reload();
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
  await reload();
}

async function submitComment(form: HTMLFormElement): Promise<void> {
  const taskId = form.dataset["task"];
  const body = field(new FormData(form), "body").trim();
  if (!taskId || !body) {
    return;
  }
  await api.addComment(taskId, body);
  markMine(state.read, taskId);
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
  await reload();
}

async function submitUser(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const id = form.dataset["id"] ?? "";
  const person = state.profiles.find((p) => p.id === id);
  if (!person) {
    return;
  }
  const name = field(data, "name").trim();
  if (!name) {
    formError(form, "Informe um nome.");
    return;
  }
  const role = pick<Role>(ROLES, field(data, "role"), person.role);
  await api.updateProfile(id, { name, role });
  closeDialog();
  state.profiles = await api.fetchProfiles();
  render(); // atualiza também o contador de pendentes no topo
}

async function submitExpense(form: HTMLFormElement): Promise<void> {
  const taskId = form.dataset["task"];
  const data = new FormData(form);
  const description = field(data, "description").trim();
  const amount = Number(field(data, "amount").replace(",", "."));
  const spentOn = field(data, "spent_on") || todayISO();
  if (!taskId) {
    return;
  }
  if (!description) {
    formError(form, "Descreva a despesa.");
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    formError(form, "Informe um valor maior que zero.");
    return;
  }
  await api.addExpense(taskId, {
    description,
    amount: Math.round(amount * 100) / 100,
    spent_on: spentOn,
  });
  await reload();
}

async function submitJournal(form: HTMLFormElement): Promise<void> {
  const taskId = form.dataset["task"];
  const data = new FormData(form);
  const body = field(data, "body").trim();
  const kind = pick<JournalKind>(MANUAL_KINDS, field(data, "kind"), "note");
  if (!taskId || !body) {
    return;
  }
  await api.addJournal(taskId, kind, body);
  form.reset();
  await loadJournal();
  renderContent();
}

async function submitPassword(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const current = field(data, "current");
  const next = field(data, "password");
  if (next.length < 8) {
    formError(form, "A nova senha precisa ter pelo menos 8 caracteres.");
    return;
  }
  if (next !== field(data, "confirm")) {
    formError(form, "A confirmação não é igual à nova senha.");
    return;
  }
  if (next === current) {
    formError(form, "A nova senha precisa ser diferente da atual.");
    return;
  }
  try {
    await api.changePassword(currentUser().email, current, next);
  } catch (error) {
    formError(form, friendly(error instanceof Error ? error.message : String(error)));
    return;
  }
  closeDialog();
  toast("Senha alterada com sucesso.", "ok");
}

const forms: Record<string, (form: HTMLFormElement) => Promise<void>> = {
  auth: submitAuth,
  task: submitTask,
  subtask: submitSubtask,
  "add-sub": submitAddSub,
  comment: submitComment,
  link: submitLink,
  user: submitUser,
  expense: submitExpense,
  password: submitPassword,
  journal: submitJournal,
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

  // Ao fechar a conversa, o aviso de "novos" do topo é atualizado.
  byId("dialog").addEventListener("close", () => {
    const wasChat = state.chatTaskId !== null;
    stopChatPolling();
    if (wasChat && state.screen === "main") {
      renderContent();
    }
  });

  // Voltar do navegador/celular fecha a página do projeto.
  window.addEventListener("popstate", leaveProject);

  // Atualização em segundo plano: traz comentários novos de outras pessoas sem recarregar a página.
  setInterval(() => void backgroundRefresh(), BACKGROUND_REFRESH_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void backgroundRefresh();
    }
  });

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
    if (el.dataset["pref"] === "dashSort") {
      state.dashSort = pick<SortKey>(SORT_KEYS, el.value, "deadline");
      savePrefs();
      renderContent();
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
