-- Tarefas COMSOC — migração 008: cada tarefa vira um projeto.
-- Execute no SQL Editor do Supabase DEPOIS da 007. Pode reexecutar.
--
--   tarefas      : escopo, critérios de aceite, orçamento e linha de base (datas originais)
--   task_expenses: despesas (custo real) — só administradores lançam e removem
--   task_journal : diário de bordo, a memória do projeto
--                  * administradores e usuários registram anotações, avanços, decisões,
--                    riscos, problemas e marcos (nas tarefas que podem ver)
--                  * o banco registra sozinho as mudanças relevantes ("system"): criação,
--                    status, prazos, responsável, orçamento, etapas e despesas
--                  * ninguém edita um registro; só o administrador apaga, e nunca os automáticos

-- ---------------------------------------------------------------------------
-- Tarefas: campos de projeto
-- ---------------------------------------------------------------------------

alter table public.tasks add column if not exists scope text not null default '';
alter table public.tasks add column if not exists success_criteria text not null default '';
alter table public.tasks add column if not exists budget numeric (14, 2);
alter table public.tasks add column if not exists baseline_start date;
alter table public.tasks add column if not exists baseline_end date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_project_checks') then
    alter table public.tasks add constraint tasks_project_checks check (
      length (scope) <= 5000
      and length (success_criteria) <= 5000
      and (budget is null or budget >= 0)
    );
  end if;
end
$$;

-- Linha de base: gravada na primeira vez em que as datas são definidas. O administrador pode
-- redefini-la enviando baseline_start/baseline_end explicitamente.
create or replace function public.tasks_set_baseline ()
returns trigger
language plpgsql
as $$
begin
  if new.baseline_start is null then
    new.baseline_start := new.start_date;
  end if;
  if new.baseline_end is null then
    new.baseline_end := new.end_date;
  end if;
  return new;
end;
$$;

-- O nome ordena depois de "tasks_guard" (gatilhos rodam em ordem alfabética).
drop trigger if exists tasks_set_baseline on public.tasks;
create trigger tasks_set_baseline
before insert or update on public.tasks
for each row execute function public.tasks_set_baseline ();

-- Tarefas existentes: as datas atuais viram a linha de base.
alter table public.tasks disable trigger tasks_guard;
update public.tasks
set baseline_start = coalesce (baseline_start, start_date),
    baseline_end = coalesce (baseline_end, end_date)
where baseline_start is null or baseline_end is null;
alter table public.tasks enable trigger tasks_guard;

-- ---------------------------------------------------------------------------
-- Despesas
-- ---------------------------------------------------------------------------

create table if not exists public.task_expenses (
  id uuid primary key default gen_random_uuid (),
  task_id uuid not null references public.tasks (id) on delete cascade,
  description text not null check (length (btrim (description)) > 0 and length (description) <= 200),
  amount numeric (14, 2) not null check (amount > 0),
  spent_on date not null default current_date,
  created_by uuid default auth.uid () references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists task_expenses_task_idx on public.task_expenses (task_id, spent_on);

alter table public.task_expenses enable row level security;
grant select, insert, delete on public.task_expenses to authenticated;

drop policy if exists task_expenses_select on public.task_expenses;
create policy task_expenses_select on public.task_expenses
  for select to authenticated
  using (public.can_see_task (task_id));

drop policy if exists task_expenses_insert on public.task_expenses;
create policy task_expenses_insert on public.task_expenses
  for insert to authenticated
  with check (public.is_admin ());

drop policy if exists task_expenses_delete on public.task_expenses;
create policy task_expenses_delete on public.task_expenses
  for delete to authenticated
  using (public.is_admin ());

-- ---------------------------------------------------------------------------
-- Diário de bordo
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'journal_kind') then
    create type public.journal_kind as enum (
      'note', 'progress', 'decision', 'risk', 'issue', 'milestone', 'system'
    );
  end if;
end
$$;

create table if not exists public.task_journal (
  id uuid primary key default gen_random_uuid (),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid default auth.uid () references public.profiles (id) on delete set null,
  kind public.journal_kind not null default 'note',
  body text not null check (length (btrim (body)) > 0 and length (body) <= 5000),
  created_at timestamptz not null default now()
);

create index if not exists task_journal_task_idx on public.task_journal (task_id, created_at);

alter table public.task_journal enable row level security;
-- sem "update": o diário só cresce
grant select, insert, delete on public.task_journal to authenticated;

drop policy if exists task_journal_select on public.task_journal;
create policy task_journal_select on public.task_journal
  for select to authenticated
  using (public.can_see_task (task_id));

drop policy if exists task_journal_insert on public.task_journal;
create policy task_journal_insert on public.task_journal
  for insert to authenticated
  with check (
    author_id = auth.uid ()
    and kind <> 'system'
    and public.my_role () in ('admin', 'user')
    and public.can_see_task (task_id)
  );

drop policy if exists task_journal_delete on public.task_journal;
create policy task_journal_delete on public.task_journal
  for delete to authenticated
  using (public.is_admin () and kind <> 'system');

-- ---------------------------------------------------------------------------
-- Registros automáticos
-- ---------------------------------------------------------------------------

