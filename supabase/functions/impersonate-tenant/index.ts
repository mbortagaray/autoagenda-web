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

    // Verificar se é superadmin
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

    // Buscar owner do negócio
    const { data: owner } = await sb
      .from('admin_users')
      .select('user_id')
      .eq('negocio_id', negocio_id)
      .eq('role', 'owner')
      .single()

    if (!owner) {
      return new Response(JSON.stringify({ error: 'Owner não encontrado para este negócio' }), { status: 404, headers: corsHeaders })
    }

    // Gerar link mágico e substituir o redirect manualmente
    const { data: ownerUserData } = await sb.auth.admin.getUserById(owner.user_id)
    const ownerEmail = ownerUserData?.user?.email
    if (!ownerEmail) {
      return new Response(JSON.stringify({ error: 'Email do owner não encontrado' }), { status: 404, headers: corsHeaders })
    }

    const { data, error } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: ownerEmail,
    })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
    }

    // Substituir o redirect_to no link gerado para apontar para o admin
    const originalUrl = new URL(data.properties.action_link)
    originalUrl.searchParams.set('redirect_to', 'https://agenda-admin.mdinamic.com.br?impersonating=true')
    
    return new Response(
      JSON.stringify({ url: originalUrl.toString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
