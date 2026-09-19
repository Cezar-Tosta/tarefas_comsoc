import logoLarge from "../assets/logo-384.png";
import logoSmall from "../assets/logo-96.png";
import { PRIORITIES, PRIORITY_LABEL, ROLE_LABEL, ROLES, STATUS_LABEL, STATUSES } from "../labels";
import { formatBR, formatDateTimeBR, todayISO } from "../lib/dates";
import { hostLabel, isHttpUrl } from "../lib/links";
import { filterTasks } from "../lib/filters";
import { computeMetrics, metricsScope } from "../lib/metrics";
import { percentOf, pieShapes } from "../lib/pie";
import { resolveSubtaskDates, wouldCreateCycle } from "../lib/subtaskDates";
import {
  buildPersonReport,
  buildTeamReport,
  type Deadline,
  deadlineCountdown,
  deadlineInfo,
  deadlineLabel,
  type NestedLine,
  nestLines,
  type PersonReport,
} from "../lib/reports";
import {
  barGeometry,
  buildGanttItems,
  buildScale,
  computeRange,
  PX_PER_DAY,
  type Zoom,
} from "../lib/gantt";
import {
  canAssign,
  canComment,
  canCreateTask,
  canDeleteComment,
  canDeleteTask,
  canEditTask,
  canManageLinks,
  canManageSubtasks,
  canManageUsers,
  canSeeReports,
  canToggleSubtask,
} from "../lib/permissions";
import { effectiveStatus, isOverdue, splitSubtasks, taskProgress } from "../lib/progress";
import { currentUser, state, type View } from "../state";
import type { Comment, Profile, Subtask, Task, TaskLink } from "../types";
import { html, raw, type Safe } from "./html";
import { linkify } from "./linkify";

/** Logo grande das telas de acesso (substitui o título em texto). */
function brandHero(): Safe {
  return html`<h1 class="brand-hero">
    <img src="${logoLarge}" alt="Tarefas COMSOC" width="168" height="168" />
  </h1>`;
}

function emptyMessage(me: Profile): string {
  if (me.role === "user") {
    return "Você ainda não tem tarefas atribuídas. Quando um administrador atribuir uma tarefa ou subtarefa a você, ela aparecerá aqui.";
  }
  return canCreateTask(me)
    ? "Nenhuma tarefa cadastrada ainda. Na aba Tarefas, use “+ Nova tarefa” para começar."
    : "Nenhuma tarefa cadastrada ainda.";
}

function personName(id: string | null): string {
  if (!id) {
    return "Sem responsável";
  }
  const person = state.profiles.find((p) => p.id === id);
  return person ? person.name || person.email : "Usuário removido";
}

function period(start: string | null, end: string | null): string {
  if (!start && !end) {
    return "Sem datas";
  }
  return `${formatBR(start)} → ${formatBR(end)}`;
}

function activePeople(): Profile[] {
  return state.profiles.filter((p) => p.role === "admin" || p.role === "user");
}

// ---------- telas de acesso ----------

export function setupView(): Safe {
  return html`<main class="auth">
    <section class="panel">
      ${brandHero()}
      <p>O Supabase ainda não foi configurado neste build.</p>
      <ol>
        <li>Crie um projeto em supabase.com e execute <code>supabase/schema.sql</code>.</li>
        <li>
          Copie <code>.env.example</code> para <code>.env.local</code> e preencha
          <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code>.
        </li>
        <li>
          Para o GitHub Pages, cadastre as mesmas duas chaves como <em>variables</em> do
          repositório.
        </li>
      </ol>
      <p>Detalhes no <code>README.md</code>.</p>
    </section>
  </main>`;
}

export function loginView(): Safe {
  const signup = state.authMode === "signup";
  return html`<main class="auth">
    <section class="panel">
      ${brandHero()}
      <p class="muted center">${signup ? "Crie sua conta" : "Entre para continuar"}</p>
      <form data-form="auth" class="stack">
        ${
          signup &&
          html`<label
            >Nome
            <input name="name" required maxlength="80" autocomplete="name" />
          </label>`
        }
        <label
          >E-mail
          <input name="email" type="email" required autocomplete="email" />
        </label>
        <label
          >Senha
          <input
            name="password"
            type="password"
            required
            minlength="8"
            autocomplete="${signup ? "new-password" : "current-password"}"
          />
        </label>
        ${state.authMessage && html`<p class="notice" role="status">${state.authMessage}</p>`}
        <button class="btn primary" type="submit">${signup ? "Criar conta" : "Entrar"}</button>
      </form>
      <p class="muted center">
        ${signup ? "Já tem conta?" : "Ainda não tem conta?"}
        <button class="link" data-action="toggle-auth" type="button">
          ${signup ? "Entrar" : "Cadastre-se"}
        </button>
      </p>
    </section>
  </main>`;
}

export function pendingView(): Safe {
  const me = currentUser();
  return html`<main class="auth">
    <section class="panel">
      <img class="brand-hero" src="${logoLarge}" alt="" width="120" height="120" />
      <h1>Aguardando aprovação</h1>
      <p>
        Olá, <strong>${me.name || me.email}</strong>. Sua conta foi criada, mas um administrador
        precisa liberar o acesso e definir seu perfil.
      </p>
      <div class="row">
        <button class="btn" data-action="refresh" type="button">Verificar novamente</button>
        <button class="btn" data-action="logout" type="button">Sair</button>
      </div>
    </section>
  </main>`;
}

// ---------- estrutura principal ----------

