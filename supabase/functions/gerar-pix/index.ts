// Edge Function: POST /gerar-pix
// Gera QR Code Pix via Mercado Pago e cria agendamento com status aguardando_pagamento

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

    const { agendamento_id } = await req.json()
    if (!agendamento_id) {
      return new Response(JSON.stringify({ error: 'agendamento_id obrigatório' }), { status: 400, headers: corsHeaders })
    }

    // Buscar agendamento com profissional e serviço
    const { data: ag, error: agErr } = await sb
      .from('agendamentos')
      .select('*, profissionais(nome, mp_access_token), servicos(nome, preco), negocios(nome)')
      .eq('id', agendamento_id)
      .single()

    if (agErr || !ag) {
      return new Response(JSON.stringify({ error: 'Agendamento não encontrado' }), { status: 404, headers: corsHeaders })
    }

    const mpToken = ag.profissionais?.mp_access_token
    if (!mpToken) {
      return new Response(JSON.stringify({ error: 'Profissional não aceita Pix' }), { status: 400, headers: corsHeaders })
    }

    const valor = Number(ag.servicos?.preco || 0)
    if (!valor) {
      return new Response(JSON.stringify({ error: 'Valor inválido' }), { status: 400, headers: corsHeaders })
    }

    // Criar pagamento Pix no Mercado Pago
    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mpToken}`,
        'X-Idempotency-Key': agendamento_id,
      },
      body: JSON.stringify({
        transaction_amount: valor,
        description: `${ag.servicos?.nome} - ${ag.negocios?.nome}`,
        payment_method_id: 'pix',
        payer: {
          email: ag.cliente_email || 'cliente@autoagenda.com.br',
          first_name: ag.cliente_nome?.split(' ')[0] || 'Cliente',
        },
        date_of_expiration: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutos
      }),
    })

    const mpData = await mpRes.json()

    if (!mpRes.ok || mpData.error) {
      return new Response(
        JSON.stringify({ error: mpData.message || 'Erro ao gerar Pix' }),
        { status: 400, headers: corsHeaders }
      )
    }

    const qrCode = mpData.point_of_interaction?.transaction_data?.qr_code
    const qrCodeBase64 = mpData.point_of_interaction?.transaction_data?.qr_code_base64
    const paymentId = mpData.id

    // Salvar payment_id no agendamento
    await sb
      .from('agendamentos')
      .update({
        mp_payment_id: String(paymentId),
        status: 'aguardando_pagamento'
      })
      .eq('id', agendamento_id)

    return new Response(
      JSON.stringify({ qr_code: qrCode, qr_code_base64: qrCodeBase64, payment_id: paymentId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
