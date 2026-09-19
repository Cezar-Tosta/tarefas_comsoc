-- Tarefas COMSOC — migração 007: data de conclusão da tarefa (base da lista "Arquivados").
-- Execute no SQL Editor do Supabase DEPOIS da 006. Pode reexecutar.
--
-- completed_at é calculada pelo banco (o cliente não a define):
--   com subtarefas : preenchida quando todas ficam concluídas; limpa se alguma for reaberta
--   sem subtarefas : preenchida quando o status vira "concluída"; limpa se for reaberta
-- O app arquiva a tarefa 10 dias depois dessa data.

alter table public.tasks add column if not exists completed_at timestamptz;

-- Guarda da tarefa: mantém as regras da 006 (usuário só conclui) e recalcula completed_at.
create or replace function public.tasks_guard ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
  finished integer;
  is_done boolean;
begin
  new.updated_at := now ();
  new.created_by := old.created_by;
  if not public.is_admin () then
    if (to_jsonb (new) - 'status' - 'updated_at' - 'completed_at')
      is distinct from (to_jsonb (old) - 'status' - 'updated_at' - 'completed_at') then
      raise exception 'Somente administradores podem alterar os dados da tarefa'
        using errcode = '42501';
    end if;
    if new.status is distinct from old.status and new.status <> 'done' then
      raise exception 'Você só pode marcar a tarefa como concluída'
        using errcode = '42501';
    end if;
  end if;

  select count (*), count (*) filter (where done)
    into total, finished
    from public.subtasks
    where task_id = new.id;
  is_done := case when total > 0 then finished = total else new.status = 'done' end;
  new.completed_at := case when is_done then coalesce (old.completed_at, now ()) else null end;
  return new;
end;
$$;

-- Tarefa criada já concluída.
create or replace function public.tasks_completion_insert ()
returns trigger
language plpgsql
as $$
begin
  new.completed_at := case when new.status = 'done' then now () else null end;
  return new;
end;
$$;

drop trigger if exists tasks_completion_insert on public.tasks;
create trigger tasks_completion_insert
before insert on public.tasks
for each row execute function public.tasks_completion_insert ();

-- Mexeu numa subtarefa: "toca" a tarefa para o guarda recalcular completed_at.
create or replace function public.subtasks_touch_task ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update public.tasks set updated_at = now () where id = new.task_id;
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.task_id <> new.task_id) then
    update public.tasks set updated_at = now () where id = old.task_id;
  end if;
  return null;
end;
$$;

drop trigger if exists subtasks_touch_task on public.subtasks;
create trigger subtasks_touch_task
after insert or update or delete on public.subtasks
for each row execute function public.subtasks_touch_task ();

-- Tarefas que já estão concluídas: usa a última atualização como data de conclusão.
alter table public.tasks disable trigger tasks_guard;

update public.tasks t
set completed_at = t.updated_at
where t.completed_at is null
  and case
    when exists (select 1 from public.subtasks s where s.task_id = t.id)
      then not exists (select 1 from public.subtasks s where s.task_id = t.id and not s.done)
    else t.status = 'done'
  end;

alter table public.tasks enable trigger tasks_guard;