function navTab(view: View, label: string): Safe {
  const active = state.view === view;
  return html`<button
    class="tab"
    type="button"
    data-action="nav"
    data-view="${view}"
    ${active && raw('aria-current="page"')}
  >
    ${label}
  </button>`;
}

export function shellView(): Safe {
  const me = currentUser();
  return html`<div class="app">
    <header class="topbar">
      <h1 class="brand"><img src="${logoSmall}" alt="Tarefas COMSOC" width="44" height="44" /></h1>
      <nav class="tabs" aria-label="Seções">
        ${navTab("tasks", "Tarefas")} ${navTab("gantt", "Gantt")}
        ${canSeeReports(me) && navTab("reports", "Relatório")}
        ${canManageUsers(me) && navTab("users", "Usuários")}
      </nav>
      <div class="who">
        <span class="who-name">${me.name || me.email}</span>
        <span class="badge role-${me.role}">${ROLE_LABEL[me.role]}</span>
        <button class="btn small" type="button" data-action="logout">Sair</button>
      </div>
    </header>
    <main class="page">
      <section id="summary" aria-label="Resumo"></section>
      <section id="toolbar" aria-label="Filtros"></section>
      <section id="content"></section>
    </main>
  </div>`;
}

/** `total` (opcional): mostra ao lado do número quanto ele representa do total. */
function card(label: string, value: number, tone = "", total?: number): Safe {
  const pct =
    total !== undefined && html`<small class="stat-pct">${percentOf(value, total)}%</small>`;
  return html`<div class="stat ${tone}">
    <span class="stat-value">${value}${pct}</span><span class="stat-label">${label}</span>
  </div>`;
}

function opt(value: string, label: string, current: string): Safe {
  return html`<option value="${value}" ${value === current && raw("selected")}>${label}</option>`;
}

function cells(list: { label: string; left: number; width: number }[]): Safe {
  return html`${list.map((c) => html`<span class="g-cell" style="left:${c.left}px;width:${c.width}px">${c.label}</span>`)}`;
}

export function summaryView(today: string): Safe {
  const me = currentUser();
  const scope = metricsScope(me, state.tasks);
  if (scope === null) {
    return html``;
  }
  const m = computeMetrics(scope, today);
  const title = me.role === "admin" ? "Visão geral" : "Minhas tarefas";
  return html`<h2 class="section-title">${title}</h2>
    <div class="stats">
      ${card(me.role === "admin" ? "Tarefas" : "Minhas tarefas", m.total)}
      ${card("Em andamento", m.doing, "", m.total)} ${card("Concluídas", m.done, "ok", m.total)}
      ${card("Atrasadas", m.late, m.late > 0 ? "bad" : "", m.total)}
      <div class="stat wide">
        <span class="stat-value">${m.overall}%</span>
        <span class="stat-label">Progresso ${me.role === "admin" ? "geral" : "das minhas tarefas"}</span>
        ${progressBar(m.overall)}
      </div>
    </div>`;
}

/**
 * Na aba Gantt (`mode = "gantt"`) só há os filtros básicos: sem "Nova tarefa", "Exportar CSV" e
 * "Atualizar", e "Ocultar concluídas" fica junto dos controles do próprio Gantt.
 */
export function toolbarView(mode: "tasks" | "gantt" = "tasks"): Safe {
  const me = currentUser();
  const f = state.filters;
  const gantt = mode === "gantt";
  const active = activeFilterCount(f, !gantt);
  return html`<div class="toolbar">
    <div class="toolbar-top">
      <label class="field grow"
        >Buscar
        <input
          type="search"
          data-filter="q"
          value="${f.q}"
          placeholder="Título, descrição ou subtarefa"
        />
      </label>
      <button
        class="btn filters-toggle"
        type="button"
        data-action="toggle-filters"
        aria-expanded="${String(state.filtersOpen)}"
        aria-controls="filters-panel"
      >
        Filtros${active > 0 && html` <span class="count-pill">${active}</span>`}
      </button>
    </div>
    <div id="filters-panel" class="filters-panel ${state.filtersOpen && "open"}">
      <label class="field"
        >Status
        <select data-filter="status">
          ${opt("all", "Todos", f.status)} ${STATUSES.map((s) => opt(s, STATUS_LABEL[s], f.status))}
          ${opt("overdue", "Atrasadas", f.status)}
        </select>
      </label>
      <label class="field"
        >Responsável
        <select data-filter="assignee">
          ${opt("all", "Todos", f.assignee)} ${opt("none", "Sem responsável", f.assignee)}
          ${activePeople().map((p) => opt(p.id, p.name || p.email, f.assignee))}
        </select>
      </label>
      <label class="field"
        >Prioridade
        <select data-filter="priority">
          ${opt("all", "Todas", f.priority)}
          ${PRIORITIES.map((p) => opt(p, PRIORITY_LABEL[p], f.priority))}
        </select>
      </label>
      <label class="field"
        >De
        <input type="date" data-filter="from" value="${f.from}" />
      </label>
      <label class="field"
        >Até
        <input type="date" data-filter="to" value="${f.to}" />
      </label>
      ${
        !gantt &&
        html`<label class="check">
          <input type="checkbox" data-filter="hideDone" ${f.hideDone && raw("checked")} />
          Ocultar concluídas
        </label>`
      }
      <button class="btn small" type="button" data-action="reset-filters">Limpar filtros</button>
    </div>
    ${
      !gantt &&
      html`<div class="toolbar-actions">
        ${
          canCreateTask(me) &&
          html`<button class="btn primary" type="button" data-action="new-task">
            + Nova tarefa
          </button>`
        }
        <button class="btn" type="button" data-action="export-csv">Exportar CSV</button>
        <button class="btn" type="button" data-action="refresh" title="Recarregar dados">
          Atualizar
        </button>
      </div>`
    }
  </div>`;
}

