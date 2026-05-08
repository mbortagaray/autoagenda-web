import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: corsHeaders })
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: userError } = await sb.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: corsHeaders })
    }

    const { data: adminUser } = await sb
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!adminUser || adminUser.role !== 'superadmin') {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), { status: 403, headers: corsHeaders })
    }

    const { negocio_id } = await req.json()
    if (!negocio_id) {
      return new Response(JSON.stringify({ error: 'negocio_id obrigatório' }), { status: 400, headers: corsHeaders })
    }

    const { data: owner } = await sb
      .from('admin_users')
      .select('user_id')
      .eq('negocio_id', negocio_id)
      .eq('role', 'owner')
      .single()

    if (!owner) {
      return new Response(JSON.stringify({ error: 'Owner não encontrado para este negócio' }), { status: 404, headers: corsHeaders })
    }

    const { data: ownerData } = await sb.auth.admin.getUserById(owner.user_id)
    const ownerEmail = ownerData?.user?.email
    if (!ownerEmail) {
      return new Response(JSON.stringify({ error: 'Email não encontrado' }), { status: 404, headers: corsHeaders })
    }

    // Gerar magic link apontando para /go-admin que redirecionará para o admin
    const { data: linkData, error: linkError } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: ownerEmail,
      options: {
        redirectTo: 'https://agenda.mdinamic.com.br/go-admin',
      }
    })

    if (linkError) {
      return new Response(JSON.stringify({ error: linkError.message }), { status: 500, headers: corsHeaders })
    }

    return new Response(
      JSON.stringify({ url: linkData.properties.action_link }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
