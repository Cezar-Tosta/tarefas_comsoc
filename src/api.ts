import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Comment,
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

/** `extras` é false quando a migração 002 (comentários e links) ainda não foi executada. */
export async function fetchTasks(): Promise<{ tasks: Task[]; extras: boolean }> {
  const full = await db().from("tasks").select("*, subtasks(*), task_links(*), comments(count)");
  let extras = true;
  let data: unknown[] | null = full.data;
  if (full.error) {
    if (full.error.code !== "PGRST200") {
      throw new Error(full.error.message);
    }
    extras = false;
    const base = await db().from("tasks").select("*, subtasks(*)");
    check(base.error);
    data = base.data;
  }
  const rows = (data ?? []) as (Omit<Task, "links" | "comment_count"> & {
    task_links?: TaskLink[];
    comments?: { count: number }[];
  })[];
  const tasks: Task[] = [];
  for (const { task_links = [], comments = [], ...rest } of rows) {
    tasks.push({
      ...rest,
      links: task_links.toSorted((x, y) => x.created_at.localeCompare(y.created_at)),
      comment_count: comments[0]?.count ?? 0,
    });
  }
  for (const task of tasks) {
    task.subtasks.sort((x, y) => x.position - y.position);
  }
  tasks.sort((x, y) => {
    const byStart = (x.start_date ?? "9999-12-31").localeCompare(y.start_date ?? "9999-12-31");
    return byStart === 0 ? x.title.localeCompare(y.title, "pt-BR") : byStart;
  });
  return { tasks, extras };
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