/** Quantos filtros (além da busca) estão ativos: aparece no botão "Filtros" do celular. */
function activeFilterCount(f: typeof state.filters, withHideDone: boolean): number {
  let count = 0;
  for (const changed of [
    f.status !== "all",
    f.assignee !== "all",
    f.priority !== "all",
    f.from !== "",
    f.to !== "",
    withHideDone && f.hideDone,
  ]) {
    if (changed) {
      count++;
    }
  }
  return count;
}

// ---------- lista de tarefas ----------

function progressBar(percent: number): Safe {
  return html`<div
    class="progress"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow="${percent}"
  >
    <div class="progress-fill" style="width:${percent}%"></div>
  </div>`;
}

function subtaskRow(me: Profile, task: Task, subtask: Subtask): Safe {
  const canToggle = canToggleSubtask(me, task, subtask);
  const canRemove = canManageSubtasks(me, task);
  const dates = resolveSubtaskDates(subtask, task.subtasks);
  const late = !subtask.done && dates.end !== null && dates.end < todayISO();
  // Usuários comuns veem só o essencial: sem datas nem vínculo de início.
  const compact = me.role === "user";
  const predecessor = subtask.start_after_id
    ? task.subtasks.find((s) => s.id === subtask.start_after_id)
    : undefined;
  return html`<li class="sub ${subtask.done && "is-done"}">
    <label class="sub-main">
      <input
        type="checkbox"
        data-action="toggle-sub"
        data-id="${subtask.id}"
        ${subtask.done && raw("checked")}
        ${!canToggle && raw("disabled")}
      />
      <span class="sub-title">${subtask.title}</span>
    </label>
    <span class="sub-meta">
      ${subtask.assignee_id && html`<span class="chip">${personName(subtask.assignee_id)}</span>`}
      ${
        !compact &&
        predecessor &&
        html`<span class="chip" title="Começa no dia seguinte ao término de “${predecessor.title}”"
          >↳ após ${predecessor.title}</span
        >`
      }
      ${
        !compact &&
        (dates.start || dates.end) &&
        html`<span class="chip ${late && "late"}">${period(dates.start, dates.end)}</span>`
      }
    </span>
    <span class="sub-actions">
      ${
        canToggle &&
        html`<button
          class="icon"
          type="button"
          data-action="edit-sub"
          data-id="${subtask.id}"
          aria-label="Editar subtarefa"
          title="Editar"
        >
          ✎
        </button>`
      }
      ${
        canRemove &&
        html`<button
          class="icon danger"
          type="button"
          data-action="delete-sub"
          data-id="${subtask.id}"
          aria-label="Excluir subtarefa"
          title="Excluir"
        >
          ✕
        </button>`
      }
    </span>
  </li>`;
}

function linkChip(link: TaskLink, removable: boolean): Safe {
  const label = link.title || hostLabel(link.url);
  return html`<span class="link-chip">
    ${
      isHttpUrl(link.url)
        ? html`<a href="${link.url}" target="_blank" rel="noopener noreferrer" title="${link.url}"
            >${label}</a
          >`
        : html`<span>${label}</span>`
    }
    ${
      removable &&
      html`<button
        class="icon"
        type="button"
        data-action="delete-link"
        data-id="${link.id}"
        aria-label="Remover link ${label}"
        title="Remover link"
      >
        ✕
      </button>`
    }
  </span>`;
}

/** Interruptor "Encolher tudo / Expandir tudo" das abas Tarefas e Relatório. */
function expandSwitch(action: string, allOpen: boolean, label: string): Safe {
  return html`<div class="switch-row">
    <span class="${!allOpen && "on"}">Encolher tudo</span>
    <button
      class="switch"
      type="button"
      role="switch"
      data-action="${action}"
      aria-checked="${String(allOpen)}"
      aria-label="${label}"
    >
      <span class="switch-knob"></span>
    </button>
    <span class="${allOpen && "on"}">Expandir tudo</span>
  </div>`;
}

/** Título clicável de um card encolhível. */
function cardTitle(
  action: string,
  id: string,
  expanded: boolean,
  text: string,
  extra: Safe | false = false,
): Safe {
  return html`<h2>
    <button
      class="card-toggle"
      type="button"
      data-action="${action}"
      data-id="${id}"
      aria-expanded="${String(expanded)}"
    >
      <span class="chevron" aria-hidden="true"></span><span>${text}</span>${extra}
    </button>
  </h2>`;
}

/** "Faltam 3 dias" / "Atrasada há 2 dias" / "HOJE", com a cor da urgência. */
function countdownChip(deadline: Deadline): Safe | false {
  const text = deadlineCountdown(deadline);
  if (text === null) {
    return false;
  }
  const { kind, days } = deadline;
  const tone = kind === "upcoming" && days <= 3 ? "soon" : kind;
  return html`<span class="deadline dl-${tone}">${text}</span>`;
}

