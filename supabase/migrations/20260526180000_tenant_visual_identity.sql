alter table public.negocios add column if not exists cor_superficie text default '#FFFFFF';
alter table public.negocios add column if not exists tema_modo text default 'light';
alter table public.negocios add column if not exists logo_modo text default 'logo-text';
alter table public.negocios add column if not exists logo_tamanho text default 'md';

alter table public.negocios
  drop constraint if exists negocios_tema_modo_check;
alter table public.negocios
  add constraint negocios_tema_modo_check
  check (tema_modo in ('light', 'dark'));

alter table public.negocios
  drop constraint if exists negocios_logo_modo_check;
alter table public.negocios
  add constraint negocios_logo_modo_check
  check (logo_modo in ('text', 'logo-text', 'logo', 'badge'));

alter table public.negocios
  drop constraint if exists negocios_logo_tamanho_check;
alter table public.negocios
  add constraint negocios_logo_tamanho_check
  check (logo_tamanho in ('sm', 'md', 'lg'));
