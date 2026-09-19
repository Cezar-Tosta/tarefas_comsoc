import { DEFAULT_FILTERS, type Filters } from "./lib/filters";
import type { Zoom } from "./lib/gantt";
import { emptyReadState, type ReadState } from "./lib/unread";
import type { Comment, Profile, Task } from "./types";

export type View = "tasks" | "gantt" | "reports" | "users";
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
  view: View;
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
  /** Lista exibida na aba Tarefas: ativas ou arquivadas (concluídas há 10 dias ou mais). */
  taskList: "active" | "archived";
  /** Comentários já vistos (por navegador e usuário). */
  read: ReadState;
  /** Tarefas expandidas na aba Tarefas (por padrão todas aparecem encolhidas). */
  openTasks: Set<string>;
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
  view: "tasks",
  filters: { ...DEFAULT_FILTERS },
  zoom: "week",
  showSubtasks: true,
  filtersOpen: false,
  chatTaskId: null,
  comments: [],
  openDone: new Set(),
  taskList: "active",
  read: emptyReadState(),
  openTasks: new Set(),
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
const VIEWS: View[] = ["tasks", "gantt", "reports", "users"];
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
        view: state.view,
        zoom: state.zoom,
        showSubtasks: state.showSubtasks,
        filters: state.filters,
      }),
    );
  } catch {
    // ignora: preferências são apenas conveniência.
  }
}