function taskCard(me: Profile, task: Task): Safe {
  const status = effectiveStatus(task);
  const percent = taskProgress(task);
  const late = isOverdue(task, todayISO());
  const { open, done } = splitSubtasks(task.subtasks);
  const showDoneGroup = done.length > 0 && !state.filters.hideDone;
  const canEdit = canEditTask(me, task);
  const canAddSub = canManageSubtasks(me, task);
  const expanded = state.openTasks.has(task.id);
  const chip = countdownChip(deadlineInfo(task.end_date, status === "done", todayISO()));
  const title = cardTitle("toggle-task", task.id, expanded, task.title, chip);
  if (!expanded) {
    return html`<article class="card is-collapsed status-${status} ${late && "is-late"}">
      ${title}
    </article>`;
  }
  return html`<article class="card status-${status} ${late && "is-late"}">
    <header class="card-head">
      <div class="card-title">
        ${title}
        <div class="badges">
          <span class="badge st-${status}">${STATUS_LABEL[status]}</span>
          <span class="badge pr-${task.priority}"
            >Prioridade ${PRIORITY_LABEL[task.priority].toLowerCase()}</span
          >
          ${late && html`<span class="badge late">Atrasada</span>`}
        </div>
      </div>
      <div class="card-actions">
        ${
          state.extras &&
          html`<button
            class="btn small"
            type="button"
            data-action="open-comments"
            data-id="${task.id}"
          >
            Comentários${
              task.comment_count > 0 && html` <span class="count-pill">${task.comment_count}</span>`
            }
          </button>`
        }
        ${
          canEdit &&
          html`<button class="btn small" type="button" data-action="edit-task" data-id="${task.id}">
            Editar
          </button>`
        }
        ${
          canDeleteTask(me) &&
          html`<button
            class="btn small danger"
            type="button"
            data-action="delete-task"
            data-id="${task.id}"
          >
            Excluir
          </button>`
        }
      </div>
    </header>
    ${task.description && html`<p class="desc">${linkify(task.description)}</p>`}
    ${
      state.extras &&
      (task.links.length > 0 || canManageLinks(me, task)) &&
      html`<div class="links">
        ${task.links.map((link) => linkChip(link, canManageLinks(me, task)))}
        ${
          canManageLinks(me, task) &&
          html`<button class="chip-btn" type="button" data-action="add-link" data-id="${task.id}">
            + Link
          </button>`
        }
      </div>`
    }
    <dl class="meta">
      <div>
        <dt>Responsável</dt>
        <dd>${personName(task.assignee_id)}</dd>
      </div>
      <div>
        <dt>Período</dt>
        <dd>${period(task.start_date, task.end_date)}</dd>
      </div>
    </dl>
    <div class="progress-row">
      ${progressBar(percent)}
      <span class="progress-label">
        <strong>${percent}%</strong>
        ${task.subtasks.length > 0 && html` · ${done.length}/${task.subtasks.length} subtarefas`}
      </span>
    </div>
    ${
      open.length > 0 &&
      html`<ul class="subs">
        ${open.map((s) => subtaskRow(me, task, s))}
      </ul>`
    }
    ${
      canAddSub &&
      html`<form class="inline-add" data-form="add-sub" data-task="${task.id}">
        <input
          name="title"
          required
          maxlength="200"
          placeholder="Nova subtarefa…"
          aria-label="Nova subtarefa"
        />
        <button class="btn small" type="submit">Adicionar</button>
      </form>`
    }
    ${
      showDoneGroup &&
      html`<details
        class="done-group"
        data-task="${task.id}"
        ${state.openDone.has(task.id) && raw("open")}
      >
        <summary>Concluídas (${done.length})</summary>
        <ul class="subs">
          ${done.map((s) => subtaskRow(me, task, s))}
        </ul>
      </details>`
    }
  </article>`;
}

export function tasksView(): Safe {
  const me = currentUser();
  const visible = filterTasks(state.tasks, state.filters, todayISO());
  if (state.tasks.length === 0) {
    return html`<p class="empty">${emptyMessage(me)}</p>`;
  }
  const allOpen = visible.length > 0 && visible.every((t) => state.openTasks.has(t.id));
  return html`<div class="tasks-bar">
      <p class="count">${visible.length} de ${state.tasks.length} tarefas</p>
      ${visible.length > 0 && expandSwitch("toggle-all", allOpen, "Expandir todas as tarefas")}
    </div>
    ${
      visible.length === 0
        ? html`<p class="empty">Nenhuma tarefa corresponde aos filtros.</p>`
        : html`<div class="cards">${visible.map((t) => taskCard(me, t))}</div>`
    }`;
}

// ---------- Gantt ----------

const ZOOM_LABEL: Record<Zoom, string> = { day: "Dia", week: "Semana", month: "Mês" };

