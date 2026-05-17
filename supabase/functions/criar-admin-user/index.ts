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

    const { email, senha, nome, negocio_id, role } = await req.json()
    const allowNoNegocio = role === 'superadmin' || role === 'admin'

    if (!email || !senha || !role || !nome || (!allowNoNegocio && !negocio_id)) {
      return new Response(
        JSON.stringify({ error: 'nome, email, senha e role são obrigatórios' }),
        { status: 400, headers: corsHeaders }
      )
    }

    // Criar usuário no Auth — ou recuperar órfão de tentativa anterior que falhou
    let userId: string
    const { data: newUser, error: createError } = await sb.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    })

    if (createError) {
      const msg = (createError.message || '').toLowerCase()
      const alreadyExists = msg.includes('already') || msg.includes('registered') || msg.includes('exists')
      if (!alreadyExists) {
        return new Response(JSON.stringify({ error: createError.message }), { status: 400, headers: corsHeaders })
      }
      // Email existe em auth — verificar se também está em admin_users
      const { data: list } = await sb.auth.admin.listUsers()
      const existing = list?.users?.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase())
      if (!existing) {
        return new Response(JSON.stringify({ error: 'Email já cadastrado' }), { status: 400, headers: corsHeaders })
      }
      const { data: existingAdmin } = await sb.from('admin_users').select('id').eq('user_id', existing.id).maybeSingle()
      if (existingAdmin) {
        return new Response(JSON.stringify({ error: 'Email já cadastrado' }), { status: 400, headers: corsHeaders })
      }
      // Órfão — atualizar senha e reutilizar
      await sb.auth.admin.updateUserById(existing.id, { password: senha })
      userId = existing.id
    } else {
      userId = newUser.user.id
    }

    // Inserir na tabela admin_users
    const { error: insertError } = await sb
      .from('admin_users')
      .insert({
        user_id: userId,
        negocio_id: allowNoNegocio ? null : negocio_id,
        role,
        email,
        nome,
      })

    if (insertError) {
      // Rollback só se criamos agora (não delete órfão de outra origem)
      if (!createError) await sb.auth.admin.deleteUser(userId)
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
