-- Permite superadmin ler todos os admin_users (necessário pra listagem na UI)
CREATE OR REPLACE FUNCTION public.is_superadmin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid() AND role = 'superadmin'
  )
$$;

DROP POLICY IF EXISTS admin_users_superadmin_read ON public.admin_users;
CREATE POLICY admin_users_superadmin_read ON public.admin_users
FOR SELECT USING (public.is_superadmin());

DROP POLICY IF EXISTS admin_users_superadmin_write ON public.admin_users;
CREATE POLICY admin_users_superadmin_write ON public.admin_users
FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
