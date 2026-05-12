// Edge Function: POST /mp-webhook
// Recebe notificações do Mercado Pago e confirma pagamento

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
