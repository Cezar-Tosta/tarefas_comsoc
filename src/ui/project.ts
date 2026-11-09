// Painel de projetos (cards ou lista) e página do projeto: escopo, cronograma, orçamento,
// indicadores de controle e diário de bordo.

import { JOURNAL_LABEL, PRIORITY_LABEL, STATUS_LABEL } from "../labels";
import { ARCHIVE_AFTER_DAYS, completedOn, splitArchived } from "../lib/archive";
import {
  computeControl,
  type Control,
  formatBRL,
  HEALTH_LABEL,
  portfolioSummary,
  SORT_KEYS,
  SORT_LABEL,
  sortTasks,
} from "../lib/control";
import { diffDays, formatBR, formatDateTimeBR, todayISO } from "../lib/dates";
import { filterTasks } from "../lib/filters";
import {
  countByKind,
  filterJournal,
  groupJournalByDay,
  type JournalFilter,
  MANUAL_KINDS,
} from "../lib/journal";
import {
  canCompleteTask,
  canDeleteJournal,
  canDeleteTask,
  canEditTask,
  canManageExpenses,
  canManageLinks,
  canManageSubtasks,
  canWriteJournal,
} from "../lib/permissions";
import { effectiveStatus, isOverdue, splitSubtasks } from "../lib/progress";
import { deadlineInfo } from "../lib/reports";
import { resolveSubtaskDates } from "../lib/subtaskDates";
import { participates, unreadCount } from "../lib/unread";
import { currentUser, state } from "../state";
import type { JournalEntry, Profile, Task } from "../types";
import { html, raw, type Safe } from "./html";
import { linkify } from "./linkify";
import {
  card,
  countdownChip,
  emptyMessage,
  healthBadge,
  linkChip,
  opt,
  period,
  personName,
  progressBar,
  subtaskRow,
} from "./views";

// ---------- painel ----------

/** Projetos exibidos no painel: escopo (em andamento / todos), filtros e ordenação. */
export function dashboardTasks(today = todayISO()): Task[] {
  const { active, archived } = splitArchived(state.tasks, today);
  let base = active;
  if (state.dashScope === "open") {
    base = active.filter((t) => effectiveStatus(t) !== "done");
  } else if (state.dashScope === "archived") {
    base = archived;
  }
  return sortTasks(filterTasks(base, state.filters, today), state.dashSort, today);
}

function pct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function index(value: number | null): string {
  return value === null ? "—" : value.toFixed(2).replace(".", ",");
}

function dashCard(task: Task, today: string): Safe {
  const status = effectiveStatus(task);
  const control = computeControl(task, today);
  const chip = countdownChip(deadlineInfo(task.end_date, status === "done", today));
  const { done } = splitSubtasks(task.subtasks);
  const [reason] = control.reasons;
  const me = currentUser();
  const fresh = participates(me, state.read, task) ? unreadCount(state.read, task) : 0;
  const finished = state.dashScope === "archived" ? completedOn(task) : null;
  return html`<article class="dash-card health-edge-${control.health}">
    <h3>
      <button class="dash-open" type="button" data-action="open-project" data-id="${task.id}">
        ${task.title}
      </button>
    </h3>
    <div class="badges">
      ${fresh > 0 && html`<span class="badge new-badge">${fresh} ${fresh === 1 ? "novo" : "novos"}</span>`}
      ${finished !== null && html`<span class="chip">Concluída em ${formatBR(finished)}</span>`}
      ${healthBadge(control.health, control.reasons.join(" · "))}
      <span class="badge st-${status}">${STATUS_LABEL[status]}</span>
      ${task.priority === "high" && html`<span class="badge pr-high">Prioridade alta</span>`}
    </div>
    <p class="dash-meta">
      <span>${personName(task.assignee_id)}</span>
      <span>${period(task.start_date, task.end_date)}</span>
      ${chip}
    </p>
    <div class="progress-row">
      ${progressBar(control.progress)}
      <span class="progress-label"><strong>${control.progress}%</strong></span>
    </div>
    <dl class="dash-mini">
      <div>
        <dt>Prazo decorrido</dt>
        <dd>${pct(control.elapsed)}</dd>
      </div>
      <div>
        <dt>Etapas</dt>
        <dd>${task.subtasks.length > 0 ? `${done.length}/${task.subtasks.length}` : "—"}</dd>
      </div>
      ${
        state.project &&
        html`<div>
          <dt>Orçamento</dt>
          <dd>${control.budget === null ? "—" : pct(control.budgetUsed)}</dd>
        </div>`
      }
    </dl>
    ${reason !== undefined && html`<p class="dash-reason">${reason}</p>`}
  </article>`;
}