export function ganttView(): Safe {
  const me = currentUser();
  const today = todayISO();
  const visible = filterTasks(state.tasks, state.filters, today);
  const { items, undated } = buildGanttItems(
    visible,
    state.showSubtasks,
    today,
    state.filters.hideDone,
  );
  const zoom = state.zoom;
  const px = PX_PER_DAY[zoom];
  const range = computeRange(items, today, zoom);
  const scale = buildScale(range, zoom, px);
  const trackWidth = range.days * px;
  const todayLeft = barGeometry(range, { start: today, end: today }, px).left;
  const cell = zoom === "day" ? px : zoom === "week" ? px * 7 : 0;
  const tasksById = new Map(state.tasks.map((t) => [t.id, t]));

  const controls = html`<div class="gantt-controls">
    <div class="segmented" role="group" aria-label="Escala">
      ${(Object.keys(ZOOM_LABEL) as Zoom[]).map(
        (z) =>
          html`<button
            type="button"
            data-action="set-zoom"
            data-zoom="${z}"
            ${z === zoom && raw('aria-pressed="true"')}
          >
            ${ZOOM_LABEL[z]}
          </button>`,
      )}
    </div>
    <label class="check">
      <input type="checkbox" data-pref="showSubtasks" ${state.showSubtasks && raw("checked")} />
      Mostrar subtarefas
    </label>
    <label class="check">
      <input type="checkbox" data-filter="hideDone" ${state.filters.hideDone && raw("checked")} />
      Ocultar concluídas
    </label>
    <button class="btn small" type="button" data-action="scroll-today">Hoje</button>
    <span class="legend">
      <i class="dot st-todo"></i>A fazer <i class="dot st-doing"></i>Em andamento
      <i class="dot st-blocked"></i>Bloqueada <i class="dot st-done"></i>Concluída
      <i class="dot late"></i>Atrasada
    </span>
  </div>`;

  if (items.length === 0) {
    return html`${controls}
      <p class="empty">
        ${state.tasks.length === 0 ? emptyMessage(me) : "Nenhuma tarefa com datas para exibir no Gantt."}
      </p>
      ${undatedNote(undated)}`;
  }

  const rows = items.map((item) => {
    const bar = barGeometry(range, item, px);
    const task = tasksById.get(item.kind === "task" ? item.id : (item.parentId ?? ""));
    const clickable = task
      ? item.kind === "task"
        ? canEditTask(me, task)
        : canToggleSubtask(
            me,
            task,
            task.subtasks.find((s) => s.id === item.id) ?? emptySub(task.id),
          )
      : false;
    const action = item.kind === "task" ? "edit-task" : "edit-sub";
    const detail = item.inherited
      ? "Subtarefa · sem datas próprias (usa as da tarefa)"
      : `${item.kind === "task" ? personName(task?.assignee_id ?? null) : "Subtarefa"} · ${formatBR(item.start)} – ${formatBR(item.end)}`;
    const label = html`<span class="g-title">${item.title}</span>
      <span class="g-sub">${detail}</span>`;
    const tone = item.overdue ? "late" : `st-${item.status}`;
    return html`<div class="g-row ${item.kind === "subtask" && "is-sub"}">
      <div class="g-label">
        ${
          clickable
            ? html`<button
                type="button"
                class="g-link"
                data-action="${action}"
                data-id="${item.id}"
              >
                ${label}
              </button>`
            : html`<div class="g-link">${label}</div>`
        }
      </div>
      <div class="g-track">
        <i class="g-today" style="left:${todayLeft + px / 2}px"></i>
        <div
          class="bar ${tone} ${item.kind === "subtask" && "bar-sub"} ${item.inherited && "bar-inherited"}"
          style="left:${bar.left}px;width:${bar.width}px"
          title="${item.title}: ${item.inherited ? "período da tarefa" : `${formatBR(item.start)} – ${formatBR(item.end)}`} (${item.progress}%)"
        >
          <div class="bar-fill" style="width:${item.progress}%"></div>
          ${bar.width >= 44 && html`<span class="bar-text">${item.progress}%</span>`}
        </div>
      </div>
    </div>`;
  });

  return html`${controls}
    <div class="gantt-scroll" id="gantt-scroll" data-today-left="${todayLeft}">
      <div
        class="gantt ${cell === 0 && "no-grid"}"
        style="--track-w:${trackWidth}px;--cell:${cell}px"
      >
        <div class="g-head">
          <div class="g-label g-corner">Tarefa</div>
          <div class="g-scale">
            <div class="g-scale-row">${cells(scale.top)}</div>
            <div class="g-scale-row">${cells(scale.bottom)}</div>
          </div>
        </div>
        ${rows}
      </div>
    </div>
    ${undatedNote(undated)}`;
}

function emptySub(taskId: string): Subtask {
  return {
    id: "",
    task_id: taskId,
    title: "",
    done: false,
    start_date: null,
    end_date: null,
    assignee_id: null,
    position: 0,
  };
}

function undatedNote(undated: Task[]): Safe {
  if (undated.length === 0) {
    return html``;
  }
  return html`<p class="muted">
    Sem datas (fora do Gantt): ${undated.map((t) => t.title).join(", ")}
  </p>`;
}

// ---------- usuários ----------

export function usersView(): Safe {
  const me = currentUser();
  const counts = new Map(ROLES.map((r) => [r, state.profiles.filter((p) => p.role === r).length]));
  const pending = counts.get("pending") ?? 0;
  return html`<section class="user-info" aria-label="Sobre os usuários">
      <p class="user-total"><strong>${state.profiles.length}</strong> usuários cadastrados</p>
      ${pieChart(
        "Por perfil",
        ROLES.map((r) => ({ label: ROLE_LABEL[r], value: counts.get(r) ?? 0, tone: r })),
      )}
    </section>
    ${
      pending > 0 &&
      html`<p class="notice">
        ${pending} conta(s) aguardando aprovação. Defina um perfil para liberar o acesso.
      </p>`
    }
    <div class="table-wrap">
      <table class="users-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Perfil</th>
          </tr>
        </thead>
        <tbody>
          ${state.profiles.map((p) => {
            const self = p.id === me.id;
            const name = p.name || "—";
            return html`<tr
              class="${!self && "user-row"}"
              ${!self && raw(`data-action="edit-user" data-id="${p.id}"`)}
            >
              <td data-label="Nome">
                ${
                  self
                    ? html`${name} <span class="chip">você</span>`
                    : html`<button
                        class="user-name"
                        type="button"
                        data-action="edit-user"
                        data-id="${p.id}"
                      >
                        ${name}
                      </button>`
                }
              </td>
              <td data-label="E-mail">${p.email}</td>
              <td data-label="Perfil">
                <span class="badge role-${p.role}">${ROLE_LABEL[p.role]}</span>
              </td>
            </tr>`;
          })}
        </tbody>
      </table>
    </div>
    <p class="muted small">
      <strong>Administrador:</strong> tudo. <strong>Usuário:</strong> edita só o que for atribuído a
      ele. <strong>Visualizador:</strong> somente consulta. Clique em um usuário para editar ou excluir.
      Você não pode alterar nem excluir a própria conta.
    </p>`;
}

