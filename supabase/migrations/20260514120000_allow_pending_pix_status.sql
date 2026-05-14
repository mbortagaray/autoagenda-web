alter table public.agendamentos
  drop constraint if exists agendamentos_status_check;

alter table public.agendamentos
  add constraint agendamentos_status_check
  check (status in ('confirmado', 'cancelado', 'remarcado', 'concluido', 'aguardando_pagamento'));
