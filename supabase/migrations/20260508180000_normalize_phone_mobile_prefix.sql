-- Normalize BR phones consistently:
-- fixed lines keep 8 digits after DDD, mobile lines with 8 digits get the ninth digit.

create or replace function public.normalize_br_phone(raw_phone text)
returns text
language sql
immutable
as $$
  with cleaned as (
    select regexp_replace(coalesce(raw_phone, ''), '\D', '', 'g') as d
  ),
  no_country_code as (
    select case
      when length(d) > 11 and left(d, 2) = '55' then substr(d, 3)
      else d
    end as d
    from cleaned
  )
  select case
    when length(d) = 10 and substring(d from 3 for 1) in ('6', '7', '8', '9')
      then left(d, 2) || '9' || substring(d from 3)
    else left(d, 11)
  end
  from no_country_code;
$$;

grant execute on function public.normalize_br_phone(text) to anon, authenticated;
