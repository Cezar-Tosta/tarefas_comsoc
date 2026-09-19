import { DEFAULT_FILTERS, type Filters } from "./lib/filters";
import type { Zoom } from "./lib/gantt";
import type { Profile, Task } from "./types";

export type View = "tasks" | "gantt" | "users";
export type Screen = "loading" | "setup" | "login" | "pending" | "main";

export interface State {
  screen: Screen;
  authMode: "signin" | "signup";
  authMessage: string;
  me: Profile | null;
  profiles: Profile[];
  tasks: Task[];
  view: View;
  filters: Filters;
  zoom: Zoom;
  showSubtasks: boolean;
  /** Tarefas cujo grupo "Concluídas" está aberto. */
  openDone: Set<string>;
}

export const state: State = {
  screen: "loading",
  authMode: "signin",
  authMessage: "",
  me: null,
  profiles: [],
  tasks: [],
  view: "tasks",
  filters: { ...DEFAULT_FILTERS },
  zoom: "week",
  showSubtasks: true,
  openDone: new Set(),
};

export function currentUser(): Profile {
  if (!state.me) {
    throw new Error("Sessão não carregada");
  }
  return state.me;
}

const PREFS_KEY = "tarefas-comsoc:prefs";
const VIEWS: View[] = ["tasks", "gantt", "users"];
const ZOOMS: Zoom[] = ["day", "week", "month"];

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
