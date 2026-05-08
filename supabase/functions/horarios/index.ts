// Edge Function: GET /horarios?negocio_id=...&profissional_id=...&data=2026-04-05&duracao_min=60
// Retorna slots disponíveis para a data, usando horários do profissional

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

interface Slot {
  hora: string
  disponivel: boolean
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minToTime(m: number): string {
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' +
         String(m % 60).padStart(2, '0')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const negocioId = url.searchParams.get('negocio_id')
  const profissionalId = url.searchParams.get('profissional_id')
  const data = url.searchParams.get('data')
  const duracaoMin = parseInt(url.searchParams.get('duracao_min') || '60')

  if (!negocioId || !profissionalId || !data) {
    return new Response(
      JSON.stringify({ error: 'Parâmetros obrigatórios: negocio_id, profissional_id, data' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Buscar fuso horário do negócio
  const { data: negocio } = await supabase
    .from('negocios')
    .select('fuso_horario')
    .eq('id', negocioId)
    .single()

  if (!negocio) {
    return new Response(
      JSON.stringify({ error: 'Negócio não encontrado' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Verificar dia da semana
  const dataObj = new Date(data + 'T12:00:00')
  const diasSemana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']
  const diaSemana = diasSemana[dataObj.getDay()]

  // Buscar horários do profissional para este dia da semana
  const { data: horariosProf } = await supabase
    .from('profissional_horarios')
    .select('hora_inicio, hora_fim')
    .eq('profissional_id', profissionalId)
    .eq('dia_semana', diaSemana)
    .order('hora_inicio')

  if (!horariosProf || horariosProf.length === 0) {
    return new Response(
      JSON.stringify({ manha: [], tarde: [], noite: [], mensagem: 'Profissional não atende neste dia' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Buscar agendamentos do dia (confirmados)
  const { data: agendamentos } = await supabase
    .from('agendamentos')
    .select('hora, duracao_min')
    .eq('profissional_id', profissionalId)
    .eq('data', data)
    .eq('status', 'confirmado')

  // Buscar bloqueios do dia
  const { data: bloqueios } = await supabase
    .from('bloqueios')
    .select('hora_inicio, hora_fim')
    .eq('profissional_id', profissionalId)
    .eq('data', data)

  // Montar intervalos ocupados
  const ocupados: { inicio: number, fim: number }[] = []

  for (const ag of (agendamentos || [])) {
    const inicio = timeToMin(ag.hora)
    ocupados.push({ inicio, fim: inicio + ag.duracao_min })
  }

  for (const bl of (bloqueios || [])) {
    ocupados.push({ inicio: timeToMin(bl.hora_inicio), fim: timeToMin(bl.hora_fim) })
  }

  // Gerar slots a partir dos horários do profissional
  const INTERVALO = 30
  const slots: Slot[] = []

  for (const periodo of horariosProf) {
    const inicPeriodo = timeToMin(periodo.hora_inicio)
    const fimPeriodo = timeToMin(periodo.hora_fim)

    for (let min = inicPeriodo; min + duracaoMin <= fimPeriodo; min += INTERVALO) {
      const fimSlot = min + duracaoMin
      const conflito = ocupados.some(oc => min < oc.fim && fimSlot > oc.inicio)
      slots.push({ hora: minToTime(min), disponivel: !conflito })
    }
  }

  // Se a data é hoje, remover horários que já passaram
  const agora = new Date()
  const fusoOffset = negocio.fuso_horario === 'America/Sao_Paulo' ? -3 : 0
  const agoraLocal = new Date(agora.getTime() + fusoOffset * 3600000)
  const hojeStr = agoraLocal.toISOString().split('T')[0]

  if (data === hojeStr) {
    const minAtual = agoraLocal.getHours() * 60 + agoraLocal.getMinutes()
    for (const slot of slots) {
      if (timeToMin(slot.hora) <= minAtual) {
        slot.disponivel = false
      }
    }
  }

  // Separar em períodos: manhã (<12h), tarde (12h-18h), noite (>=18h)
  const manha = slots.filter(s => timeToMin(s.hora) < 720)
  const tarde = slots.filter(s => timeToMin(s.hora) >= 720 && timeToMin(s.hora) < 1080)
  const noite = slots.filter(s => timeToMin(s.hora) >= 1080)

  return new Response(
    JSON.stringify({
      data,
      profissional_id: profissionalId,
      duracao_min: duracaoMin,
      manha,
      tarde,
      noite,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
