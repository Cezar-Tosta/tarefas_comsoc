import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Comment,
  Expense,
  JournalEntry,
  JournalKind,
  Profile,
  Role,
  Subtask,
  SubtaskInput,
  Task,
  TaskInput,
  TaskLink,
} from "./types";

const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const anonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

export const isConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error("Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
  }
  client ??= createClient(url, anonKey);
  return client;
}

function check(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

/** RLS filtra em silêncio: update/delete sem permissão "funciona" mas afeta 0 linhas. */
function checkAffected(data: unknown[] | null, error: { message: string } | null): void {
  check(error);
  if (!data || data.length === 0) {
    throw new Error("Sem permissão para esta alteração (ou o registro não existe mais).");
  }
}

// ---------- autenticação ----------

export async function getSession(): Promise<Session | null> {
  const { data, error } = await db().auth.getSession();
  check(error);
  return data.session;
}

export function onAuthChange(callback: (userId: string | null) => void): void {
  // Não faça chamadas ao Supabase dentro do callback (risco de deadlock): apenas notifique.
  db().auth.onAuthStateChange((_event, session) => {
    callback(session?.user.id ?? null);
  });
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await db().auth.signInWithPassword({ email, password });
  check(error);
}

/** Devolve true quando a conta já está logada (confirmação de e-mail desativada). */
export async function signUp(email: string, password: string, name: string): Promise<boolean> {
  const { data, error } = await db().auth.signUp({ email, password, options: { data: { name } } });
  check(error);
  return data.session !== null;
}

export async function signOut(): Promise<void> {
  const { error } = await db().auth.signOut();
  check(error);
}

// ---------- leitura ----------

export async function fetchProfile(id: string): Promise<Profile | null> {
  const { data, error } = await db().from("profiles").select("*").eq("id", id).maybeSingle();
  check(error);
  return (data as Profile | null) ?? null;
}

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await db().from("profiles").select("*").order("name");
  check(error);
  return (data ?? []) as Profile[];
}

/**
 * `extras` é false quando a migração 002 (comentários e links) ainda não foi executada;
 * `project` é false sem a 008 (escopo, orçamento, despesas e diário de bordo).
 * Tenta da consulta mais completa para a mais simples.
 */
export async function fetchTasks(): Promise<{ tasks: Task[]; extras: boolean; project: boolean }> {
  const attempts = [
    {
      select: "*, subtasks(*), task_links(*), comments(count), task_expenses(*)",
      extras: true,
      project: true,
    },
    { select: "*, subtasks(*), task_links(*), comments(count)", extras: true, project: false },
    { select: "*, subtasks(*)", extras: false, project: false },
  ];
  let data: unknown[] | null = null;
  let extras = false;
  let project = false;
  for (const [index, attempt] of attempts.entries()) {
    const result = await db().from("tasks").select(attempt.select);
    if (!result.error) {
      data = result.data;
      extras = attempt.extras;
      project = attempt.project;
      break;
    }
    // PGRST200: relação inexistente (migração ainda não aplicada) → tenta a próxima
    if (result.error.code !== "PGRST200" || index === attempts.length - 1) {
      throw new Error(result.error.message);
    }
  }
  const rows = (data ?? []) as (Omit<Task, "links" | "comment_count" | "expenses"> & {
    task_links?: TaskLink[];
    comments?: { count: number }[];
    task_expenses?: Expense[];
  })[];
  const tasks: Task[] = [];
  for (const { task_links = [], comments = [], task_expenses, ...rest } of rows) {
    const task: Task = {
      ...rest,
      links: task_links.toSorted((x, y) => x.created_at.localeCompare(y.created_at)),
      comment_count: comments[0]?.count ?? 0,
    };
    if (task_expenses) {
      task.expenses = task_expenses
        .map((e) => ({ ...e, amount: Number(e.amount) }))
        .toSorted((x, y) => x.spent_on.localeCompare(y.spent_on));
    }
    if (task.budget !== undefined && task.budget !== null) {
      task.budget = Number(task.budget);
    }
    tasks.push(task);
  }
  for (const task of tasks) {
    task.subtasks.sort((x, y) => x.position - y.position);
  }
  tasks.sort((x, y) => {
    const byStart = (x.start_date ?? "9999-12-31").localeCompare(y.start_date ?? "9999-12-31");
    return byStart === 0 ? x.title.localeCompare(y.title, "pt-BR") : byStart;
  });
  return { tasks, extras, project };
}

