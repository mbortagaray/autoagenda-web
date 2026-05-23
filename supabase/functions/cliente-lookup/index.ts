// Edge Function: GET /cliente-lookup?negocio_id=...&telefone=...
// Busca cliente pelo telefone.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const negocioId = url.searchParams.get('negocio_id')
  const telefone = url.searchParams.get('telefone')?.replace(/\D/g, '')

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
    .select('id, nome, telefone')
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

  return new Response(
    JSON.stringify({
      encontrado: true,
      cadastrado: true,
      nome: cliente.nome,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
