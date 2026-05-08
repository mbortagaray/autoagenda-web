// Edge Function: GET /google-callback?code=...&state=profissional_id
// Troca authorization code por refresh_token e salva no profissional

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const profissionalId = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    return new Response(htmlPage('Erro', 'Autorização negada. Você pode fechar esta janela.'), {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  if (!code || !profissionalId) {
    return new Response('Parâmetros inválidos', { status: 400 })
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!
  const redirectUri = Deno.env.get('SUPABASE_URL') + '/functions/v1/google-callback'

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await tokenRes.json()

  if (!tokens.refresh_token) {
    return new Response(htmlPage('Erro', 'Não foi possível obter o token. Tente novamente.'), {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  // Get user's primary calendar email
  const calRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
    headers: { 'Authorization': `Bearer ${tokens.access_token}` },
  })
  const calData = await calRes.json()
  const calendarId = calData.id || 'primary'

  // Save refresh_token and calendar_id
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  await supabase
    .from('profissionais')
    .update({
      google_refresh_token: tokens.refresh_token,
      google_calendar_id: calendarId,
    })
    .eq('id', profissionalId)

  return new Response(
    htmlPage('Conectado!', `Google Calendar vinculado com sucesso (${calendarId}). Você pode fechar esta janela.`),
    { headers: { 'Content-Type': 'text/html' } }
  )
})

function htmlPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f7;margin:0}
.card{background:#fff;border-radius:16px;padding:40px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.1);max-width:400px}
h1{color:#3D2B1F;font-size:24px;margin-bottom:12px}p{color:#666;font-size:15px}</style>
</head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`
}
