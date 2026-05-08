-- Fix profissional_horarios writes for tenant admins and impersonated admins.
-- The previous policy used an inline subquery. This helper keeps the tenant
-- check in one SECURITY DEFINER function, avoiding RLS ambiguity during inserts.

create or replace function public.can_manage_profissional(target_profissional_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profissionais p
    join public.admin_users au
      on au.user_id = auth.uid()
     and (
       au.role = 'superadmin'
       or (
         au.role in ('owner', 'admin')
         and au.negocio_id = p.negocio_id
       )
     )
    where p.id = target_profissional_id
  );
$$;

alter table public.profissional_horarios enable row level security;

drop policy if exists prof_horarios_admin_all on public.profissional_horarios;
drop policy if exists profissional_horarios_admin_all on public.profissional_horarios;

create policy profissional_horarios_admin_all
on public.profissional_horarios
for all
using (public.can_manage_profissional(profissional_id))
with check (public.can_manage_profissional(profissional_id));