function dashTable(tasks: Task[], today: string): Safe {
  return html`<div class="table-wrap">
    <table class="dash-table">
      <thead>
        <tr>
          <th>Projeto</th>
          <th>Responsável</th>
          <th>Status</th>
          <th>Saúde</th>
          <th>Progresso</th>
          <th>Prazo</th>
          ${state.project && html`<th>Orçamento</th>`}
        </tr>
      </thead>
      <tbody>
        ${tasks.map((task) => {
          const status = effectiveStatus(task);
          const control = computeControl(task, today);
          const chip = countdownChip(deadlineInfo(task.end_date, status === "done", today));
          return html`<tr>
            <td data-label="Projeto">
              <button class="user-name" type="button" data-action="open-project" data-id="${task.id}">
                ${task.title}
              </button>
            </td>
            <td data-label="Responsável">${personName(task.assignee_id)}</td>
            <td data-label="Status"><span class="badge st-${status}">${STATUS_LABEL[status]}</span></td>
            <td data-label="Saúde">${healthBadge(control.health, control.reasons.join(" · "))}</td>
            <td data-label="Progresso">
              <span class="table-progress">${progressBar(control.progress)} <b>${control.progress}%</b></span>
            </td>
            <td data-label="Prazo">${formatBR(task.end_date)} ${chip}</td>
            ${
              state.project &&
              html`<td data-label="Orçamento">
                ${control.budget === null ? "—" : html`${formatBRL(control.spent)} <span class="muted">/ ${formatBRL(control.budget)}</span>`}
              </td>`
            }
          </tr>`;
        })}
      </tbody>
    </table>
  </div>`;
}

function emptyDashboard(): string {
  if (state.dashScope === "archived") {
    return `Nenhum projeto arquivado. Projetos concluídos há ${ARCHIVE_AFTER_DAYS} dias ou mais aparecem aqui.`;
  }
  if (state.dashScope === "open") {
    return "Nenhum projeto em andamento corresponde aos filtros. Veja “Todos” ou “Arquivados”.";
  }
  return "Nenhum projeto corresponde aos filtros.";
}

