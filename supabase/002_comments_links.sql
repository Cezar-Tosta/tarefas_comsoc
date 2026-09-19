-- Tarefas COMSOC — migração 002: comentários (chat) e links nas tarefas.
-- Execute no SQL Editor do Supabase DEPOIS de schema.sql. Rodar uma vez só.
--
--   comentários: administradores e usuários escrevem; visualizadores só leem.
--                Apagar: o autor ou um administrador. Não há edição.
--   links:       quem pode editar a tarefa (admin ou o responsável) adiciona/remove.

create table public.comments (
  id uuid primary key default gen_random_uuid (),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid default auth.uid () references public.profiles (id) on delete set null,
  body text not null check (length(btrim(body)) > 0 and length(body) <= 2000),
  created_at timestamptz not null default now()
);

create table public.task_links (
  id uuid primary key default gen_random_uuid (),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null default '' check (length(title) <= 120),
  url text not null check (url ~* '^https?://' and length(url) <= 2000),
  created_by uuid default auth.uid () references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index comments_task_idx on public.comments (task_id, created_at);
create index task_links_task_idx on public.task_links (task_id);

alter table public.comments enable row level security;
alter table public.task_links enable row level security;

grant select, insert, delete on public.comments to authenticated;
grant select, insert, delete on public.task_links to authenticated;

-- comments
create policy comments_select on public.comments
  for select to authenticated
  using (public.my_role () in ('admin', 'user', 'viewer'));

create policy comments_insert on public.comments
  for insert to authenticated
  with check (author_id = auth.uid () and public.my_role () in ('admin', 'user'));

create policy comments_delete on public.comments
  for delete to authenticated
  using (public.is_admin () or (public.my_role () = 'user' and author_id = auth.uid ()));

-- task_links
create policy task_links_select on public.task_links
  for select to authenticated
  using (public.my_role () in ('admin', 'user', 'viewer'));

create policy task_links_insert on public.task_links
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

create policy task_links_delete on public.task_links
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
