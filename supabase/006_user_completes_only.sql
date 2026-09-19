-- Tarefas COMSOC — migração 006: usuários só concluem e comentam.
-- Execute no SQL Editor do Supabase DEPOIS das migrações anteriores. Pode reexecutar.
--
-- O que o administrador cria, o perfil "user" não altera nem exclui:
--   tarefas    : só pode mudar o status para "concluída" (nas que são dele); nada mais
--   subtarefas : só pode marcar/desmarcar "done" (nas dele ou de tarefa dele); nada mais
--   criar/excluir subtarefas e links: somente administradores
--   comentários: continuam como antes (administradores e usuários; usuários só veem
--                as tarefas ligadas a eles, veja 003)

create or replace function public.tasks_guard ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now ();
  new.created_by := old.created_by;
  if not public.is_admin () then
    if (to_jsonb (new) - 'status' - 'updated_at')
      is distinct from (to_jsonb (old) - 'status' - 'updated_at') then
      raise exception 'Somente administradores podem alterar os dados da tarefa'
        using errcode = '42501';
    end if;
    if new.status is distinct from old.status and new.status <> 'done' then
      raise exception 'Você só pode marcar a tarefa como concluída'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.subtasks_guard ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now ();
  if not public.is_admin () then
    if (to_jsonb (new) - 'done' - 'updated_at')
      is distinct from (to_jsonb (old) - 'done' - 'updated_at') then
      raise exception 'Você só pode marcar a subtarefa como concluída'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop policy if exists subtasks_insert on public.subtasks;
create policy subtasks_insert on public.subtasks
  for insert to authenticated
  with check (public.is_admin ());

drop policy if exists subtasks_delete on public.subtasks;
create policy subtasks_delete on public.subtasks
  for delete to authenticated
  using (public.is_admin ());

drop policy if exists task_links_insert on public.task_links;
create policy task_links_insert on public.task_links
  for insert to authenticated
  with check (public.is_admin ());

drop policy if exists task_links_delete on public.task_links;
create policy task_links_delete on public.task_links
  for delete to authenticated
  using (public.is_admin ());