export function dashboardView(): Safe {
  const me = currentUser();
  if (state.tasks.length === 0) {
    return html`<p class="empty">${emptyMessage(me)}</p>`;
  }
  const today = todayISO();
  const visible = dashboardTasks(today);
  const summary = portfolioSummary(visible, today);
  const split = splitArchived(state.tasks, today);
  const openCount = split.active.filter((t) => effectiveStatus(t) !== "done").length;
  let progressSum = 0;
  for (const task of visible) {
    progressSum += computeControl(task, today).progress;
  }
  const avg = visible.length === 0 ? 0 : Math.round(progressSum / visible.length);
  const used = summary.budget > 0 ? Math.round((summary.spent / summary.budget) * 100) : null;
  const scopes = [
    { key: "open", label: `Em andamento (${openCount})` },
    { key: "all", label: `Todos (${split.active.length})` },
    { key: "archived", label: `Arquivados (${split.archived.length})` },
  ];
  const layouts = [
    { key: "cards", label: "Cards" },
    { key: "list", label: "Lista" },
  ];

  return html`<h2 class="section-title">Painel de projetos</h2>
    <div class="stats">
      ${card("Projetos", summary.total)}
      ${card("Críticos", summary.health.critical, summary.health.critical > 0 ? "bad" : "", summary.total)}
      ${card("Atenção", summary.health.attention, summary.health.attention > 0 ? "warn" : "", summary.total)}
      ${card("No rumo", summary.health.ok, "ok", summary.total)}
      <div class="stat wide">
        <span class="stat-value">${avg}%</span>
        <span class="stat-label">Progresso médio</span>
        ${progressBar(avg)}
      </div>
      ${
        state.project &&
        summary.budget > 0 &&
        html`<div class="stat wide">
          <span class="stat-value money">${formatBRL(summary.spent)}</span>
          <span class="stat-label">
            gastos de ${formatBRL(summary.budget)} orçados${used !== null && ` (${used}%)`}
          </span>
          ${progressBar(Math.min(used ?? 0, 100))}
        </div>`
      }
    </div>
    <div class="dash-bar">
      <div class="segmented" role="group" aria-label="Quais projetos">
        ${scopes.map(
          (s) =>
            html`<button
              type="button"
              data-action="set-scope"
              data-scope="${s.key}"
              ${s.key === state.dashScope && raw('aria-pressed="true"')}
            >
              ${s.label}
            </button>`,
        )}
      </div>
      <label class="field inline"
        >Ordenar por
        <select data-pref="dashSort">
          ${SORT_KEYS.map((k) => opt(k, SORT_LABEL[k], state.dashSort))}
        </select>
      </label>
      <div class="segmented compact" role="group" aria-label="Visualização">
        ${layouts.map(
          (l) =>
            html`<button
              type="button"
              data-action="set-layout"
              data-layout="${l.key}"
              ${l.key === state.dashLayout && raw('aria-pressed="true"')}
            >
              ${l.label}
            </button>`,
        )}
      </div>
    </div>
    ${
      visible.length === 0
        ? html`<p class="empty">${emptyDashboard()}</p>`
        : state.dashLayout === "list"
          ? dashTable(visible, today)
          : html`<div class="dash-cards">${visible.map((t) => dashCard(t, today))}</div>`
    }`;
}

// ---------- página do projeto ----------

function section(title: string, body: Safe, extraClass = ""): Safe {
  return html`<section class="pcard ${extraClass}">
    <h3 class="pcard-title">${title}</h3>
    ${body}
  </section>`;
}

function textBlock(label: string, text: string | undefined, placeholder: string): Safe {
  return html`<div class="text-block">
    <h4>${label}</h4>
    ${text ? html`<p class="desc">${linkify(text)}</p>` : html`<p class="muted small">${placeholder}</p>`}
  </div>`;
}

function scopeSection(me: Profile, task: Task): Safe {
  const editable = canEditTask(me, task);
  const hint = editable ? "Defina em Editar." : "Não definido.";
  const links =
    state.extras &&
    (task.links.length > 0 || canManageLinks(me, task)) &&
    html`<div class="text-block">
      <h4>Links</h4>
      <div class="links">
        ${task.links.map((link) => linkChip(link, canManageLinks(me, task)))}
        ${
          canManageLinks(me, task) &&
          html`<button class="chip-btn" type="button" data-action="add-link" data-id="${task.id}">
            + Link
          </button>`
        }
      </div>
    </div>`;
  return section(
    "Escopo",
    html`${textBlock("Descrição", task.description, hint)}
    ${state.project && textBlock("Escopo e entregáveis", task.scope, hint)}
    ${state.project && textBlock("Critérios de aceite", task.success_criteria, hint)} ${links}`,
    "pcard-scope",
  );
}

function indicator(label: string, value: string, hint: string, tone = ""): Safe {
  return html`<div class="kpi ${tone}">
    <span class="kpi-label">${label}</span>
    <span class="kpi-value">${value}</span>
    <span class="kpi-hint">${hint}</span>
  </div>`;
}

