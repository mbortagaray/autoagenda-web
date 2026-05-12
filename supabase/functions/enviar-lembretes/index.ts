import { loadAppointmentEmailData, sendEmail, supabaseAdmin } from '../_shared/email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function tomorrowSaoPaulo() {
  const now = new Date()
  const saoPaulo = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  saoPaulo.setDate(saoPaulo.getDate() + 1)
  return saoPaulo.toISOString().split('T')[0]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const auth = req.headers.get('Authorization') || ''
  const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
  const cronSecret = Deno.env.get('EMAIL_CRON_SECRET')
  const expectedCron = cronSecret ? `Bearer ${cronSecret}` : ''
  if (auth !== expected && (!expectedCron || auth !== expectedCron)) {
    return new Response(JSON.stringify({ error: 'Nao autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = supabaseAdmin()
  const targetDate = tomorrowSaoPaulo()
  const { data: rows, error } = await supabase
    .from('agendamentos')
    .select('id')
    .eq('status', 'confirmado')
    .eq('data', targetDate)
    .is('lembrete_email_enviado_em', null)
    .not('cliente_email', 'is', null)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let sent = 0
  let skipped = 0
  for (const row of rows || []) {
    const loaded = await loadAppointmentEmailData(supabase, row.id)
    if (!loaded?.templateData.cliente_email) {
      skipped++
      continue
    }
    const result = await sendEmail(loaded.negocio, {
      to: loaded.templateData.cliente_email,
      template: 'lembrete_cliente',
      data: loaded.templateData,
    })
    if (!result?.error && !result?.skipped) {
      sent++
      await supabase
        .from('agendamentos')
        .update({ lembrete_email_enviado_em: new Date().toISOString() })
        .eq('id', row.id)
    } else {
      skipped++
    }
  }

  return new Response(JSON.stringify({ ok: true, date: targetDate, sent, skipped }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
