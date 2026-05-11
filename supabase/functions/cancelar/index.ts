// Edge Function: POST /cancelar
// Cancela agendamento validando janela de cancelamento

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// Shared: Google Calendar helper functions — Service Account
// Usa JWT para autenticar via service account, sem OAuth por usuário

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

// Gera JWT assinado com a chave privada da service account
async function createJWT(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }

  const encode = (obj: any) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const headerB64 = encode(header)
  const payloadB64 = encode(payload)
  const signingInput = `${headerB64}.${payloadB64}`

  // Importar chave privada PEM
  const pemKey = serviceAccount.private_key
  const pemBody = pemKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const keyBuffer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const encoder = new TextEncoder()
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signingInput)
  )

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return `${signingInput}.${sigB64}`
}

// Obtém access token usando a service account
export async function getServiceAccountToken(): Promise<string | null> {
  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!serviceAccountJson) return null

  const serviceAccount = JSON.parse(serviceAccountJson)
  const jwt = await createJWT(serviceAccount)

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const data = await res.json()
  return data.access_token || null
}

// Mantém compatibilidade com código antigo que usa refresh_token
// Se não tem service account configurada, tenta via OAuth
export async function getAccessToken(refreshToken?: string): Promise<string | null> {
  // Tenta service account primeiro
  const saToken = await getServiceAccountToken()
  if (saToken) return saToken

  // Fallback OAuth (legado)
  if (!refreshToken) return null
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) return null

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const data = await res.json()
  return data.access_token || null
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: {
    summary: string
    description: string
    start: string
    end: string
    timeZone: string
  }
): Promise<string | null> {
  const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.start, timeZone: event.timeZone },
      end: { dateTime: event.end, timeZone: event.timeZone },
    }),
  })

  const data = await res.json()
  return data.id || null
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<boolean> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }
  )
  return res.ok
}


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

  // Remover evento do Google Calendar se existir
  try {
    if (agendamento.google_event_id && agendamento.profissional_id) {
      const { data: profData } = await supabase
        .from('profissionais')
        .select('google_calendar_id, google_refresh_token')
        .eq('id', agendamento.profissional_id)
        .single()

      if (profData?.google_calendar_id) {
        const accessToken = await getAccessToken(profData.google_refresh_token || undefined)
        if (accessToken) {
          await deleteCalendarEvent(accessToken, profData.google_calendar_id, agendamento.google_event_id)
        }
      }
    }
  } catch (e) {
    // Falha no calendar não bloqueia o cancelamento
  }

  return new Response(
    JSON.stringify({
      sucesso: true,
      mensagem: 'Agendamento cancelado com sucesso.',
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