function toneOf(value: number | null, attention: number, critical: number): string {
  if (value === null) {
    return "";
  }
  if (value < critical) {
    return "bad";
  }
  return value < attention ? "warn" : "ok";
}

function controlSection(control: Control): Safe {
  const slip = control.slipDays;
  let slipText = "—";
  if (slip !== null) {
    slipText =
      slip === 0
        ? "No prazo original"
        : `${Math.abs(slip)} ${Math.abs(slip) === 1 ? "dia" : "dias"}`;
  }
  const slipHint =
    slip === null
      ? "Sem linha de base"
      : slip > 0
        ? "de adiamento"
        : slip < 0
          ? "de antecipação"
          : "";
  return section(
    "Indicadores de controle",
    html`<div class="health-line">
        ${healthBadge(control.health)}
        ${
          control.reasons.length === 0
            ? html`<span class="muted small">${control.health === "done" ? "Projeto encerrado." : "Nenhum alerta: o projeto segue o planejado."}</span>`
            : html`<ul class="reasons">
                ${control.reasons.map((r) => html`<li>${r}</li>`)}
              </ul>`
        }
      </div>
      <div class="kpis">
        ${indicator("Avanço físico", `${control.progress}%`, "etapas concluídas")}
        ${indicator("Prazo decorrido", pct(control.elapsed), "do período planejado")}
        ${indicator("SPI (prazo)", index(control.spi), "avanço ÷ prazo decorrido", toneOf(control.spi, 0.9, 0.7))}
        ${
          state.project &&
          indicator(
            "CPI (custo)",
            index(control.cpi),
            "valor agregado ÷ custo real",
            toneOf(control.cpi, 1, 0.9),
          )
        }
        ${state.project && indicator("Linha de base", slipText, slipHint, slip !== null && slip > 0 ? "warn" : "")}
      </div>
      <p class="muted small">
        SPI e CPI iguais a 1 indicam execução conforme o planejado; abaixo de 1, atraso ou custo
        acima do previsto. Calculados quando há etapas cadastradas.
      </p>`,
    "pcard-control",
  );
}

/** Mini-cronograma: barras das etapas dentro do período do projeto. */
function timeline(task: Task, today: string): Safe {
  const dated = task.subtasks.map((s) => ({
    subtask: s,
    dates: resolveSubtaskDates(s, task.subtasks),
  }));
  let start = task.start_date;
  let end = task.end_date;
  for (const { dates } of dated) {
    if (dates.start && (!start || dates.start < start)) {
      start = dates.start;
    }
    if (dates.end && (!end || dates.end > end)) {
      end = dates.end;
    }
  }
  if (!start || !end) {
    return html``;
  }
  const total = diffDays(start, end) + 1;
  const place = (from: string, to: string): string => {
    const left = (diffDays(start, from) / total) * 100;
    const width = ((diffDays(from, to) + 1) / total) * 100;
    return `left:${left.toFixed(2)}%;width:${Math.max(width, 1.5).toFixed(2)}%`;
  };
  const todayPos =
    today >= start && today <= end ? ((diffDays(start, today) + 0.5) / total) * 100 : null;
  const rows = dated.filter(({ dates }) => dates.start && dates.end);
  return html`<div class="mini-timeline" aria-label="Cronograma das etapas">
    <div class="mt-scale"><span>${formatBR(start)}</span><span>${formatBR(end)}</span></div>
    ${
      task.start_date &&
      task.end_date &&
      html`<div class="mt-row mt-project">
        <span class="mt-label">Projeto</span>
        <span class="mt-track"><i class="mt-bar" style="${place(task.start_date, task.end_date)}"></i></span>
      </div>`
    }
    ${rows.map(({ subtask, dates }) => {
      const late = !subtask.done && dates.end !== null && dates.end < today;
      return html`<div class="mt-row">
        <span class="mt-label" title="${subtask.title}">${subtask.title}</span>
        <span class="mt-track"
          ><i
            class="mt-bar ${subtask.done && "is-done"} ${late && "is-late"}"
            style="${place(dates.start ?? start, dates.end ?? end)}"
            title="${subtask.title}: ${formatBR(dates.start)} – ${formatBR(dates.end)}"
          ></i
        ></span>
      </div>`;
    })}
    ${todayPos !== null && html`<i class="mt-today" style="left:calc(var(--mt-label) + (100% - var(--mt-label)) * ${(todayPos / 100).toFixed(4)})" title="Hoje"></i>`}
  </div>`;
}

