alter table public.servicos
  add column if not exists prazo_reativacao_dias integer;

alter table public.clientes
  add column if not exists email text,
  add column if not exists reativacao_enviada_em timestamptz,
  add column if not exists unsubscribe_reativacao boolean default false;

create index if not exists idx_servicos_reativacao
  on public.servicos(negocio_id, prazo_reativacao_dias)
  where prazo_reativacao_dias is not null;

create index if not exists idx_clientes_reativacao
  on public.clientes(negocio_id, reativacao_enviada_em, unsubscribe_reativacao)
  where email is not null;