-- security definer: grava como dono da tabela (passa pela RLS), com o autor da ação.
-- Se a tarefa estiver sendo excluída (cascata), simplesmente não registra.
create or replace function public.journal_log (tid uuid, message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.tasks where id = tid) then
    return;
  end if;
  insert into public.task_journal (task_id, author_id, kind, body)
  values (tid, auth.uid (), 'system', left (message, 5000));
exception
  when foreign_key_violation then
    null;
end;
$$;

revoke all on function public.journal_log (uuid, text) from public, anon, authenticated;

create or replace function public.journal_status_label (s public.task_status)
returns text
language sql
immutable
as $$
  select case s
    when 'todo' then 'A fazer'
    when 'doing' then 'Em andamento'
    when 'blocked' then 'Bloqueada'
    when 'done' then 'Concluída'
  end
$$;

create or replace function public.journal_date (d date)
returns text
language sql
immutable
as $$
  select coalesce (to_char (d, 'DD/MM/YYYY'), 'sem data')
$$;

create or replace function public.journal_money (n numeric)
returns text
language sql
immutable
as $$
  select case
    when n is null then 'sem orçamento'
    else 'R$ ' || replace (replace (replace (to_char (n, 'FM999G999G999G990D00'), ',', '#'), '.', ','), '#', '.')
  end
$$;

create or replace function public.journal_person (pid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce (
    (select nullif (name, '') from public.profiles where id = pid),
    case when pid is null then 'ninguém' else 'usuário removido' end
  )
$$;

-- Só os gatilhos (que rodam como dono) usam: não fica exposta como RPC.
revoke all on function public.journal_person (uuid) from public, anon, authenticated;

create or replace function public.tasks_journal ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.journal_log (new.id, 'Projeto criado: ' || new.title);
    return null;
  end if;

  if new.title is distinct from old.title then
    perform public.journal_log (new.id, format ('Título alterado de "%s" para "%s"', old.title, new.title));
  end if;
  if new.status is distinct from old.status then
    perform public.journal_log (new.id, format (
      'Status alterado de %s para %s',
      public.journal_status_label (old.status), public.journal_status_label (new.status)
    ));
  end if;
  if new.start_date is distinct from old.start_date then
    perform public.journal_log (new.id, format (
      'Início alterado de %s para %s', public.journal_date (old.start_date), public.journal_date (new.start_date)
    ));
  end if;
  if new.end_date is distinct from old.end_date then
    perform public.journal_log (new.id, format (
      'Prazo final alterado de %s para %s', public.journal_date (old.end_date), public.journal_date (new.end_date)
    ));
  end if;
  if new.baseline_end is distinct from old.baseline_end and old.baseline_end is not null then
    perform public.journal_log (new.id, format (
      'Linha de base redefinida: prazo final %s', public.journal_date (new.baseline_end)
    ));
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    perform public.journal_log (new.id, format (
      'Responsável alterado de %s para %s',
      public.journal_person (old.assignee_id), public.journal_person (new.assignee_id)
    ));
  end if;
  if new.budget is distinct from old.budget then
    perform public.journal_log (new.id, format (
      'Orçamento alterado de %s para %s', public.journal_money (old.budget), public.journal_money (new.budget)
    ));
  end if;
  if new.scope is distinct from old.scope then
    perform public.journal_log (new.id, 'Escopo atualizado');
  end if;
  if new.completed_at is not null and old.completed_at is null then
    perform public.journal_log (new.id, 'Projeto concluído');
  elsif new.completed_at is null and old.completed_at is not null then
    perform public.journal_log (new.id, 'Projeto reaberto');
  end if;
  return null;
end;
$$;

drop trigger if exists tasks_journal on public.tasks;
create trigger tasks_journal
after insert or update on public.tasks
for each row execute function public.tasks_journal ();

create or replace function public.subtasks_journal ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.journal_log (new.task_id, 'Etapa adicionada: ' || new.title);
  elsif tg_op = 'DELETE' then
    perform public.journal_log (old.task_id, 'Etapa removida: ' || old.title);
  else
    if new.done and not old.done then
      perform public.journal_log (new.task_id, 'Etapa concluída: ' || new.title);
    elsif old.done and not new.done then
      perform public.journal_log (new.task_id, 'Etapa reaberta: ' || new.title);
    end if;
    if new.end_date is distinct from old.end_date then
      perform public.journal_log (new.task_id, format (
        'Prazo da etapa "%s" alterado de %s para %s',
        new.title, public.journal_date (old.end_date), public.journal_date (new.end_date)
      ));
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists subtasks_journal on public.subtasks;
create trigger subtasks_journal
after insert or update or delete on public.subtasks
for each row execute function public.subtasks_journal ();

create or replace function public.expenses_journal ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.journal_log (new.task_id, format (
      'Despesa registrada: %s — %s', new.description, public.journal_money (new.amount)
    ));
  else
    perform public.journal_log (old.task_id, format (
      'Despesa removida: %s — %s', old.description, public.journal_money (old.amount)
    ));
  end if;
  return null;
end;
$$;

drop trigger if exists expenses_journal on public.task_expenses;
create trigger expenses_journal
after insert or delete on public.task_expenses
for each row execute function public.expenses_journal ();