function scheduleSection(me: Profile, task: Task, today: string): Safe {
  const { open, done } = splitSubtasks(task.subtasks);
  const canAddSub = canManageSubtasks(me, task);
  const late = isOverdue(task, today);
  return section(
    "Cronograma",
    html`<dl class="meta">
        <div>
          <dt>Período</dt>
          <dd class="${late && "is-late-text"}">${period(task.start_date, task.end_date)}</dd>
        </div>
        ${
          state.project &&
          html`<div>
            <dt>Linha de base</dt>
            <dd>${period(task.baseline_start ?? null, task.baseline_end ?? null)}</dd>
          </div>`
        }
        <div>
          <dt>Responsável</dt>
          <dd>${personName(task.assignee_id)}</dd>
        </div>
      </dl>
      ${me.role !== "user" && timeline(task, today)}
      <h4 class="sub-heading">Etapas (${done.length}/${task.subtasks.length})</h4>
      ${
        open.length > 0
          ? html`<ul class="subs">
              ${open.map((s) => subtaskRow(me, task, s))}
            </ul>`
          : task.subtasks.length === 0 && html`<p class="muted small">Nenhuma etapa cadastrada.</p>`
      }
      ${
        canAddSub &&
        html`<form class="inline-add" data-form="add-sub" data-task="${task.id}">
          <input name="title" required maxlength="200" placeholder="Nova etapa…" aria-label="Nova etapa" />
          <button class="btn small" type="submit">Adicionar</button>
        </form>`
      }
      ${
        done.length > 0 &&
        html`<details class="done-group" data-task="${task.id}" ${state.openDone.has(task.id) && raw("open")}>
          <summary>Concluídas (${done.length})</summary>
          <ul class="subs">
            ${done.map((s) => subtaskRow(me, task, s))}
          </ul>
        </details>`
      }`,
    "pcard-schedule",
  );
}

function budgetSection(me: Profile, task: Task, control: Control): Safe {
  const manage = canManageExpenses(me);
  const expenses = task.expenses ?? [];
  const over = control.budgetUsed !== null && control.budgetUsed > 100;
  return section(
    "Orçamento",
    html`<div class="kpis">
        ${indicator("Previsto", control.budget === null ? "—" : formatBRL(control.budget), control.budget === null ? "sem orçamento definido" : "orçamento aprovado")}
        ${indicator("Realizado", formatBRL(control.spent), `${expenses.length} ${expenses.length === 1 ? "despesa" : "despesas"}`)}
        ${
          control.balance !== null &&
          indicator(
            "Saldo",
            formatBRL(control.balance),
            over ? "acima do orçamento" : "disponível",
            over ? "bad" : "ok",
          )
        }
        ${
          control.earned !== null &&
          indicator("Valor agregado", formatBRL(control.earned), "orçamento × avanço físico")
        }
      </div>
      ${
        control.budgetUsed !== null &&
        html`<div class="progress-row budget-row ${over && "is-over"}">
          ${progressBar(Math.min(control.budgetUsed, 100))}
          <span class="progress-label"><strong>${control.budgetUsed}%</strong> consumido</span>
        </div>`
      }
      ${
        expenses.length > 0
          ? html`<ul class="expenses">
              ${expenses.map(
                (e) => html`<li>
                  <span class="exp-date">${formatBR(e.spent_on)}</span>
                  <span class="exp-desc">${e.description}</span>
                  <span class="exp-amount">${formatBRL(e.amount)}</span>
                  ${
                    manage &&
                    html`<button
                      class="icon danger"
                      type="button"
                      data-action="delete-expense" data-id="${e.id}"
                      aria-label="Remover despesa ${e.description}"
                      title="Remover"
                    >
                      ✕
                    </button>`
                  }
                </li>`,
              )}
            </ul>`
          : html`<p class="muted small">Nenhuma despesa lançada.</p>`
      }
      ${
        manage &&
        html`<form class="expense-form" data-form="expense" data-task="${task.id}">
          <input name="description" required maxlength="200" placeholder="Descrição da despesa" aria-label="Descrição" />
          <input name="amount" type="number" required min="0.01" step="0.01" inputmode="decimal" placeholder="Valor (R$)" aria-label="Valor" />
          <input name="spent_on" type="date" required value="${todayISO()}" aria-label="Data" />
          <button class="btn small" type="submit">Lançar</button>
          <p class="form-error" data-error role="alert"></p>
        </form>`
      }`,
    "pcard-budget",
  );
}

