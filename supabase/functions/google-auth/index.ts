// Edge Function: GET /google-auth?profissional_id=...
// Redireciona para Google OAuth2 consent screen

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const profissionalId = url.searchParams.get('profissional_id')

  if (!profissionalId) {
    return new Response('profissional_id obrigatório', { status: 400 })
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const redirectUri = Deno.env.get('SUPABASE_URL') + '/functions/v1/google-callback'

  const scopes = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
  ]

  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: profissionalId,
  }).toString()

  return Response.redirect(authUrl, 302)
})