export function userDialog(person: Profile): Safe {
  return html`<form data-form="user" data-id="${person.id}" class="stack">
    <h2>Editar usuário</h2>
    <p class="muted small">${person.email}</p>
    <label
      >Nome
      <input name="name" required maxlength="80" value="${person.name}" />
    </label>
    <label
      >Perfil
      <select name="role">
        ${selectOptions(ROLES, ROLE_LABEL, person.role)}
      </select>
    </label>
    <p class="form-error" data-error role="alert"></p>
    <div class="row end">
      <button class="btn danger push-left" type="button" data-action="delete-user" data-id="${person.id}">
        Excluir usuário
      </button>
      <button class="btn" type="button" data-action="close-dialog">Cancelar</button>
      <button class="btn primary" type="submit">Salvar</button>
    </div>
  </form>`;
}

// ---------- diálogos ----------

export interface ConfirmOptions {
  title: string;
  /** Item afetado (nome da tarefa/subtarefa), destacado abaixo do título. */
  subject: string;
  message: string;
  confirmLabel: string;
}

/** Popup de confirmação: `<form method="dialog">` fecha com returnValue "ok" ou "cancel". */
export function confirmDialog(options: ConfirmOptions): Safe {
  return html`<form method="dialog" class="confirm">
    <span class="confirm-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
    <h2>${options.title}</h2>
    <p class="confirm-subject">${options.subject}</p>
    <p class="muted">${options.message}</p>
    <div class="row end">
      <button class="btn" type="submit" value="cancel">Cancelar</button>
      <button class="btn primary" type="submit" value="ok" autofocus>${options.confirmLabel}</button>
    </div>
  </form>`;
}

function selectOptions<T extends string>(values: T[], labels: Record<T, string>, current: T): Safe {
  return html`${values.map(
    (v) => html`<option value="${v}" ${v === current && raw("selected")}>${labels[v]}</option>`,
  )}`;
}

function assigneeSelect(current: string | null, editable: boolean): Safe {
  if (!editable) {
    return html`<div class="readonly">${personName(current)}</div>`;
  }
  return html`<select name="assignee_id">
    <option value="" ${current === null && raw("selected")}>Sem responsável</option>
    ${activePeople().map(
      (p) =>
        html`<option value="${p.id}" ${p.id === current && raw("selected")}>
          ${p.name || p.email}
        </option>`,
    )}
  </select>`;
}

export function taskDialog(task: Task | null): Safe {
  const me = currentUser();
  const editableAssignee = canAssign(me);
  return html`<form data-form="task" data-id="${task?.id ?? ""}" class="stack">
    <h2>${task ? "Editar tarefa" : "Nova tarefa"}</h2>
    <label
      >Título
      <input name="title" required maxlength="200" value="${task?.title ?? ""}" />
    </label>
    <label
      >Descrição
      <textarea name="description" rows="3" maxlength="5000">${task?.description ?? ""}</textarea>
    </label>
    <div class="grid2">
      <label
        >Status
        <select name="status">
          ${selectOptions(STATUSES, STATUS_LABEL, task?.status ?? "todo")}
        </select>
      </label>
      <label
        >Prioridade
        <select name="priority">
          ${selectOptions(PRIORITIES, PRIORITY_LABEL, task?.priority ?? "medium")}
        </select>
      </label>
      <label
        >Início
        <input name="start_date" type="date" value="${task?.start_date ?? ""}" />
      </label>
      <label
        >Fim
        <input name="end_date" type="date" value="${task?.end_date ?? ""}" />
      </label>
    </div>
    <label>Responsável ${assigneeSelect(task?.assignee_id ?? null, editableAssignee)} </label>
    ${
      task &&
      task.subtasks.length > 0 &&
      html`<p class="muted small">
        O status exibido considera as subtarefas: com todas concluídas a tarefa aparece como
        concluída.
      </p>`
    }
    <p class="form-error" data-error role="alert"></p>
    <div class="row end">
      <button class="btn" type="button" data-action="close-dialog">Cancelar</button>
      <button class="btn primary" type="submit">Salvar</button>
    </div>
  </form>`;
}

export function subtaskDialog(task: Task, subtask: Subtask): Safe {
  const me = currentUser();
  const editableAssignee = canManageSubtasks(me, task);
  const linked = Boolean(subtask.start_after_id);
  const candidates = task.subtasks.filter(
    (s) => s.id !== subtask.id && !wouldCreateCycle(task.subtasks, subtask.id, s.id),
  );
  return html`<form data-form="subtask" data-id="${subtask.id}" class="stack">
    <h2>Editar subtarefa</h2>
    <p class="muted small">Tarefa: ${task.title}</p>
    <label
      >Título
      <input name="title" required maxlength="200" value="${subtask.title}" />
    </label>
    <div class="grid2">
      <label
        >Início
        <input
          name="start_date"
          type="date"
          value="${subtask.start_date ?? ""}"
          ${linked && raw("readonly")}
        />
      </label>
      <label
        >Fim
        <input name="end_date" type="date" value="${subtask.end_date ?? ""}" />
      </label>
    </div>
    ${
      candidates.length > 0 &&
      html`<label
        >Começar logo após o término de
        <select name="start_after_id" data-action="link-start">
          <option value="" ${!linked && raw("selected")}>Nenhuma (usar a data de início)</option>
          ${candidates.map(
            (s) =>
              html`<option value="${s.id}" ${s.id === subtask.start_after_id && raw("selected")}>
                ${s.title}
              </option>`,
          )}
        </select>
        <span class="muted small"
          >O início passa a ser o dia seguinte ao fim da subtarefa escolhida e acompanha as
          mudanças dela.</span
        >
      </label>`
    }
    <label>Responsável ${assigneeSelect(subtask.assignee_id, editableAssignee)} </label>
    <label class="check">
      <input type="checkbox" name="done" ${subtask.done && raw("checked")} /> Concluída
    </label>
    <p class="form-error" data-error role="alert"></p>
    <div class="row end">
      <button class="btn" type="button" data-action="close-dialog">Cancelar</button>
      <button class="btn primary" type="submit">Salvar</button>
    </div>
  </form>`;
}

