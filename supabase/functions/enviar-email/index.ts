import { loadAppointmentEmailData, sendEmail, supabaseAdmin } from '../_shared/email.ts'

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
  const { agendamento_id, to, template, data, negocio } = body
  const auth = req.headers.get('Authorization') || ''
  const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
  if (auth !== expected) {
    return new Response(JSON.stringify({ error: 'Nao autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = supabaseAdmin()
  let emailPayload = { to, template, data }
  let negocioData = negocio

  if (agendamento_id) {
    const loaded = await loadAppointmentEmailData(supabase, agendamento_id)
    if (!loaded) {
      return new Response(JSON.stringify({ error: 'Agendamento nao encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    negocioData = loaded.negocio
    emailPayload = {
      to: to || loaded.templateData.cliente_email,
      template,
      data: { ...loaded.templateData, ...(data || {}) },
    }
  }

  const result = await sendEmail(negocioData, emailPayload)
  return new Response(JSON.stringify({ ok: !result?.error, result }), {
    status: result?.error ? 502 : 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
