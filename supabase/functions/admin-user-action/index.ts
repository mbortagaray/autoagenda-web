import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function siteUrl() {
  return Deno.env.get('SITE_URL') || 'https://agenda.mdinamic.com.br'
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function sendPasswordEmail(to: string, nome: string, actionLink: string, isWelcome = false) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('DEFAULT_FROM_EMAIL') || 'AutoAgenda <onboarding@resend.dev>'
  if (!apiKey) return { skipped: true, error: 'RESEND_API_KEY not configured' }

  const title = isWelcome ? 'Bem-vindo ao AutoAgenda' : 'Redefinir senha'
  const text = isWelcome
    ? 'Sua conta administrativa foi criada. Para acessar o painel, defina sua senha pelo botão abaixo.'
    : 'Recebemos uma solicitação para redefinir sua senha. Use o botão abaixo para criar uma nova senha.'

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f5f5f7;font-family:Arial,sans-serif;color:#1d1d1f">
    <div style="max-width:560px;margin:0 auto;padding:28px 16px">
      <div style="background:#fff;border:1px solid #e5e5e7;border-radius:14px;overflow:hidden">
        <div style="background:#1a1a2e;color:#fff;padding:18px 22px">
          <div style="font-size:18px;font-weight:700">AutoAgenda</div>
        </div>
        <div style="padding:24px 22px">
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#1a1a2e">${title}</h1>
          <p>Oi, ${escapeHtml(nome || to)}.</p>
          <p>${text}</p>
          <p style="margin:24px 0">
            <a href="${escapeHtml(actionLink)}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:700">Definir senha</a>
          </p>
          <p style="color:#86868b;font-size:13px;line-height:1.5">Se você não pediu isso, ignore esta mensagem.</p>
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
      subject: isWelcome ? 'Bem-vindo ao AutoAgenda - defina sua senha' : 'Redefinir senha do AutoAgenda',
      html,
    }),
  })

  const result = await res.json().catch(() => ({}))
  return res.ok ? result : { error: result }
}

async function requireSuperadmin(sb: any, req: Request) {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const { data: userData } = await sb.auth.getUser(token)
  const userId = userData.user?.id
  if (!userId) return { error: 'Acesso negado', status: 403 }

  const { data: caller } = await sb
    .from('admin_users')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'superadmin')
    .maybeSingle()

  if (!caller) return { error: 'Acesso negado', status: 403 }
  return { userId }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const caller = await requireSuperadmin(sb, req)
    if (caller.error) {
      return new Response(JSON.stringify({ error: caller.error }), {
        status: caller.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { action, user_id, nome, email, role } = await req.json()
    if (!action || !user_id) {
      return new Response(JSON.stringify({ error: 'action e user_id são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: rows } = await sb
      .from('admin_users')
      .select('id, user_id, email, nome, role, negocio_id')
      .eq('user_id', user_id)

    if (!rows?.length) {
      return new Response(JSON.stringify({ error: 'Usuário não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const current = rows[0]

    if (action === 'send_password') {
      const targetEmail = email || current.email
      const targetRole = role || current.role
      const { data: linkData, error: linkError } = await sb.auth.admin.generateLink({
        type: 'recovery',
        email: targetEmail,
        options: { redirectTo: `${siteUrl()}/${targetRole === 'superadmin' ? 'superadmin' : 'admin'}?reset_password=1` },
      })
      if (linkError) throw linkError
      const emailResult = await sendPasswordEmail(targetEmail, nome || current.nome || targetEmail, linkData.properties.action_link)
      return new Response(JSON.stringify({ success: true, email: emailResult }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'delete') {
      if (user_id === caller.userId) {
        return new Response(JSON.stringify({ error: 'Você não pode remover seu próprio usuário' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (rows.some((r: any) => r.role === 'superadmin')) {
        const { data: supers } = await sb.from('admin_users').select('user_id').eq('role', 'superadmin')
        const uniqueSupers = new Set((supers || []).map((s: any) => s.user_id))
        if (uniqueSupers.size <= 1) {
          return new Response(JSON.stringify({ error: 'Não é possível remover o último superadmin' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      const { error: deleteRowsError } = await sb.from('admin_users').delete().eq('user_id', user_id)
      if (deleteRowsError) throw deleteRowsError
      const { error: deleteUserError } = await sb.auth.admin.deleteUser(user_id)
      if (deleteUserError) throw deleteUserError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'update') {
      if (!nome || !email || !role) {
        return new Response(JSON.stringify({ error: 'nome, email e role são obrigatórios' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (user_id === caller.userId && role !== 'superadmin') {
        return new Response(JSON.stringify({ error: 'Você não pode remover seu próprio acesso superadmin' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { error: authError } = await sb.auth.admin.updateUserById(user_id, {
        email,
        email_confirm: true,
        user_metadata: { nome, role },
      })
      if (authError) throw authError

      if (role === 'superadmin') {
        await sb.from('admin_users').delete().eq('user_id', user_id)
        const { error } = await sb.from('admin_users').insert({ user_id, negocio_id: null, role, email, nome })
        if (error) throw error
      } else {
        const { error } = await sb.from('admin_users').update({ email, nome, role }).eq('user_id', user_id)
        if (error) throw error
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Ação inválida' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