export function linkDialog(task: Task): Safe {
  return html`<form data-form="link" data-task="${task.id}" class="stack">
    <h2>Adicionar link</h2>
    <p class="muted small">Tarefa: ${task.title}</p>
    <label
      >Endereço (URL)
      <input name="url" required inputmode="url" placeholder="https://…" maxlength="2000" />
    </label>
    <label
      >Título (opcional)
      <input name="title" maxlength="120" placeholder="Ex.: Planilha de custos" />
    </label>
    <p class="form-error" data-error role="alert"></p>
    <div class="row end">
      <button class="btn" type="button" data-action="close-dialog">Cancelar</button>
      <button class="btn primary" type="submit">Adicionar</button>
    </div>
  </form>`;
}

function authorName(id: string | null): string {
  if (!id) {
    return "Usuário removido";
  }
  const person = state.profiles.find((p) => p.id === id);
  return person ? person.name || person.email : "Usuário removido";
}

function chatMessage(me: Profile, comment: Comment): Safe {
  const mine = comment.author_id === me.id;
  return html`<div class="msg ${mine && "mine"}">
    <div class="msg-meta">
      <strong>${authorName(comment.author_id)}</strong>
      <time datetime="${comment.created_at}">${formatDateTimeBR(comment.created_at)}</time>
      ${
        canDeleteComment(me, comment) &&
        html`<button
          class="icon danger"
          type="button"
          data-action="delete-comment"
          data-id="${comment.id}"
          aria-label="Apagar comentário"
          title="Apagar"
        >
          ✕
        </button>`
      }
    </div>
    <div class="msg-body">${linkify(comment.body)}</div>
  </div>`;
}

export function chatMessages(comments: Comment[]): Safe {
  const me = currentUser();
  if (comments.length === 0) {
    return html`<p class="empty small">Nenhum comentário ainda. Comece a conversa!</p>`;
  }
  return html`${comments.map((c) => chatMessage(me, c))}`;
}

export function commentsDialog(task: Task, comments: Comment[]): Safe {
  const me = currentUser();
  return html`<section class="chat">
    <header>
      <h2>Comentários</h2>
      <p class="muted small">${task.title}</p>
    </header>
    <div id="chat-list" class="chat-list" role="log" aria-live="polite">
      ${chatMessages(comments)}
    </div>
    ${
      canComment(me)
        ? html`<form data-form="comment" data-task="${task.id}" class="chat-form">
            <textarea
              name="body"
              rows="2"
              required
              maxlength="2000"
              placeholder="Escreva um comentário… (Enter envia, Shift+Enter quebra a linha)"
              aria-label="Novo comentário"
              data-chat-input
            ></textarea>
            <button class="btn primary" type="submit">Enviar</button>
          </form>`
        : html`<p class="muted small">
            Seu perfil é somente leitura: você acompanha a conversa, mas não comenta.
          </p>`
    }
    <p class="form-error" data-error role="alert"></p>
    <div class="row end">
      <button class="btn" type="button" data-action="close-dialog">Fechar</button>
    </div>
  </section>`;
}

// ---------- relatórios ----------

function kpi(label: string, value: string | number, hint: Safe | string = "", tone = ""): Safe {
  return html`<div class="kpi ${tone}">
    <span class="kpi-label">${label}</span>
    <span class="kpi-value">${value}</span>
    ${hint !== "" && html`<span class="kpi-hint">${hint}</span>`}
  </div>`;
}

interface PieSlice {
  label: string;
  value: number;
  tone: string;
}

const PIE_RADIUS = 50;

function pieChart(title: string, slices: PieSlice[]): Safe {
  let total = 0;
  for (const slice of slices) {
    total += slice.value;
  }
  const shapes = pieShapes(
    slices.map((s) => s.value),
    PIE_RADIUS,
  );
  const drawn = slices.map((slice, index) => {
    const shape = shapes[index];
    if (!shape || shape.kind === "none") {
      return html``;
    }
    return shape.kind === "circle"
      ? html`<circle r="${PIE_RADIUS}" class="pie-${slice.tone}" />`
      : html`<path d="${shape.d}" class="pie-${slice.tone}" />`;
  });
  return html`<figure class="pie">
    <figcaption>${title} <b>${total}</b></figcaption>
    <div class="pie-body">
      <svg viewBox="-52 -52 104 104" role="img" aria-label="${title}: ${total}">
        <circle r="${PIE_RADIUS}" class="pie-empty" />
        ${drawn}
      </svg>
      <ul class="pie-legend">
        ${slices.map(
          (slice) =>
            html`<li>
              <i class="dot pie-${slice.tone}"></i>${slice.label}
              <b>${slice.value}</b><span class="muted"> (${percentOf(slice.value, total)}%)</span>
            </li>`,
        )}
      </ul>
    </div>
  </figure>`;
}