function authorName(id: string | null): string {
  if (!id) {
    return "Sistema";
  }
  const person = state.profiles.find((p) => p.id === id);
  return person ? person.name || person.email : "Usuário removido";
}

function journalEntry(me: Profile, entry: JournalEntry): Safe {
  const auto = entry.kind === "system";
  return html`<li class="jentry jk-${entry.kind}">
    <span class="jdot" aria-hidden="true"></span>
    <div class="jcontent">
      <div class="jmeta">
        <span class="badge jk-badge jk-${entry.kind}">${JOURNAL_LABEL[entry.kind]}</span>
        <time datetime="${entry.created_at}">${formatDateTimeBR(entry.created_at).slice(-5)}</time>
        <span class="muted">${auto ? (entry.author_id ? `por ${authorName(entry.author_id)}` : "") : authorName(entry.author_id)}</span>
        ${
          canDeleteJournal(me, entry) &&
          html`<button
            class="icon danger"
            type="button"
            data-action="delete-journal" data-id="${entry.id}"
            aria-label="Apagar registro"
            title="Apagar"
          >
            ✕
          </button>`
        }
      </div>
      <div class="jbody">${linkify(entry.body)}</div>
    </div>
  </li>`;
}

function journalSection(me: Profile, task: Task): Safe {
  const counts = countByKind(state.journal);
  const filters: { key: JournalFilter; label: string; count: number }[] = [
    { key: "all", label: "Tudo", count: state.journal.length },
    { key: "manual", label: "Registros da equipe", count: state.journal.length - counts.system },
    ...MANUAL_KINDS.filter((k) => counts[k] > 0).map((k) => ({
      key: k as JournalFilter,
      label: JOURNAL_LABEL[k],
      count: counts[k],
    })),
    { key: "system", label: JOURNAL_LABEL.system, count: counts.system },
  ];
  const groups = groupJournalByDay(filterJournal(state.journal, state.journalFilter));
  return section(
    "Diário de bordo",
    html`<p class="muted small">
        A memória do projeto: decisões, riscos, avanços e tudo o que muda (registrado
        automaticamente). Os registros não são editados.
      </p>
      ${
        canWriteJournal(me) &&
        html`<form class="journal-form" data-form="journal" data-task="${task.id}">
          <select name="kind" aria-label="Tipo de registro">
            ${MANUAL_KINDS.map((k) => opt(k, JOURNAL_LABEL[k], "note"))}
          </select>
          <textarea
            name="body"
            rows="2"
            required
            maxlength="5000"
            placeholder="O que aconteceu, o que foi decidido, qual o risco…"
            aria-label="Registro"
          ></textarea>
          <button class="btn primary small" type="submit">Registrar</button>
          <p class="form-error" data-error role="alert"></p>
        </form>`
      }
      <div class="chip-filters" role="group" aria-label="Filtrar registros">
        ${filters.map(
          (f) =>
            html`<button
              class="chip-btn"
              type="button"
              data-action="journal-filter"
              data-kind="${f.key}"
              ${f.key === state.journalFilter && raw('aria-pressed="true"')}
            >
              ${f.label} <b>${f.count}</b>
            </button>`,
        )}
      </div>
      ${
        groups.length === 0
          ? html`<p class="empty small">Nenhum registro${state.journalFilter === "all" ? " ainda" : " deste tipo"}.</p>`
          : html`<div class="journal">
              ${groups.map(
                (g) => html`<div class="jday">
                  <h4 class="jday-title">${formatBR(g.day)}</h4>
                  <ol class="jlist">
                    ${g.entries.map((e) => journalEntry(me, e))}
                  </ol>
                </div>`,
              )}
            </div>`
      }`,
    "pcard-journal",
  );
}

