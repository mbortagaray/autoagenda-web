-- Email notifications support for appointments.

alter table public.negocios add column if not exists email_remetente text;
alter table public.negocios add column if not exists email_remetente_nome text;
alter table public.negocios add column if not exists email_notificacoes_ativas boolean default true;

alter table public.profissionais add column if not exists email text;

alter table public.agendamentos add column if not exists cliente_email text;
alter table public.agendamentos add column if not exists confirmacao_email_enviada_em timestamptz;
alter table public.agendamentos add column if not exists cancelamento_email_enviado_em timestamptz;
alter table public.agendamentos add column if not exists lembrete_email_enviado_em timestamptz;

create index if not exists idx_agendamentos_lembrete_email
  on public.agendamentos(data, status, lembrete_email_enviado_em)
  where status = 'confirmado';
