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
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verificar que o chamador é superadmin
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: userData } = await sb.auth.getUser(token)
    const { data: caller } = await sb
      .from('admin_users')
      .select('role')
      .eq('user_id', userData.user?.id || '')
      .single()
    if (!caller || caller.role !== 'superadmin') {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), { status: 403, headers: corsHeaders })
    }

    const { email, senha, negocio_id, role } = await req.json()
    const allowNoNegocio = role === 'superadmin' || role === 'admin'

    if (!email || !senha || !role || (!allowNoNegocio && !negocio_id)) {
      return new Response(
        JSON.stringify({ error: 'email, senha e role são obrigatórios' }),
        { status: 400, headers: corsHeaders }
      )
    }

    // Criar usuário no Auth
    const { data: newUser, error: createError } = await sb.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    })

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: corsHeaders }
      )
    }

    // Inserir na tabela admin_users
    const { error: insertError } = await sb
      .from('admin_users')
      .insert({
        user_id: newUser.user.id,
        negocio_id: allowNoNegocio ? null : negocio_id,
        role,
        email,
      })

    if (insertError) {
      // Rollback — deletar usuário criado
      await sb.auth.admin.deleteUser(newUser.user.id)
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 400, headers: corsHeaders }
      )
    }

    return new Response(
      JSON.stringify({ success: true, user_id: newUser.user.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    )
  }
})
