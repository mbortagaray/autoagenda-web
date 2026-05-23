// Edge Function: GET /meus-agendamentos?negocio_id=...&telefone=...
// Retorna agendamentos futuros do cliente.

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
      JSON.stringify({ error: 'Informe negocio_id e telefone' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Validar cliente
  const { data: cliente } = await supabase
    .from('clientes')
    .select('id')
    .eq('negocio_id', negocioId)
    .eq('telefone', telefone)
    .single()

  if (!cliente) {
    return new Response(
      JSON.stringify({ error: 'Cliente não encontrado' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const hoje = new Date().toISOString().split('T')[0]

  const { data: agendamentos } = await supabase
    .from('agendamentos')
    .select(`
      id, data, hora, duracao_min, status,
      servicos ( nome, preco ),
      profissionais ( nome )
    `)
    .eq('negocio_id', negocioId)
    .eq('cliente_telefone', telefone)
    .eq('status', 'confirmado')
    .gte('data', hoje)
    .order('data', { ascending: true })
    .order('hora', { ascending: true })

  return new Response(
    JSON.stringify({
      agendamentos: (agendamentos || []).map((ag: any) => ({
        id: ag.id,
        data: ag.data,
        hora: ag.hora,
        duracao_min: ag.duracao_min,
        status: ag.status,
        servico: ag.servicos?.nome || '',
        preco: ag.servicos?.preco || 0,
        profissional: ag.profissionais?.nome || '',
      })),
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
