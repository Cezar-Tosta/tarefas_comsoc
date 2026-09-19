-- Tarefas COMSOC — esquema do banco (Supabase / Postgres).
-- Execute inteiro no SQL Editor do Supabase. É seguro reexecutar em um projeto vazio;
-- em um projeto já criado, rode apenas as partes novas.
--
-- Perfis:
--   admin   : tudo (criar/editar/excluir tarefas e subtarefas, atribuir responsáveis, gerir usuários)
--   user    : edita apenas tarefas atribuídas a ele (e as subtarefas delas) e subtarefas atribuídas a ele
--   viewer  : somente leitura
--   pending : conta recém-criada, sem acesso até um admin aprovar (o primeiro cadastro vira admin)

create type public.app_role as enum ('admin', 'user', 'viewer', 'pending');
create type public.task_status as enum ('todo', 'doing', 'blocked', 'done');
create type public.task_priority as enum ('low', 'medium', 'high');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null default '',
  role public.app_role not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0 and length(title) <= 200),
  description text not null default '' check (length(description) <= 5000),
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'medium',
  start_date date,
  end_date date,
  assignee_id uuid references public.profiles (id) on delete set null,
  created_by uuid default auth.uid () references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date is null or end_date is null or start_date <= end_date)
);

create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0 and length(title) <= 200),
  done boolean not null default false,
  start_date date,
  end_date date,
  assignee_id uuid references public.profiles (id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date is null or end_date is null or start_date <= end_date)
);

create index tasks_assignee_idx on public.tasks (assignee_id);
create index subtasks_task_idx on public.subtasks (task_id);
create index subtasks_assignee_idx on public.subtasks (assignee_id);

-- ---------------------------------------------------------------------------
-- Funções auxiliares (security definer: leem profiles sem passar pela RLS)
-- ---------------------------------------------------------------------------

create or replace function public.my_role ()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid ()
$$;

create or replace function public.is_admin ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce (public.my_role () = 'admin', false)
$$;

-- Cria o perfil ao cadastrar. O primeiro usuário vira admin; os demais ficam pendentes.
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    coalesce (new.email, ''),
    coalesce (nullif (btrim (new.raw_user_meta_data ->> 'name'), ''), split_part (coalesce (new.email, ''), '@', 1)),
    case
      when exists (select 1 from public.profiles) then 'pending'::public.app_role
      else 'admin'::public.app_role
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user ();

-- ---------------------------------------------------------------------------
-- Guardas: regras que a RLS por linha não expressa (colunas imutáveis / reatribuição)
-- ---------------------------------------------------------------------------

create or replace function public.tasks_guard ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now ();
  new.created_by := old.created_by;
  if not public.is_admin () and new.assignee_id is distinct from old.assignee_id then
    raise exception 'Somente administradores podem alterar o responsável da tarefa'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tasks_guard
before update on public.tasks
for each row execute function public.tasks_guard ();

create or replace function public.subtasks_guard ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_owner uuid;
begin
  new.updated_at := now ();
  if not public.is_admin () then
    if new.task_id <> old.task_id then
      raise exception 'Não é permitido mover subtarefas entre tarefas' using errcode = '42501';
    end if;
    if new.assignee_id is distinct from old.assignee_id then
      select assignee_id into task_owner from public.tasks where id = new.task_id;
      if task_owner is distinct from auth.uid () then
        raise exception 'Somente o responsável pela tarefa pode reatribuir subtarefas'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger subtasks_guard
before update on public.subtasks
for each row execute function public.subtasks_guard ();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.subtasks to authenticated;

-- profiles: cada um vê o próprio; perfis ativos veem todos; só admin altera (nunca o próprio, evita se trancar fora)
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid () or public.my_role () in ('admin', 'user', 'viewer'));

create policy profiles_update on public.profiles
  for update to authenticated
  using (public.is_admin () and id <> auth.uid ())
  with check (public.is_admin () and id <> auth.uid ());

-- tasks
create policy tasks_select on public.tasks
  for select to authenticated
  using (public.my_role () in ('admin', 'user', 'viewer'));

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.is_admin ());

create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_admin () or (public.my_role () = 'user' and assignee_id = auth.uid ()))
  with check (public.is_admin () or (public.my_role () = 'user' and assignee_id = auth.uid ()));

create policy tasks_delete on public.tasks
  for delete to authenticated
  using (public.is_admin ());

-- subtasks
create policy subtasks_select on public.subtasks
  for select to authenticated
  using (public.my_role () in ('admin', 'user', 'viewer'));

create policy subtasks_insert on public.subtasks
  for insert to authenticated
  with check (
    public.is_admin ()
    or (
      public.my_role () = 'user'
      and exists (
        select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid ()
      )
    )
  );

create policy subtasks_update on public.subtasks
  for update to authenticated
  using (
    public.is_admin ()
    or (
      public.my_role () = 'user'
      and (
        assignee_id = auth.uid ()
        or exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid ())
      )
    )
  )
  with check (
    public.is_admin ()
    or (
      public.my_role () = 'user'
      and (
        assignee_id = auth.uid ()
        or exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid ())
      )
    )
  );

create policy subtasks_delete on public.subtasks
  for delete to authenticated
  using (
    public.is_admin ()
    or (
      public.my_role () = 'user'
      and exists (
        select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid ()
      )
    )
  );
