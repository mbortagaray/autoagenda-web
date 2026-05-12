import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type TemplateName =
  | 'novo_agendamento_profissional'
  | 'confirmacao_cliente'
  | 'lembrete_cliente'
  | 'cancelamento_cliente'
  | 'cancelamento_profissional'

type EmailPayload = {
  to?: string | null
  template: TemplateName
  data: Record<string, any>
}

const resendUrl = 'https://api.resend.com/emails'

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function onlyDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

function dateBR(date: string): string {
  const [year, month, day] = String(date || '').split('-')
  if (!year || !month || !day) return String(date || '')
  return `${day}/${month}/${year}`
}

function timeHHMM(time: string): string {
  return String(time || '').slice(0, 5)
}

function formatMoney(value: unknown): string {
  const number = Number(value || 0)
  return `R$ ${number.toFixed(2).replace('.', ',')}`
}

function fromAddress(negocio: any): string {
  const fallback = Deno.env.get('DEFAULT_FROM_EMAIL') || 'AutoAgenda <onboarding@resend.dev>'
  if (!negocio?.email_remetente) return fallback
  const name = negocio.email_remetente_nome || negocio.nome || 'AutoAgenda'
  return `${name} <${negocio.email_remetente}>`
}

function baseHtml(negocio: any, title: string, body: string): string {
  const primary = negocio?.cor_primaria || '#1a1a2e'
  const accent = negocio?.cor_secundaria || '#C4947A'
  const name = escapeHtml(negocio?.nome || 'AutoAgenda')
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f5f5f7;font-family:Arial,sans-serif;color:#1d1d1f">
    <div style="max-width:560px;margin:0 auto;padding:28px 16px">
      <div style="background:#fff;border:1px solid #e5e5e7;border-radius:14px;overflow:hidden">
        <div style="background:${primary};color:#fff;padding:18px 22px">
          <div style="font-size:18px;font-weight:700">${name}</div>
        </div>
        <div style="padding:24px 22px">
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:${primary}">${escapeHtml(title)}</h1>
          ${body}
        </div>
        <div style="border-top:1px solid #e5e5e7;padding:14px 22px;color:#86868b;font-size:12px">
          Enviado por AutoAgenda
        </div>
      </div>
      <div style="height:4px;background:${accent};border-radius:999px;margin:14px auto 0;width:120px"></div>
    </div>
  </body>
</html>`
}

function details(data: Record<string, any>): string {
  return `
    <div style="background:#f5f5f7;border-radius:10px;padding:14px 16px;margin:16px 0;line-height:1.65">
      <div><strong>Cliente:</strong> ${escapeHtml(data.cliente_nome)}</div>
      <div><strong>Serviço:</strong> ${escapeHtml(data.servico_nome)}</div>
      <div><strong>Profissional:</strong> ${escapeHtml(data.profissional_nome)}</div>
      <div><strong>Data:</strong> ${escapeHtml(dateBR(data.data))} às ${escapeHtml(timeHHMM(data.hora))}</div>
      ${data.preco ? `<div><strong>Valor:</strong> ${escapeHtml(formatMoney(data.preco))}</div>` : ''}
    </div>`
}

function renderTemplate(template: TemplateName, negocio: any, data: Record<string, any>) {
  const dataLabel = `${dateBR(data.data)} às ${timeHHMM(data.hora)}`
  if (template === 'novo_agendamento_profissional') {
    const phone = onlyDigits(data.cliente_telefone)
    const text = encodeURIComponent(
      `Olá ${data.cliente_nome}, seu agendamento de ${data.servico_nome} em ${dateBR(data.data)} às ${timeHHMM(data.hora)} está confirmado.`
    )
    const waUrl = phone ? `https://wa.me/55${phone}?text=${text}` : ''
    const subject = `Novo agendamento — ${data.cliente_nome}, ${data.servico_nome}, ${dataLabel}`
    const button = waUrl
      ? `<p><a href="${waUrl}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:700">Enviar confirmação WhatsApp</a></p>`
      : ''
    return {
      subject,
      html: baseHtml(negocio, 'Novo agendamento', `<p>Um novo horário foi confirmado.</p>${details(data)}${button}`),
    }
  }

  if (template === 'confirmacao_cliente') {
    return {
      subject: `Agendamento confirmado — ${data.servico_nome} em ${dataLabel}`,
      html: baseHtml(negocio, 'Agendamento confirmado', `<p>Seu horário foi confirmado.</p>${details(data)}`),
    }
  }

  if (template === 'lembrete_cliente') {
    return {
      subject: `Lembrete — seu agendamento é amanhã às ${timeHHMM(data.hora)}`,
      html: baseHtml(negocio, 'Lembrete de agendamento', `<p>Estamos passando para lembrar do seu horário amanhã.</p>${details(data)}`),
    }
  }

  if (template === 'cancelamento_profissional') {
    return {
      subject: `${data.cliente_nome} cancelou o agendamento de ${dateBR(data.data)} às ${timeHHMM(data.hora)}`,
      html: baseHtml(negocio, 'Agendamento cancelado pelo cliente', `<p>O cliente cancelou este horário.</p>${details(data)}`),
    }
  }

  return {
    subject: `Seu agendamento foi cancelado — ${dateBR(data.data)} às ${timeHHMM(data.hora)}`,
    html: baseHtml(negocio, 'Seu agendamento foi cancelado', `<p>Este agendamento foi cancelado.</p>${details(data)}`),
  }
}

export async function sendEmail(negocio: any, payload: EmailPayload) {
  if (!payload.to || !negocio?.email_notificacoes_ativas) {
    return { skipped: true }
  }

  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.warn('RESEND_API_KEY not configured')
    return { skipped: true, error: 'RESEND_API_KEY not configured' }
  }

  const rendered = renderTemplate(payload.template, negocio, payload.data)
  const res = await fetch(resendUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(negocio),
      to: [payload.to],
      subject: rendered.subject,
      html: rendered.html,
    }),
  })

  const result = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('Resend error', result)
    return { error: result }
  }
  return result
}

export function supabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

export async function loadAppointmentEmailData(supabase: any, agendamentoId: string) {
  const { data } = await supabase
    .from('agendamentos')
    .select(`
      *,
      negocios(*),
      servicos(nome, preco),
      profissionais(nome, email)
    `)
    .eq('id', agendamentoId)
    .single()

  if (!data) return null
  return {
    agendamento: data,
    negocio: data.negocios,
    templateData: {
      cliente_nome: data.cliente_nome,
      cliente_email: data.cliente_email,
      cliente_telefone: data.cliente_telefone,
      servico_nome: data.servicos?.nome || '',
      preco: data.servicos?.preco || 0,
      profissional_nome: data.profissionais?.nome || '',
      profissional_email: data.profissionais?.email || '',
      data: data.data,
      hora: data.hora,
    },
  }
}
