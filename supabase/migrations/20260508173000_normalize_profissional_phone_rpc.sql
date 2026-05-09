-- Normalize professional phone matching with or without Brazil country code.

create or replace function public.normalize_br_phone(raw_phone text)
returns text
language sql
immutable
as $$
  select case
    when length(regexp_replace(coalesce(raw_phone, ''), '\D', '', 'g')) > 11
      and left(regexp_replace(coalesce(raw_phone, ''), '\D', '', 'g'), 2) = '55'
    then right(regexp_replace(coalesce(raw_phone, ''), '\D', '', 'g'), 11)
    else regexp_replace(coalesce(raw_phone, ''), '\D', '', 'g')
  end;
$$;

create or replace function public.get_profissional_agenda(
  p_negocio_id uuid,
  p_telefone text,
  p_data date default current_date
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_telefone text := public.normalize_br_phone(p_telefone);
  v_profissional record;
  v_agendamentos jsonb;
begin
  if p_negocio_id is null or length(v_telefone) < 10 then
    return jsonb_build_object('profissional', null, 'agendamentos', '[]'::jsonb);
  end if;

  select p.id, p.nome
    into v_profissional
  from public.profissionais p
  where p.negocio_id = p_negocio_id
    and p.ativo = true
    and public.normalize_br_phone(p.telefone) = v_telefone
  limit 1;

  if v_profissional.id is null then
    return jsonb_build_object('profissional', null, 'agendamentos', '[]'::jsonb);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'data', a.data,
        'hora', a.hora,
        'duracao_min', a.duracao_min,
        'status', a.status,
        'cliente_nome', a.cliente_nome,
        'cliente_telefone', a.cliente_telefone,
        'servico', coalesce(s.nome, ''),
        'preco', coalesce(s.preco, 0)
      )
      order by a.hora
    ),
    '[]'::jsonb
  )
    into v_agendamentos
  from public.agendamentos a
  left join public.servicos s on s.id = a.servico_id
  where a.negocio_id = p_negocio_id
    and a.profissional_id = v_profissional.id
    and a.data = p_data
    and a.status <> 'cancelado';

  return jsonb_build_object(
    'profissional', jsonb_build_object(
      'id', v_profissional.id,
      'nome', v_profissional.nome
    ),
    'data', p_data,
    'agendamentos', v_agendamentos
  );
end;
$$;

grant execute on function public.normalize_br_phone(text) to anon, authenticated;
grant execute on function public.get_profissional_agenda(uuid, text, date) to anon, authenticated;

