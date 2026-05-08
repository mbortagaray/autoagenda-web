// Edge Function: GET /cliente-lookup?negocio_id=...&telefone=...&pin=1234
// Busca cliente pelo telefone + PIN. Sem PIN, só informa se existe.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const negocioId = url.searchParams.get('negocio_id')
  const telefone = url.searchParams.get('telefone')?.replace(/\D/g, '')
  const pin = url.searchParams.get('pin')

  if (!negocioId || !telefone || telefone.length < 10) {
    return new Response(
      JSON.stringify({ encontrado: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: cliente } = await supabase
    .from('clientes')
    .select('id, nome, telefone, pin')
    .eq('negocio_id', negocioId)
    .eq('telefone', telefone)
    .single()

  if (!cliente) {
    // Cliente novo — não existe cadastro
    return new Response(
      JSON.stringify({ encontrado: false, cadastrado: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Cliente existe mas não enviou PIN — informa que precisa do PIN
  if (!pin) {
    return new Response(
      JSON.stringify({
        encontrado: true,
        cadastrado: true,
        tem_pin: !!cliente.pin,
        autenticado: false,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Validar PIN
  if (cliente.pin && cliente.pin !== pin) {
    return new Response(
      JSON.stringify({
        encontrado: true,
        cadastrado: true,
        autenticado: false,
        erro: 'PIN incorreto',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // PIN correto (ou cliente sem PIN ainda — primeiro acesso com PIN)
  return new Response(
    JSON.stringify({
      encontrado: true,
      cadastrado: true,
      autenticado: true,
      nome: cliente.nome,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
