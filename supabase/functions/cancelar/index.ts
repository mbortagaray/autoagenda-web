// Edge Function: POST /cancelar
// Cancela agendamento validando janela de cancelamento

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
  const { agendamento_id, cliente_telefone } = body

  if (!agendamento_id || !cliente_telefone) {
    return new Response(
      JSON.stringify({ error: 'Campos obrigatórios: agendamento_id, cliente_telefone' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Buscar agendamento
  const { data: ag } = await supabase
    .from('agendamentos')
    .select('*, negocios(janela_cancelamento_horas, fuso_horario)')
    .eq('id', agendamento_id)
    .eq('status', 'confirmado')
    .single()

  if (!ag) {
    return new Response(
      JSON.stringify({ error: 'Agendamento não encontrado ou já cancelado' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Verificar telefone
  const telLimpo = cliente_telefone.replace(/\D/g, '')
  if (ag.cliente_telefone !== telLimpo) {
    return new Response(
      JSON.stringify({ error: 'Telefone não confere com o agendamento' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Verificar janela de cancelamento
  const negocio = ag.negocios as any
  const janelaHoras = negocio?.janela_cancelamento_horas || 24
  const dataHoraAg = new Date(`${ag.data}T${ag.hora}:00-03:00`)
  const agora = new Date()
  const diffHoras = (dataHoraAg.getTime() - agora.getTime()) / (1000 * 60 * 60)

  if (diffHoras < janelaHoras) {
    return new Response(
      JSON.stringify({
        error: `Cancelamento permitido apenas com ${janelaHoras}h de antecedência. Faltam ${Math.max(0, Math.floor(diffHoras))}h para o horário.`,
      }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Cancelar
  const { error: errUpdate } = await supabase
    .from('agendamentos')
    .update({ status: 'cancelado' })
    .eq('id', agendamento_id)

  if (errUpdate) {
    return new Response(
      JSON.stringify({ error: 'Erro ao cancelar', detalhe: errUpdate.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({
      sucesso: true,
      mensagem: 'Agendamento cancelado com sucesso.',
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
