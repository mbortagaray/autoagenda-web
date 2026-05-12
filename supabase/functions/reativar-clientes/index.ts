import { sendEmail, supabaseAdmin } from '../_shared/email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().split('T')[0]
}

function oneMonthAgo(): Date {
  const date = new Date()
  date.setMonth(date.getMonth() - 1)
  return date
}

function normalizePhone(value: unknown): string {
  return String(value || '').replace(/\D/g, '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const auth = req.headers.get('Authorization') || ''
  const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
  const cronSecret = Deno.env.get('EMAIL_CRON_SECRET')
  const expectedCron = cronSecret ? `Bearer ${cronSecret}` : ''
  if (auth !== expected && (!expectedCron || auth !== expectedCron)) {
    return new Response(JSON.stringify({ error: 'Nao autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const dryRun = body?.dry_run === true
  const supabase = supabaseAdmin()
  const siteUrl = (Deno.env.get('SITE_URL') || 'https://agenda.mdinamic.com.br').replace(/\/$/, '')
  const functionBaseUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1`

  const { data: negocios, error: negociosError } = await supabase
    .from('negocios')
    .select('*')
    .eq('ativo', true)
    .neq('email_notificacoes_ativas', false)

  if (negociosError) {
    return new Response(JSON.stringify({ error: negociosError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const monthlyCutoff = oneMonthAgo()
  let sent = 0
  let skipped = 0
  const candidates: any[] = []

  for (const negocio of negocios || []) {
    const { data: servicos, error: servicosError } = await supabase
      .from('servicos')
      .select('id, nome, prazo_reativacao_dias')
      .eq('negocio_id', negocio.id)
      .eq('ativo', true)
      .not('prazo_reativacao_dias', 'is', null)
      .gt('prazo_reativacao_dias', 0)
      .order('nome')

    if (servicosError || !servicos?.length) {
      skipped++
      continue
    }

    const { data: clientes, error: clientesError } = await supabase
      .from('clientes')
      .select('id, nome, telefone, email, reativacao_enviada_em, unsubscribe_reativacao')
      .eq('negocio_id', negocio.id)
      .not('email', 'is', null)
      .neq('unsubscribe_reativacao', true)

    if (clientesError || !clientes?.length) {
      skipped++
      continue
    }

    const servicoIds = servicos.map((servico: any) => servico.id)
    const { data: agendamentos, error: agendamentosError } = await supabase
      .from('agendamentos')
      .select('servico_id, cliente_telefone, data')
      .eq('negocio_id', negocio.id)
      .in('servico_id', servicoIds)
      .in('status', ['confirmado', 'concluido'])

    if (agendamentosError) {
      skipped += clientes.length
      continue
    }

    const latestByServiceAndPhone = new Map<string, string>()
    for (const agendamento of agendamentos || []) {
      const phone = normalizePhone(agendamento.cliente_telefone)
      const key = `${agendamento.servico_id}:${phone}`
      const current = latestByServiceAndPhone.get(key)
      if (!current || agendamento.data > current) {
        latestByServiceAndPhone.set(key, agendamento.data)
      }
    }

    const handledClientes = new Set<string>()
    for (const servico of servicos) {
      const cutoff = daysAgo(Number(servico.prazo_reativacao_dias))
      for (const cliente of clientes) {
        if (handledClientes.has(cliente.id)) continue
        if (cliente.reativacao_enviada_em && new Date(cliente.reativacao_enviada_em) > monthlyCutoff) {
          continue
        }

        const phone = normalizePhone(cliente.telefone)
        const lastDate = latestByServiceAndPhone.get(`${servico.id}:${phone}`)
        if (!lastDate || lastDate > cutoff) continue

        const data = {
          cliente_nome: cliente.nome,
          servico_nome: servico.nome,
          agendamento_url: `${siteUrl}/${negocio.slug}`,
          unsubscribe_url: `${functionBaseUrl}/reativacao-unsubscribe?cliente_id=${encodeURIComponent(cliente.id)}`,
        }

        candidates.push({
          negocio: negocio.nome,
          cliente: cliente.nome,
          email: cliente.email,
          servico: servico.nome,
          ultimo_agendamento: lastDate,
        })
        handledClientes.add(cliente.id)

        if (dryRun) continue

        const result = await sendEmail(negocio, {
          to: cliente.email,
          template: 'reativacao_cliente',
          data,
        })

        if (!result?.error && !result?.skipped) {
          sent++
          await supabase
            .from('clientes')
            .update({ reativacao_enviada_em: new Date().toISOString() })
            .eq('id', cliente.id)
        } else {
          skipped++
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, dry_run: dryRun, sent, skipped, candidates }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
