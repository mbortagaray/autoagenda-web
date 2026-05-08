# Supabase

This folder now keeps the backend contract for AutoAgenda in version control.

## Contents

- `migrations/20260508153000_baseline_schema_and_rls.sql`
  - Baseline schema used by the current public app, admin, and superadmin.
  - Adds superadmin-aware RLS policies.
  - Creates/updates the `fotos` storage bucket policies.
  - Uses defensive `create table if not exists` and `add column if not exists` statements.

- `functions/`
  - Current functions: `criar-admin-user`, `impersonate-tenant`.
  - Recovered legacy functions from the old local copy: `config`, `horarios`, `agendar`, `cancelar`, `cliente-lookup`, `meus-agendamentos`, `google-auth`, `google-callback`, plus `_shared/google-calendar.ts`.

## Before Applying Remotely

Review the migration against the live Supabase project first. The local folder was an old copy, so this migration is intentionally conservative and should be applied only after confirming the live schema does not have incompatible custom constraints.

Required Edge Function secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

