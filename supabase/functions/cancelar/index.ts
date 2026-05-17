// Edge Function: POST /cancelar
// Cancela agendamento validando janela de cancelamento, remove Calendar e dispara emails.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getAccessToken, deleteCalendarEvent } from '../_shared/google-calendar.ts'
import { loadAppointmentEmailData, sendEmail } from '../_shared/email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Metodo nao permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const body = await req.json()
  const { agendamento_id, cliente_telefone, origem } = body
  const isAdminCancel = origem === 'admin'

  if (!agendamento_id || (!cliente_telefone && !isAdminCancel)) {
    return new Response(JSON.stringify({ error: 'Campos obrigatorios: agendamento_id, cliente_telefone' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: ag } = await supabase
    .from('agendamentos')
    .select('*, negocios(janela_cancelamento_horas, fuso_horario)')
    .eq('id', agendamento_id)
    .in('status', ['confirmado', 'aguardando_pagamento'])
    .single()

  if (!ag) {
    return new Response(JSON.stringify({ error: 'Agendamento nao encontrado ou ja cancelado' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (isAdminCancel) {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: userData } = await supabase.auth.getUser(token)
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', userData.user?.id || '')
      .eq('negocio_id', ag.negocio_id)
      .maybeSingle()

    if (!adminUser) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  } else {
    const telLimpo = String(cliente_telefone || '').replace(/\D/g, '')
    if (ag.cliente_telefone !== telLimpo) {
      return new Response(JSON.stringify({ error: 'Telefone nao confere com o agendamento' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  const negocio = ag.negocios as any
  const janelaHoras = negocio?.janela_cancelamento_horas || 24
  const tz = negocio?.fuso_horario || 'America/Sao_Paulo'
  // Converte data+hora local do negócio para UTC usando o fuso correto
  const pivot = new Date(`${ag.data}T${ag.hora}:00+00:00`)
  const pivotInTZ = pivot.toLocaleString('sv-SE', { timeZone: tz })
  const tzDate = new Date(pivotInTZ.replace(' ', 'T') + '+00:00')
  const dataHoraAg = new Date(pivot.getTime() + (pivot.getTime() - tzDate.getTime()))
  const agora = new Date()
  const diffHoras = (dataHoraAg.getTime() - agora.getTime()) / (1000 * 60 * 60)

  if (!isAdminCancel && diffHoras < janelaHoras) {
    return new Response(
      JSON.stringify({
        error: `Cancelamento permitido apenas com ${janelaHoras}h de antecedencia. Faltam ${Math.max(0, Math.floor(diffHoras))}h para o horario.`,
      }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { error: errUpdate } = await supabase
    .from('agendamentos')
    .update({ status: 'cancelado' })
    .eq('id', agendamento_id)

  if (errUpdate) {
    return new Response(JSON.stringify({ error: 'Erro ao cancelar', detalhe: errUpdate.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    if (ag.google_event_id && ag.profissional_id) {
      const { data: profData } = await supabase
        .from('profissionais')
        .select('google_calendar_id, google_refresh_token')
        .eq('id', ag.profissional_id)
        .single()

      if (profData?.google_calendar_id) {
        const accessToken = await getAccessToken(profData.google_refresh_token || undefined)
        if (accessToken) {
          await deleteCalendarEvent(accessToken, profData.google_calendar_id, ag.google_event_id)
        }
      }
    }
  } catch (e) {
    console.error('Calendar cancel sync error:', e)
  }

  try {
    const loaded = await loadAppointmentEmailData(supabase, agendamento_id)
    if (loaded) {
      await sendEmail(loaded.negocio, {
        to: loaded.templateData.cliente_email,
        template: 'cancelamento_cliente',
        data: loaded.templateData,
      })
      if (!isAdminCancel) {
        await sendEmail(loaded.negocio, {
          to: loaded.templateData.profissional_email,
          template: 'cancelamento_profissional',
          data: loaded.templateData,
        })
      }
      await supabase
        .from('agendamentos')
        .update({ cancelamento_email_enviado_em: new Date().toISOString() })
        .eq('id', agendamento_id)
    }
  } catch (e) {
    console.error('Cancel email notification error:', e)
  }

  return new Response(JSON.stringify({ sucesso: true, mensagem: 'Agendamento cancelado com sucesso.' }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
