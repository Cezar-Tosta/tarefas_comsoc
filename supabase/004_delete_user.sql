-- Tarefas COMSOC — migração 004: exclusão de usuários pela aba Usuários.
-- Execute no SQL Editor do Supabase. Pode reexecutar.
--
-- Só administradores, e nunca a própria conta. Apaga o login (auth.users); o perfil cai em cascata
-- e as tarefas/subtarefas/comentários/links dele ficam sem responsável/autor (on delete set null).

create or replace function public.delete_user (uid uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin () then
    raise exception 'Apenas administradores podem excluir usuários.';
  end if;
  if uid = auth.uid () then
    raise exception 'Você não pode excluir a própria conta.';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_user (uuid) from public, anon;
grant execute on function public.delete_user (uuid) to authenticated;
