import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function siteUrl() {
  return Deno.env.get('SITE_URL') || 'https://agenda.mdinamic.com.br'
}

function randomPassword() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)) + 'Aa1!'
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function sendAccessEmail(to: string, nome: string, actionLink: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('DEFAULT_FROM_EMAIL') || 'AutoAgenda <onboarding@resend.dev>'
  if (!apiKey) return { skipped: true, error: 'RESEND_API_KEY not configured' }

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f5f5f7;font-family:Arial,sans-serif;color:#1d1d1f">
    <div style="max-width:560px;margin:0 auto;padding:28px 16px">
      <div style="background:#fff;border:1px solid #e5e5e7;border-radius:14px;overflow:hidden">
        <div style="background:#1a1a2e;color:#fff;padding:18px 22px">
          <div style="font-size:18px;font-weight:700">AutoAgenda</div>
        </div>
        <div style="padding:24px 22px">
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#1a1a2e">Bem-vindo ao AutoAgenda</h1>
          <p>Oi, ${escapeHtml(nome)}.</p>
          <p>Sua conta administrativa foi criada. Para acessar o painel, defina sua senha pelo botão abaixo.</p>
          <p style="margin:24px 0">
            <a href="${escapeHtml(actionLink)}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:700">Definir senha</a>
          </p>
          <p style="color:#86868b;font-size:13px;line-height:1.5">Se você não esperava este email, ignore esta mensagem.</p>
        </div>
        <div style="border-top:1px solid #e5e5e7;padding:14px 22px;color:#86868b;font-size:12px">Enviado por AutoAgenda</div>
      </div>
    </div>
  </body>
</html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Bem-vindo ao AutoAgenda - defina sua senha',
      html,
    }),
  })

  const result = await res.json().catch(() => ({}))
  return res.ok ? result : { error: result }
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

    // Superadmin pode criar qualquer perfil. Admin só pode criar owner no próprio negócio.
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: userData } = await sb.auth.getUser(token)
    const callerUserId = userData.user?.id || ''
    const { data: callerRows } = await sb
      .from('admin_users')
      .select('role, negocio_id')
      .eq('user_id', callerUserId)
    if (!callerRows?.length) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), { status: 403, headers: corsHeaders })
    }

    const { email, senha, nome, negocio_id, role } = await req.json()
    const isSuperadmin = callerRows.some((r: any) => r.role === 'superadmin')
    const isAdminForNegocio = callerRows.some((r: any) => r.role === 'admin' && r.negocio_id === negocio_id)

    if (!isSuperadmin) {
      if (role !== 'owner' || !negocio_id || !isAdminForNegocio) {
        return new Response(JSON.stringify({ error: 'Admin só pode criar owner do próprio negócio' }), {
          status: 403,
          headers: corsHeaders,
        })
      }
    }

    const allowNoNegocio = role === 'superadmin' || role === 'admin'

    if (!email || !role || !nome || (!allowNoNegocio && !negocio_id)) {
      return new Response(
        JSON.stringify({ error: 'nome, email e role são obrigatórios' }),
        { status: 400, headers: corsHeaders }
      )
    }

    // Criar usuário no Auth — ou recuperar órfão de tentativa anterior que falhou
    let userId: string
    const { data: newUser, error: createError } = await sb.auth.admin.createUser({
      email,
      password: senha || randomPassword(),
      email_confirm: true,
      user_metadata: { nome, role },
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
      // Órfão — reutilizar e enviar link de definição de senha
      await sb.auth.admin.updateUserById(existing.id, { user_metadata: { nome, role } })
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

    const { data: linkData, error: linkError } = await sb.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${siteUrl()}/${role === 'superadmin' ? 'superadmin' : 'admin'}?reset_password=1` },
    })

    if (linkError) {
      return new Response(JSON.stringify({ error: linkError.message }), { status: 400, headers: corsHeaders })
    }

    const emailResult = await sendAccessEmail(email, nome, linkData.properties.action_link)

    return new Response(
      JSON.stringify({ success: true, user_id: userId, email: emailResult }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    )
  }
})
