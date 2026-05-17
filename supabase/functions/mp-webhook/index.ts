// Edge Function: POST /mp-webhook
// Recebe notificações do Mercado Pago e confirma pagamento

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

async function verifyMPSignature(req: Request, paymentId: string | number): Promise<boolean> {
  const secret = Deno.env.get('MP_WEBHOOK_SECRET')
  if (!secret) return true // sem secret configurado: aceitar (backward compat)

  const signature = req.headers.get('x-signature')
  const requestId = req.headers.get('x-request-id') || ''
  if (!signature) return false

  const parts: Record<string, string> = {}
  signature.split(',').forEach(part => {
    const [k, v] = part.split('=')
    if (k && v) parts[k.trim()] = v.trim()
  })
  const ts = parts['ts']
  const v1 = parts['v1']
  if (!ts || !v1) return false

  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest))
  const computed = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('')
  return computed === v1
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const body = await req.json()
    const { type, data } = body

    if (type !== 'payment') {
      return new Response('ok', { headers: corsHeaders })
    }

    const paymentId = data?.id
    if (!paymentId) return new Response('ok', { headers: corsHeaders })

    if (!await verifyMPSignature(req, paymentId)) {
      return new Response(JSON.stringify({ error: 'Assinatura inválida' }), { status: 401, headers: corsHeaders })
    }

    // Buscar agendamento pelo payment_id
    const { data: ag } = await sb
      .from('agendamentos')
      .select('id, status, profissional_id, profissionais(mp_access_token)')
      .eq('mp_payment_id', String(paymentId))
      .single()

    if (!ag) return new Response('ok', { headers: corsHeaders })

    // Verificar status do pagamento no MP
    const mpToken = ag.profissionais?.mp_access_token
    if (!mpToken) return new Response('ok', { headers: corsHeaders })

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${mpToken}` }
    })
    const mpData = await mpRes.json()

    if (mpData.status === 'approved') {
      await sb
        .from('agendamentos')
        .update({ status: 'confirmado', pago: true })
        .eq('id', ag.id)
    } else if (['cancelled', 'rejected', 'expired'].includes(mpData.status)) {
      // Pagamento expirou/cancelou — liberar horário
      await sb
        .from('agendamentos')
        .update({ status: 'cancelado' })
        .eq('id', ag.id)
    }

    return new Response('ok', { headers: corsHeaders })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
