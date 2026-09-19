-- Tarefas COMSOC — migração 003: cada usuário só enxerga o que está ligado a ele.
-- Execute no SQL Editor do Supabase DEPOIS de schema.sql e 002_comments_links.sql. Pode reexecutar.
--
--   admin      : vê tudo
--   viewer     : vê tudo (somente leitura)
--   user       : vê a tarefa em que é responsável OU que tenha uma subtarefa atribuída a ele
--                (e, dentro dela, todas as subtarefas, comentários e links)
--   pending    : não vê nada
--
-- A função é security definer para consultar tasks/subtasks sem passar pela RLS
-- (evita "infinite recursion detected in policy").

create or replace function public.can_see_task (tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.my_role ()
    when 'admin' then true
    when 'viewer' then true
    when 'user' then exists (
      select 1
      from public.tasks t
      where t.id = tid
        and (
          t.assignee_id = auth.uid ()
          or exists (
            select 1 from public.subtasks s
            where s.task_id = t.id and s.assignee_id = auth.uid ()
          )
        )
    )
    else false
  end
$$;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (public.can_see_task (id));

drop policy if exists subtasks_select on public.subtasks;
create policy subtasks_select on public.subtasks
  for select to authenticated
  using (public.can_see_task (task_id));

-- comentários e links (migração 002): só se as tabelas existirem
do $$
begin
  if to_regclass ('public.comments') is not null then
    drop policy if exists comments_select on public.comments;
    create policy comments_select on public.comments
      for select to authenticated
      using (public.can_see_task (task_id));

    drop policy if exists comments_insert on public.comments;
    create policy comments_insert on public.comments
      for insert to authenticated
      with check (
        author_id = auth.uid ()
        and public.my_role () in ('admin', 'user')
        and public.can_see_task (task_id)
      );
  end if;

  if to_regclass ('public.task_links') is not null then
    drop policy if exists task_links_select on public.task_links;
    create policy task_links_select on public.task_links
      for select to authenticated
      using (public.can_see_task (task_id));
  end if;
end
$$;
