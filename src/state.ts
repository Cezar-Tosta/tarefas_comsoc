import { HEALTHS, SORT_KEYS, type SortKey } from "./lib/control";
import { DEFAULT_FILTERS, type Filters } from "./lib/filters";
import type { JournalFilter } from "./lib/journal";
import type { Zoom } from "./lib/gantt";
import { emptyReadState, type ReadState } from "./lib/unread";
import type { Comment, JournalEntry, Profile, Task } from "./types";

/** "project" é a página de um projeto (não aparece no menu). */
export type View = "dashboard" | "tasks" | "gantt" | "reports" | "users" | "project";
/** Abas do menu (o que pode ser lembrado entre visitas). */
export type NavView = Exclude<View, "project">;
export type DashLayout = "cards" | "list";
/** Painel: só o que está em andamento ou tudo (inclusive concluídos e arquivados). */
export type DashScope = "open" | "all" | "archived";
/** Atividades: só as da pessoa ou as de todos. */
export type ActivityScope = "mine" | "all";
export type Screen = "loading" | "setup" | "login" | "pending" | "main";

export interface State {
  screen: Screen;
  authMode: "signin" | "signup";
  authMessage: string;
  me: Profile | null;
  profiles: Profile[];
  tasks: Task[];
  /** Comentários e links disponíveis (migração 002 aplicada no banco). */
  extras: boolean;
  /** Gestão de projeto disponível (migração 008: escopo, orçamento, diário de bordo). */
  project: boolean;
  view: View;
  /** Projeto aberto na página de projeto e a aba para onde "Voltar" leva. */
  projectId: string | null;
  projectBack: NavView;
  /** Diário de bordo do projeto aberto. */
  journal: JournalEntry[];
  journalFilter: JournalFilter;
  dashLayout: DashLayout;
  dashSort: SortKey;
  dashScope: DashScope;
  filters: Filters;
  zoom: Zoom;
  showSubtasks: boolean;
  /** Painel de filtros aberto (só tem efeito no celular). */
  filtersOpen: boolean;
  /** Conversa aberta no diálogo de comentários. */
  chatTaskId: string | null;
  comments: Comment[];
  /** Tarefas cujo grupo "Concluídas" está aberto. */
  openDone: Set<string>;
  activityScope: ActivityScope;
  /** Comentários já vistos (por navegador e usuário). */
  read: ReadState;
  /** Relatórios (por pessoa) expandidos na aba Relatório (por padrão todos encolhidos). */
  openPeople: Set<string>;
  /** Relatórios (por pessoa) com o detalhamento aberto. */
  openReports: Set<string>;
}

export const state: State = {
  screen: "loading",
  authMode: "signin",
  authMessage: "",
  me: null,
  profiles: [],
  tasks: [],
  extras: true,
  project: true,
  view: "dashboard",
  projectId: null,
  projectBack: "dashboard",
  journal: [],
  journalFilter: "all",
  dashLayout: "cards",
  dashSort: "deadline",
  dashScope: "open",
  filters: { ...DEFAULT_FILTERS },
  zoom: "week",
  showSubtasks: true,
  filtersOpen: false,
  chatTaskId: null,
  comments: [],
  openDone: new Set(),
  activityScope: "all",
  read: emptyReadState(),
  openPeople: new Set(),
  openReports: new Set(),
};

export function currentUser(): Profile {
  if (!state.me) {
    throw new Error("Sessão não carregada");
  }
  return state.me;
}

const PREFS_KEY = "tarefas-comsoc:prefs";
const VIEWS: NavView[] = ["dashboard", "tasks", "gantt", "reports", "users"];
const ZOOMS: Zoom[] = ["day", "week", "month"];

const readKey = (userId: string): string => `tarefas-comsoc:read:${userId}`;

export function loadRead(userId: string): ReadState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(readKey(userId)) ?? "null");
    if (typeof parsed !== "object" || parsed === null) {
      return emptyReadState();
    }
    const raw = parsed as Record<string, unknown>;
    const read = emptyReadState();
    const seen = raw["seen"];
    if (typeof seen === "object" && seen !== null) {
      for (const [id, count] of Object.entries(seen)) {
        if (typeof count === "number") {
          read.seen[id] = count;
        }
      }
    }
    const mine = raw["mine"];
    if (Array.isArray(mine)) {
      read.mine = mine.filter((id): id is string => typeof id === "string");
    }
    return read;
  } catch {
    return emptyReadState();
  }
}

export function saveRead(userId: string, read: ReadState): void {
  try {
    localStorage.setItem(readKey(userId), JSON.stringify(read));
  } catch {
    // ignora: sem armazenamento local os avisos apenas recomeçam do zero.
  }
}

export function loadPrefs(): void {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null) {
      return;
    }
    const prefs = parsed as Record<string, unknown>;
    const view = prefs["view"];
    if (typeof view === "string" && (VIEWS as string[]).includes(view)) {
      state.view = view as View;
    }
    const layout = prefs["dashLayout"];
    if (layout === "cards" || layout === "list") {
      state.dashLayout = layout;
    }
    const sort = prefs["dashSort"];
    if (typeof sort === "string" && (SORT_KEYS as string[]).includes(sort)) {
      state.dashSort = sort as SortKey;
    }
    const scope = prefs["dashScope"];
    if (scope === "open" || scope === "all" || scope === "archived") {
      state.dashScope = scope;
    }
    const zoom = prefs["zoom"];
    if (typeof zoom === "string" && (ZOOMS as string[]).includes(zoom)) {
      state.zoom = zoom as Zoom;
    }
    if (typeof prefs["showSubtasks"] === "boolean") {
      state.showSubtasks = prefs["showSubtasks"];
    }
    const filters = prefs["filters"];
    if (typeof filters === "object" && filters !== null) {
      const saved = filters as Record<string, unknown>;
      const next: Filters = { ...DEFAULT_FILTERS };
      for (const key of Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]) {
        const value = saved[key];
        if (typeof value === typeof DEFAULT_FILTERS[key]) {
          (next as unknown as Record<string, unknown>)[key] = value;
        }
      }
      if (next.health !== "all" && !(HEALTHS as string[]).includes(next.health)) {
        next.health = "all";
      }
      state.filters = next;
    }
  } catch {
    // localStorage indisponível ou JSON corrompido: segue com os padrões.
  }
}

export function savePrefs(): void {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        view: state.view === "project" ? state.projectBack : state.view,
        dashLayout: state.dashLayout,
        dashSort: state.dashSort,
        dashScope: state.dashScope,
        zoom: state.zoom,
        showSubtasks: state.showSubtasks,
        filters: state.filters,
      }),
    );
  } catch {
    // ignora: preferências são apenas conveniência.
  }
}