// ---------- escrita ----------

export async function saveTask(id: string | null, input: TaskInput): Promise<void> {
  if (id) {
    const { data, error } = await db().from("tasks").update(input).eq("id", id).select("id");
    checkAffected(data, error);
    return;
  }
  const { error } = await db().from("tasks").insert(input);
  check(error);
}

/** Concluir a própria tarefa (o único ajuste que um usuário faz nela). */
export async function completeTask(id: string): Promise<void> {
  const { data, error } = await db()
    .from("tasks")
    .update({ status: "done" })
    .eq("id", id)
    .select("id");
  checkAffected(data, error);
}

export async function deleteTask(id: string): Promise<void> {
  const { data, error } = await db().from("tasks").delete().eq("id", id).select("id");
  checkAffected(data, error);
}

export async function createSubtask(
  taskId: string,
  position: number,
  input: Partial<SubtaskInput> & Pick<SubtaskInput, "title">,
): Promise<void> {
  const { error } = await db()
    .from("subtasks")
    .insert({ ...input, task_id: taskId, position });
  check(error);
}

export async function updateSubtask(
  id: string,
  changes: Partial<Omit<Subtask, "id" | "task_id" | "position">>,
): Promise<void> {
  const { data, error } = await db().from("subtasks").update(changes).eq("id", id).select("id");
  checkAffected(data, error);
}

export async function deleteSubtask(id: string): Promise<void> {
  const { data, error } = await db().from("subtasks").delete().eq("id", id).select("id");
  checkAffected(data, error);
}

export async function updateProfile(
  id: string,
  changes: { name: string; role: Role },
): Promise<void> {
  const { data, error } = await db().from("profiles").update(changes).eq("id", id).select("id");
  checkAffected(data, error);
}

/** Exige a migração supabase/004_delete_user.sql. */
export async function deleteUser(id: string): Promise<void> {
  const { error } = await db().rpc("delete_user", { uid: id });
  check(error);
}

// ---------- comentários e links ----------

export async function fetchComments(taskId: string): Promise<Comment[]> {
  const { data, error } = await db()
    .from("comments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  check(error);
  return (data ?? []) as Comment[];
}

export async function addComment(taskId: string, body: string): Promise<void> {
  const { error } = await db().from("comments").insert({ task_id: taskId, body });
  check(error);
}

export async function deleteComment(id: string): Promise<void> {
  const { data, error } = await db().from("comments").delete().eq("id", id).select("id");
  checkAffected(data, error);
}

export async function addLink(taskId: string, href: string, title: string): Promise<void> {
  const { error } = await db().from("task_links").insert({ task_id: taskId, url: href, title });
  check(error);
}

export async function deleteLink(id: string): Promise<void> {
  const { data, error } = await db().from("task_links").delete().eq("id", id).select("id");
  checkAffected(data, error);
}

// ---------- projeto: despesas e diário de bordo (migração 008) ----------

export async function addExpense(
  taskId: string,
  input: { description: string; amount: number; spent_on: string },
): Promise<void> {
  const { error } = await db()
    .from("task_expenses")
    .insert({ ...input, task_id: taskId });
  check(error);
}

export async function deleteExpense(id: string): Promise<void> {
  const { data, error } = await db().from("task_expenses").delete().eq("id", id).select("id");
  checkAffected(data, error);
}

export async function fetchJournal(taskId: string): Promise<JournalEntry[]> {
  const { data, error } = await db()
    .from("task_journal")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  check(error);
  return (data ?? []) as JournalEntry[];
}

export async function addJournal(taskId: string, kind: JournalKind, body: string): Promise<void> {
  const { error } = await db().from("task_journal").insert({ task_id: taskId, kind, body });
  check(error);
}

export async function deleteJournal(id: string): Promise<void> {
  const { data, error } = await db().from("task_journal").delete().eq("id", id).select("id");
  checkAffected(data, error);
}
