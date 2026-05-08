-- AutoAgenda baseline schema and RLS.
-- Safe to review before applying: this migration creates missing objects and
-- adds missing columns without dropping application data.

create extension if not exists "uuid-ossp";

create table if not exists public.negocios (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  nome text not null,
  telefone text,
  logo_url text,
  cor_primaria text default '#3D2B1F',
  cor_secundaria text default '#C4947A',
  cor_fundo text default '#F9F5F0',
  horario_abertura_manha time default '08:00',
  horario_fechamento_manha time default '12:00',
  horario_abertura_tarde time default '13:00',
  horario_fechamento_tarde time default '18:00',
  dias_atendimento text[] default '{seg,ter,qua,qui,sex,sab}',
  janela_cancelamento_horas integer default 24,
  fuso_horario text default 'America/Sao_Paulo',
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.negocios add column if not exists endereco text;
alter table public.negocios add column if not exists cidade text;
alter table public.negocios add column if not exists google_maps_url text;

create table if not exists public.profissionais (
  id uuid primary key default uuid_generate_v4(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  nome text not null,
  telefone text,
  avatar_emoji text default ':)',
  avatar_cor text default '#E8DDD0',
  foto_url text,
  google_calendar_id text,
  google_refresh_token text,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profissionais add column if not exists foto_url text;
alter table public.profissionais add column if not exists google_refresh_token text;
create index if not exists idx_profissionais_negocio on public.profissionais(negocio_id);

create table if not exists public.servicos (
  id uuid primary key default uuid_generate_v4(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  nome text not null,
  duracao_min integer not null default 60,
  preco numeric(10,2) not null default 0,
  preco_promocional numeric(10,2),
  promocao_ativa boolean default false,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.servicos add column if not exists preco_promocional numeric(10,2);
alter table public.servicos add column if not exists promocao_ativa boolean default false;
create index if not exists idx_servicos_negocio on public.servicos(negocio_id);

create table if not exists public.profissional_servicos (
  profissional_id uuid not null references public.profissionais(id) on delete cascade,
  servico_id uuid not null references public.servicos(id) on delete cascade,
  primary key (profissional_id, servico_id)
);

create table if not exists public.profissional_horarios (
  id uuid primary key default uuid_generate_v4(),
  profissional_id uuid not null references public.profissionais(id) on delete cascade,
  dia_semana text not null check (dia_semana in ('dom','seg','ter','qua','qui','sex','sab')),
  hora_inicio time not null,
  hora_fim time not null,
  created_at timestamptz default now(),
  check (hora_inicio < hora_fim)
);

create index if not exists idx_profissional_horarios_profissional
  on public.profissional_horarios(profissional_id, dia_semana);

create table if not exists public.clientes (
  id uuid primary key default uuid_generate_v4(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  nome text not null,
  telefone text not null,
  pin text,
  email text,
  unsubscribe boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (negocio_id, telefone)
);

create index if not exists idx_clientes_negocio on public.clientes(negocio_id);
create index if not exists idx_clientes_telefone on public.clientes(telefone);
alter table public.clientes add column if not exists email text;
alter table public.clientes add column if not exists unsubscribe boolean default false;
create unique index if not exists idx_clientes_negocio_telefone_unique
  on public.clientes(negocio_id, telefone);

create table if not exists public.agendamentos (
  id uuid primary key default uuid_generate_v4(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  profissional_id uuid not null references public.profissionais(id),
  servico_id uuid not null references public.servicos(id),
  cliente_nome text not null,
  cliente_telefone text not null,
  data date not null,
  hora time not null,
  duracao_min integer not null,
  status text not null default 'confirmado',
  google_event_id text,
  origem text not null default 'web',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (status in ('confirmado', 'cancelado', 'remarcado', 'concluido')),
  check (origem in ('web', 'whatsapp', 'admin'))
);

create index if not exists idx_agendamentos_negocio on public.agendamentos(negocio_id);
create index if not exists idx_agendamentos_profissional_data on public.agendamentos(profissional_id, data);
create index if not exists idx_agendamentos_cliente_tel on public.agendamentos(cliente_telefone);

create table if not exists public.bloqueios (
  id uuid primary key default uuid_generate_v4(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  profissional_id uuid references public.profissionais(id) on delete cascade,
  data date,
  data_inicio date,
  data_fim date,
  hora_inicio time,
  hora_fim time,
  tipo text default 'dia_unico',
  motivo text,
  google_event_id text,
  created_at timestamptz default now()
);

alter table public.bloqueios alter column profissional_id drop not null;
alter table public.bloqueios alter column data drop not null;
alter table public.bloqueios alter column hora_inicio drop not null;
alter table public.bloqueios alter column hora_fim drop not null;
alter table public.bloqueios add column if not exists data_inicio date;
alter table public.bloqueios add column if not exists data_fim date;
alter table public.bloqueios add column if not exists tipo text default 'dia_unico';
create index if not exists idx_bloqueios_profissional_data on public.bloqueios(profissional_id, data);
create index if not exists idx_bloqueios_negocio_periodo on public.bloqueios(negocio_id, data_inicio, data_fim);

create table if not exists public.admin_users (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  negocio_id uuid references public.negocios(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz default now(),
  unique (user_id, negocio_id)
);

alter table public.admin_users alter column negocio_id drop not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.admin_users'::regclass
      and conname = 'admin_users_role_check'
  ) then
    alter table public.admin_users drop constraint admin_users_role_check;
  end if;
end $$;

alter table public.admin_users
  add constraint admin_users_role_check
  check (role in ('superadmin', 'owner', 'admin'));

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_negocios_updated on public.negocios;
create trigger trg_negocios_updated
before update on public.negocios
for each row execute function public.update_updated_at();

drop trigger if exists trg_profissionais_updated on public.profissionais;
create trigger trg_profissionais_updated
before update on public.profissionais
for each row execute function public.update_updated_at();

drop trigger if exists trg_servicos_updated on public.servicos;
create trigger trg_servicos_updated
before update on public.servicos
for each row execute function public.update_updated_at();

drop trigger if exists trg_clientes_updated on public.clientes;
create trigger trg_clientes_updated
before update on public.clientes
for each row execute function public.update_updated_at();

drop trigger if exists trg_agendamentos_updated on public.agendamentos;
create trigger trg_agendamentos_updated
before update on public.agendamentos
for each row execute function public.update_updated_at();

create or replace function public.get_my_negocio_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select negocio_id
  from public.admin_users
  where user_id = auth.uid()
    and role in ('owner', 'admin')
  limit 1;
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and role = 'superadmin'
  );
$$;

alter table public.negocios enable row level security;
alter table public.profissionais enable row level security;
alter table public.servicos enable row level security;
alter table public.profissional_servicos enable row level security;
alter table public.profissional_horarios enable row level security;
alter table public.clientes enable row level security;
alter table public.agendamentos enable row level security;
alter table public.bloqueios enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists negocios_read_public on public.negocios;
create policy negocios_read_public on public.negocios
  for select using (ativo = true or public.is_superadmin() or id = public.get_my_negocio_id());

drop policy if exists negocios_admin_all on public.negocios;
create policy negocios_admin_all on public.negocios
  for all using (public.is_superadmin() or id = public.get_my_negocio_id())
  with check (public.is_superadmin() or id = public.get_my_negocio_id());

drop policy if exists profissionais_read_public on public.profissionais;
create policy profissionais_read_public on public.profissionais
  for select using (ativo = true or public.is_superadmin() or negocio_id = public.get_my_negocio_id());

drop policy if exists profissionais_admin_all on public.profissionais;
create policy profissionais_admin_all on public.profissionais
  for all using (public.is_superadmin() or negocio_id = public.get_my_negocio_id())
  with check (public.is_superadmin() or negocio_id = public.get_my_negocio_id());

drop policy if exists servicos_read_public on public.servicos;
create policy servicos_read_public on public.servicos
  for select using (ativo = true or public.is_superadmin() or negocio_id = public.get_my_negocio_id());

drop policy if exists servicos_admin_all on public.servicos;
create policy servicos_admin_all on public.servicos
  for all using (public.is_superadmin() or negocio_id = public.get_my_negocio_id())
  with check (public.is_superadmin() or negocio_id = public.get_my_negocio_id());

drop policy if exists prof_servicos_read_public on public.profissional_servicos;
drop policy if exists profissional_servicos_read_public on public.profissional_servicos;
create policy profissional_servicos_read_public on public.profissional_servicos
  for select using (
    true
    or public.is_superadmin()
    or profissional_id in (select id from public.profissionais where negocio_id = public.get_my_negocio_id())
  );

drop policy if exists prof_servicos_admin_all on public.profissional_servicos;
create policy prof_servicos_admin_all on public.profissional_servicos
  for all using (
    public.is_superadmin()
    or profissional_id in (select id from public.profissionais where negocio_id = public.get_my_negocio_id())
  )
  with check (
    public.is_superadmin()
    or profissional_id in (select id from public.profissionais where negocio_id = public.get_my_negocio_id())
  );

drop policy if exists prof_horarios_read_public on public.profissional_horarios;
create policy prof_horarios_read_public on public.profissional_horarios
  for select using (true);

drop policy if exists prof_horarios_admin_all on public.profissional_horarios;
create policy prof_horarios_admin_all on public.profissional_horarios
  for all using (
    public.is_superadmin()
    or profissional_id in (select id from public.profissionais where negocio_id = public.get_my_negocio_id())
  )
  with check (
    public.is_superadmin()
    or profissional_id in (select id from public.profissionais where negocio_id = public.get_my_negocio_id())
  );

drop policy if exists clientes_admin_all on public.clientes;
create policy clientes_admin_all on public.clientes
  for all using (public.is_superadmin() or negocio_id = public.get_my_negocio_id())
  with check (public.is_superadmin() or negocio_id = public.get_my_negocio_id());

drop policy if exists agendamentos_admin_all on public.agendamentos;
create policy agendamentos_admin_all on public.agendamentos
  for all using (public.is_superadmin() or negocio_id = public.get_my_negocio_id())
  with check (public.is_superadmin() or negocio_id = public.get_my_negocio_id());

drop policy if exists agendamentos_read_blocked on public.agendamentos;
create policy agendamentos_read_blocked on public.agendamentos
  for select using (false);

drop policy if exists bloqueios_read_public on public.bloqueios;
create policy bloqueios_read_public on public.bloqueios
  for select using (true);

drop policy if exists bloqueios_admin_all on public.bloqueios;
create policy bloqueios_admin_all on public.bloqueios
  for all using (public.is_superadmin() or negocio_id = public.get_my_negocio_id())
  with check (public.is_superadmin() or negocio_id = public.get_my_negocio_id());

drop policy if exists admin_users_self on public.admin_users;
create policy admin_users_self on public.admin_users
  for select using (user_id = auth.uid() or public.is_superadmin());

drop policy if exists admin_users_superadmin_all on public.admin_users;
create policy admin_users_superadmin_all on public.admin_users
  for all using (public.is_superadmin())
  with check (public.is_superadmin());

insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists fotos_public_read on storage.objects;
create policy fotos_public_read on storage.objects
  for select using (bucket_id = 'fotos');

drop policy if exists fotos_admin_write on storage.objects;
create policy fotos_admin_write on storage.objects
  for all using (
    bucket_id = 'fotos'
    and (public.is_superadmin() or public.get_my_negocio_id() is not null)
  )
  with check (
    bucket_id = 'fotos'
    and (public.is_superadmin() or public.get_my_negocio_id() is not null)
  );
