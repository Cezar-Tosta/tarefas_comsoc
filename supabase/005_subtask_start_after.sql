-- Tarefas COMSOC — migração 005: subtarefa que começa logo após o término de outra.
-- Execute no SQL Editor do Supabase. Pode reexecutar.
--
-- start_after_id: a subtarefa (da mesma tarefa) cujo término libera o início desta. O app calcula
-- o início como o dia seguinte ao fim da anterior. Se a anterior for excluída, o vínculo some.

alter table public.subtasks
  add column if not exists start_after_id uuid references public.subtasks (id) on delete set null;

alter table public.subtasks
  drop constraint if exists subtasks_start_after_not_self;

alter table public.subtasks
  add constraint subtasks_start_after_not_self check (start_after_id is distinct from id);

create index if not exists subtasks_start_after_idx on public.subtasks (start_after_id);
