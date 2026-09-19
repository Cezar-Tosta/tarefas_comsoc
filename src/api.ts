import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { Profile, Role, Subtask, SubtaskInput, Task, TaskInput } from "./types";

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

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await db().from("tasks").select("*, subtasks(*)");
  check(error);
  const tasks = (data ?? []) as Task[];
  for (const task of tasks) {
    task.subtasks.sort((a, b) => a.position - b.position);
  }
  tasks.sort((a, b) => {
    const byStart = (a.start_date ?? "9999-12-31").localeCompare(b.start_date ?? "9999-12-31");
    return byStart === 0 ? a.title.localeCompare(b.title, "pt-BR") : byStart;
  });
  return tasks;
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

export async function setRole(id: string, role: Role): Promise<void> {
  const { data, error } = await db().from("profiles").update({ role }).eq("id", id).select("id");
  checkAffected(data, error);
}
