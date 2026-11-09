// Aba Atividades: o que precisa ser feito, agrupado pelo prazo. Complementa o Painel, que
// mostra os projetos; aqui aparecem as etapas (e projetos sem etapas) em aberto.

import {
  type Activity,
  buildActivities,
  DUE_LABEL,
  type DueGroup,
  groupByDue,
  isMine,
} from "../lib/activities";
import { splitArchived } from "../lib/archive";
import { computeControl, HEALTH_LABEL } from "../lib/control";
import { formatBR, todayISO } from "../lib/dates";
import { filterTasks } from "../lib/filters";
import { canCompleteTask, canEditTask, canToggleSubtask } from "../lib/permissions";
import { deadlineInfo } from "../lib/reports";
import { currentUser, state } from "../state";
import type { Profile } from "../types";
import { html, raw, type Safe } from "./html";
import { countdownChip, emptyMessage, personName } from "./views";

/** Atividades exibidas: projetos ativos, filtros da barra e o escopo "Minhas / Todas". */
export function visibleActivities(today = todayISO()): Activity[] {
  const me = currentUser();
  const { active } = splitArchived(state.tasks, today);
  const items = buildActivities(filterTasks(active, state.filters, today));
  return state.activityScope === "mine" ? items.filter((item) => isMine(item, me.id)) : items;
}

function doneControl(me: Profile, item: Activity): Safe | false {
  if (item.subtask) {
    const enabled = canToggleSubtask(me, item.task, item.subtask);
    return html`<input
      type="checkbox"
      data-action="toggle-sub"
      data-id="${item.subtask.id}"
      aria-label="Concluir ${item.title}"
      ${!enabled && raw("disabled")}
    />`;
  }
  // Projeto sem etapas: o usuário dono conclui; o administrador também pode.
  if (canCompleteTask(me, item.task) || canEditTask(me, item.task)) {
    return html`<button
      class="btn small primary"
      type="button"
      data-action="complete-task"
      data-id="${item.task.id}"
    >
      Concluir
    </button>`;
  }
  return false;
}

function activityRow(me: Profile, item: Activity, today: string): Safe {
  const health = computeControl(item.task, today).health;
  const chip = countdownChip(deadlineInfo(item.end, false, today));
  // Usuários comuns veem só o essencial (sem datas), como no restante do app.
  const showDates = me.role !== "user";
  return html`<li class="act ${item.kind === "task" && "act-task"}">
    <span class="act-check">${doneControl(me, item)}</span>
    <div class="act-main">
      <span class="act-title">${item.title}</span>
      <span class="act-meta">
        <button
          class="act-project"
          type="button"
          data-action="open-project"
          data-id="${item.task.id}"
          title="Abrir o projeto"
        >
          <i class="dot health-${health}" title="${HEALTH_LABEL[health]}"></i>
          ${item.kind === "task" ? "Projeto sem etapas" : item.task.title}
        </button>
        <span class="chip">${personName(item.assigneeId)}</span>
        ${
          showDates &&
          item.end &&
          html`<span class="chip ${item.inheritedDate && "muted"}" title="${item.inheritedDate ? "Prazo do projeto (a etapa não tem data própria)" : "Prazo"}"
            >${formatBR(item.end)}</span
          >`
        }
      </span>
    </div>
    <span class="act-due">${chip}</span>
  </li>`;
}

function group(me: Profile, g: DueGroup, today: string): Safe {
  return html`<section class="act-group due-${g.key}">
    <h3 class="act-group-title">
      ${DUE_LABEL[g.key]} <span class="count-pill">${g.items.length}</span>
    </h3>
    <ul class="act-list">
      ${g.items.map((item) => activityRow(me, item, today))}
    </ul>
  </section>`;
}

export function activitiesView(): Safe {
  const me = currentUser();
  if (state.tasks.length === 0) {
    return html`<p class="empty">${emptyMessage(me)}</p>`;
  }
  const today = todayISO();
  const items = visibleActivities(today);
  const groups = groupByDue(items, today);
  const scopes = [
    { key: "mine", label: "Minhas" },
    { key: "all", label: "Todas" },
  ];
  let empty = "Nenhuma atividade corresponde aos filtros.";
  if (state.activityScope === "mine") {
    empty = "Nada pendente com você. Veja “Todas” para as atividades da equipe.";
  }
  return html`<div class="dash-bar">
      <div>
        <h2 class="section-title">Atividades</h2>
        <p class="muted small act-intro">
          O que precisa ser feito: etapas em aberto (e projetos sem etapas), agrupadas pelo prazo.
        </p>
      </div>
      <div class="segmented compact" role="group" aria-label="De quem">
        ${scopes.map(
          (s) =>
            html`<button
              type="button"
              data-action="set-activity-scope"
              data-scope="${s.key}"
              ${s.key === state.activityScope && raw('aria-pressed="true"')}
            >
              ${s.label}
            </button>`,
        )}
      </div>
    </div>
    ${
      groups.length === 0
        ? html`<p class="empty">${empty}</p>`
        : html`<p class="count">${items.length} ${items.length === 1 ? "atividade" : "atividades"} em aberto</p>
            <div class="act-groups">${groups.map((g) => group(me, g, today))}</div>`
    }`;
}