function projectActions(me: Profile, task: Task): Safe {
  const fresh = participates(me, state.read, task) ? unreadCount(state.read, task) : 0;
  return html`<div class="card-actions">
    ${
      state.extras &&
      html`<button class="btn small" type="button" data-action="open-comments" data-id="${task.id}">
        Comentários${task.comment_count > 0 && html` <span class="count-pill ${fresh > 0 && "new"}">${task.comment_count}</span>`}
      </button>`
    }
    ${
      canCompleteTask(me, task) &&
      html`<button class="btn small primary" type="button" data-action="complete-task" data-id="${task.id}">
        Concluir
      </button>`
    }
    ${
      canEditTask(me, task) &&
      html`<button class="btn small" type="button" data-action="edit-task" data-id="${task.id}">Editar</button>`
    }
    ${
      canDeleteTask(me) &&
      html`<button class="btn small danger" type="button" data-action="delete-task" data-id="${task.id}">
        Excluir
      </button>`
    }
  </div>`;
}

const BACK = html`<nav class="crumbs">
  <button class="btn small" type="button" data-action="back">← Voltar</button>
</nav>`;

export function projectView(): Safe {
  const me = currentUser();
  const task = state.tasks.find((t) => t.id === state.projectId);
  if (!task) {
    return html`${BACK}
      <p class="empty">Projeto não encontrado. Ele pode ter sido excluído ou não estar mais atribuído a você.</p>`;
  }
  const today = todayISO();
  const status = effectiveStatus(task);
  const control = computeControl(task, today);
  const chip = countdownChip(deadlineInfo(task.end_date, status === "done", today));
  return html`${BACK}
    <article class="project">
      <header class="project-head">
        <div>
          <h2 class="project-title">${task.title}</h2>
          <div class="badges">
            ${healthBadge(control.health, control.reasons.join(" · "))}
            <span class="badge st-${status}">${STATUS_LABEL[status]}</span>
            <span class="badge pr-${task.priority}">Prioridade ${PRIORITY_LABEL[task.priority].toLowerCase()}</span>
            ${chip}
          </div>
        </div>
        ${projectActions(me, task)}
      </header>
      <div class="progress-row project-progress">
        ${progressBar(control.progress)}
        <span class="progress-label"><strong>${control.progress}%</strong> concluído · ${HEALTH_LABEL[control.health].toLowerCase()}</span>
      </div>
      ${
        !state.project &&
        html`<p class="notice">
          Escopo, orçamento e diário de bordo ficam disponíveis depois de executar
          <code>supabase/008_project_management.sql</code> no Supabase.
        </p>`
      }
      <div class="project-grid">
        ${scopeSection(me, task)} ${controlSection(control)} ${scheduleSection(me, task, today)}
        ${state.project && budgetSection(me, task, control)} ${state.project && journalSection(me, task)}
      </div>
    </article>`;
}
