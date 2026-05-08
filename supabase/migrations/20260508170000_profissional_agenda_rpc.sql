-- Public RPC used by the customer site to show a professional their agenda
-- by registered phone number. It returns only appointments for the matching
-- professional in the requested tenant/date.

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
  v_telefone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
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
    and regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g') = v_telefone
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

grant execute on function public.get_profissional_agenda(uuid, text, date) to anon, authenticated;

