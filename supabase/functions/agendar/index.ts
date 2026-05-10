// Edge Function: POST /agendar
// Cria agendamento no Supabase (+ sync Google Calendar async)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getAccessToken, createCalendarEvent } from '../_shared/google-calendar.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Método não permitido' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const body = await req.json()
  const { negocio_id, profissional_id, servico_id, data, hora, cliente_nome, cliente_telefone, cliente_pin } = body

  // Validar campos obrigatórios
  if (!negocio_id || !profissional_id || !servico_id || !data || !hora || !cliente_nome || !cliente_telefone) {
    return new Response(
      JSON.stringify({ error: 'Todos os campos são obrigatórios: negocio_id, profissional_id, servico_id, data, hora, cliente_nome, cliente_telefone' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Buscar serviço para pegar duração
  const { data: servico } = await supabase
    .from('servicos')
    .select('nome, duracao_min, preco')
    .eq('id', servico_id)
    .single()

  if (!servico) {
    return new Response(
      JSON.stringify({ error: 'Serviço não encontrado' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Verificar disponibilidade (evitar double-booking)
  const { data: conflitos } = await supabase
    .from('agendamentos')
    .select('hora, duracao_min')
    .eq('profissional_id', profissional_id)
    .eq('data', data)
    .eq('status', 'confirmado')

  const novoInicio = timeToMin(hora)
  const novoFim = novoInicio + servico.duracao_min

  const temConflito = (conflitos || []).some(ag => {
    const agInicio = timeToMin(ag.hora)
    const agFim = agInicio + ag.duracao_min
    return novoInicio < agFim && novoFim > agInicio
  })

  if (temConflito) {
    return new Response(
      JSON.stringify({ error: 'Horário não está mais disponível. Escolha outro horário.' }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Verificar bloqueios
  const { data: bloqueios } = await supabase
    .from('bloqueios')
    .select('hora_inicio, hora_fim, tipo')
    .eq('negocio_id', negocio_id)
    .or(`profissional_id.eq.${profissional_id},profissional_id.is.null`)
    .or(`data.eq.${data},and(data_inicio.lte.${data},data_fim.gte.${data})`)

  const horariosEspeciais = (bloqueios || []).filter(bl => bl.tipo === 'horario_especial')
  const dentroHorarioEspecial = !horariosEspeciais.length || horariosEspeciais.some(bl => {
    const blInicio = timeToMin(bl.hora_inicio || '00:00')
    const blFim = timeToMin(bl.hora_fim || '23:59')
    return novoInicio >= blInicio && novoFim <= blFim
  })

  if (!dentroHorarioEspecial) {
    return new Response(
      JSON.stringify({ error: 'Horário fora do funcionamento especial deste dia.' }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const temBloqueio = (bloqueios || []).filter(bl => bl.tipo !== 'horario_especial').some(bl => {
    const blInicio = timeToMin(bl.hora_inicio || '00:00')
    const blFim = timeToMin(bl.hora_fim || '23:59')
    return novoInicio < blFim && novoFim > blInicio
  })

  if (temBloqueio) {
    return new Response(
      JSON.stringify({ error: 'Horário bloqueado pela profissional.' }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Buscar nome da profissional
  const { data: prof } = await supabase
    .from('profissionais')
    .select('nome')
    .eq('id', profissional_id)
    .single()

  // Salvar/atualizar cliente (com PIN se fornecido)
  const telLimpo = cliente_telefone.replace(/\D/g, '')
  const clienteData: any = { negocio_id, nome: cliente_nome, telefone: telLimpo }
  if (cliente_pin) clienteData.pin = cliente_pin
  await supabase
    .from('clientes')
    .upsert(clienteData, { onConflict: 'negocio_id,telefone' })

  // Criar agendamento
  const { data: agendamento, error: errInsert } = await supabase
    .from('agendamentos')
    .insert({
      negocio_id,
      profissional_id,
      servico_id,
      cliente_nome,
      cliente_telefone: cliente_telefone.replace(/\D/g, ''),
      data,
      hora,
      duracao_min: servico.duracao_min,
      status: 'confirmado',
      origem: 'web',
    })
    .select()
    .single()

  if (errInsert) {
    return new Response(
      JSON.stringify({ error: 'Erro ao criar agendamento', detalhe: errInsert.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Google Calendar sync (async, não bloqueia resposta)
  try {
    const { data: profData } = await supabase
      .from('profissionais')
      .select('google_refresh_token, google_calendar_id')
      .eq('id', profissional_id)
      .single()

    if (profData?.google_calendar_id) {
      const accessToken = await getAccessToken(profData.google_refresh_token || undefined)
      if (accessToken) {
        const startHour = hora.split(':')
        const startDate = `${data}T${hora}:00`
        const endMin = parseInt(startHour[0]) * 60 + parseInt(startHour[1]) + servico.duracao_min
        const endH = String(Math.floor(endMin / 60)).padStart(2, '0')
        const endM = String(endMin % 60).padStart(2, '0')
        const endDate = `${data}T${endH}:${endM}:00`

        const { data: negData } = await supabase
          .from('negocios')
          .select('fuso_horario, nome')
          .eq('id', negocio_id)
          .single()

        const eventId = await createCalendarEvent(accessToken, profData.google_calendar_id, {
          summary: `${servico.nome} - ${cliente_nome}`,
          description: `Cliente: ${cliente_nome}\nTelefone: ${cliente_telefone}\nServiço: ${servico.nome}\nAgendado via ${negData?.nome || 'AutoAgenda'}`,
          start: startDate,
          end: endDate,
          timeZone: negData?.fuso_horario || 'America/Sao_Paulo',
        })

        if (eventId) {
          await supabase
            .from('agendamentos')
            .update({ google_event_id: eventId })
            .eq('id', agendamento.id)
        }
      }
    }
  } catch (e) {
    // Calendar sync failure should not block the appointment
    console.error('Google Calendar sync error:', e)
  }

  // Formatar data para exibição
  const [ano, mes, dia] = data.split('-')
  const dataFmt = `${dia}/${mes}/${ano}`

  return new Response(
    JSON.stringify({
      sucesso: true,
      agendamento: {
        id: agendamento.id,
        servico: servico.nome,
        profissional: prof?.nome || '',
        data: dataFmt,
        hora,
        duracao_min: servico.duracao_min,
        preco: servico.preco,
        cliente_nome,
      },
      mensagem: `Agendamento confirmado! ${servico.nome} com ${prof?.nome} em ${dataFmt} às ${hora}.`,
    }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