function reportLine({ line, nested }: NestedLine): Safe {
  const { kind, days } = line.deadline;
  const tone = kind === "upcoming" && days <= 3 ? "soon" : kind;
  return html`<li class="rline rline-${line.kind} ${nested && "is-nested"}">
    <div class="rline-main">
      <span class="badge kind-${line.kind}">${line.kind === "task" ? "Tarefa" : "Subtarefa"}</span>
      <span class="rline-title">${line.title}</span>
      ${!nested && line.parentTitle && html`<span class="muted small">em ${line.parentTitle}</span>`}
    </div>
    <div class="rline-meta">
      ${line.kind === "task" && html`<span class="rline-progress">${progressBar(line.progress)} <b>${line.progress}%</b></span>`}
      <span class="deadline dl-${tone}">${deadlineLabel(line.deadline)}</span>
    </div>
  </li>`;
}

function reportCard(report: PersonReport): Safe {
  const { taskStats: ts, subtaskStats: ss, person } = report;
  const open = report.lines.filter((line) => line.deadline.kind !== "done");
  const done = report.lines.filter((line) => line.deadline.kind === "done");
  const next = report.nextDue;
  const nextValue =
    next === null
      ? "—"
      : next.days === 0
        ? "Hoje"
        : `Em ${next.days} ${next.days === 1 ? "dia" : "dias"}`;
  const expanded = state.openPeople.has(person.id);
  const title = cardTitle("toggle-person", person.id, expanded, person.name);
  if (!expanded) {
    return html`<article class="report is-collapsed">${title}</article>`;
  }
  return html`<article class="report">
    <header class="report-head">${title}</header>
    <div class="pies">
      ${pieChart("Tarefas", [
        { label: "A fazer", value: ts.todo, tone: "todo" },
        { label: "Em andamento", value: ts.doing, tone: "doing" },
        { label: "Bloqueadas", value: ts.blocked, tone: "blocked" },
        { label: "Concluídas", value: ts.done, tone: "done" },
      ])}
      ${pieChart("Subtarefas", [
        { label: "Concluídas", value: ss.done, tone: "done" },
        { label: "Em aberto", value: ss.open - ss.late, tone: "todo" },
        { label: "Atrasadas", value: ss.late, tone: "late" },
      ])}
    </div>
    <div class="kpis">
      ${kpi("Progresso das tarefas", `${ts.progress}%`, progressBar(ts.progress))}
      ${kpi("Atrasadas", ts.late + ss.late, "", ts.late + ss.late > 0 ? "bad" : "ok")}
      ${kpi("Maior atraso", report.maxLateDays > 0 ? `${report.maxLateDays} ${report.maxLateDays === 1 ? "dia" : "dias"}` : "Nenhum", "", report.maxLateDays > 0 ? "bad" : "ok")}
      ${kpi("Próximo prazo", nextValue, next?.title ?? "")}
      ${kpi("Vencem em até 7 dias", report.dueSoon)}
    </div>
    <details
      class="report-details"
      data-report="${person.id}"
      ${state.openReports.has(person.id) && raw("open")}
    >
      <summary>Tarefas e subtarefas (${report.lines.length})</summary>
      ${
        report.lines.length === 0
          ? html`<p class="muted">Nada atribuído.</p>`
          : html`
              ${open.length > 0 ? html`<ul class="rlines">${nestLines(open).map(reportLine)}</ul>` : html`<p class="muted">Nada em aberto.</p>`}
              ${
                done.length > 0 &&
                html`<details class="report-done">
                  <summary>Concluídas (${done.length})</summary>
                  <ul class="rlines">
                    ${nestLines(done).map(reportLine)}
                  </ul>
                </details>`
              }
            `
      }
    </details>
  </article>`;
}

function buildReports(me: Profile, today: string): PersonReport[] {
  return me.role === "admin"
    ? buildTeamReport(state.profiles, state.tasks, today)
    : [buildPersonReport({ id: me.id, name: me.name || me.email }, state.tasks, today)];
}

/** Ids dos relatórios exibidos (para "expandir/encolher tudo"). */
export function reportPeopleIds(): string[] {
  return buildReports(currentUser(), todayISO()).map((r) => r.person.id);
}

export function reportsView(): Safe {
  const me = currentUser();
  if (!canSeeReports(me)) {
    return html`<p class="empty">O relatório não está disponível para o seu perfil.</p>`;
  }
  const today = todayISO();
  const admin = me.role === "admin";
  const reports = buildReports(me, today);
  const allOpen = reports.length > 0 && reports.every((r) => state.openPeople.has(r.person.id));
  const [only] = reports;
  const nothing = !admin && only !== undefined && only.lines.length === 0;
  return html`<div class="tasks-bar">
      <p class="muted small">
        ${admin ? "Andamento por pessoa, de quem tem mais itens atrasados para quem tem menos." : "Como estão as suas tarefas e subtarefas."}
        Referência: hoje, ${formatBR(today)}. Subtarefas sem data usam o prazo da tarefa.
      </p>
      ${reports.length > 0 && expandSwitch("toggle-all-people", allOpen, "Expandir todos os relatórios")}
    </div>
    ${nothing && html`<p class="empty">${emptyMessage(me)}</p>`}
    <div class="reports">${reports.map(reportCard)}</div>`;
}
