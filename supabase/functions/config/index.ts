// Edge Function: GET /config?slug=espaco-bella
// Retorna config do negócio + serviços + profissionais

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
  const slug = url.searchParams.get('slug')

  if (!slug) {
    return new Response(
      JSON.stringify({ error: 'Parâmetro slug é obrigatório' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Buscar negócio
  const { data: negocio, error: errNeg } = await supabase
    .from('negocios')
    .select('*')
    .eq('slug', slug)
    .eq('ativo', true)
    .single()

  if (errNeg || !negocio) {
    return new Response(
      JSON.stringify({ error: 'Negócio não encontrado' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Buscar profissionais com seus serviços e horários
  const { data: profissionais } = await supabase
    .from('profissionais')
    .select(`
      id, nome, telefone, foto_url, avatar_emoji, avatar_cor,
      profissional_servicos ( servico_id ),
      profissional_horarios ( dia_semana, hora_inicio, hora_fim )
    `)
    .eq('negocio_id', negocio.id)
    .eq('ativo', true)
    .order('nome')

  // Buscar serviços
  const { data: servicos } = await supabase
    .from('servicos')
    .select('id, nome, duracao_min, preco, preco_promocional, promocao_ativa')
    .eq('negocio_id', negocio.id)
    .eq('ativo', true)
    .order('nome')

  // Montar resposta
  const response = {
    negocio: {
      id: negocio.id,
      slug: negocio.slug,
      nome: negocio.nome,
      telefone: negocio.telefone,
      logo_url: negocio.logo_url,
      logo_modo: negocio.logo_modo,
      logo_tamanho: negocio.logo_tamanho,
      endereco: negocio.endereco,
      cidade: negocio.cidade,
      google_maps_url: negocio.google_maps_url,
      cores: {
        primaria: negocio.cor_primaria,
        secundaria: negocio.cor_secundaria,
        fundo: negocio.cor_fundo,
        superficie: negocio.cor_superficie,
        modo: negocio.tema_modo,
      },
      horarios: {
        abertura_manha: negocio.horario_abertura_manha,
        fechamento_manha: negocio.horario_fechamento_manha,
        abertura_tarde: negocio.horario_abertura_tarde,
        fechamento_tarde: negocio.horario_fechamento_tarde,
      },
      dias_atendimento: negocio.dias_atendimento,
      janela_cancelamento_horas: negocio.janela_cancelamento_horas,
    },
    profissionais: (profissionais || []).map((p: any) => ({
      id: p.id,
      nome: p.nome,
      foto_url: p.foto_url,
      avatar_emoji: p.avatar_emoji,
      avatar_cor: p.avatar_cor,
      servico_ids: (p.profissional_servicos || []).map((ps: any) => ps.servico_id),
      horarios: (p.profissional_horarios || []).reduce((acc: any, h: any) => {
        if (!acc[h.dia_semana]) acc[h.dia_semana] = []
        acc[h.dia_semana].push({ inicio: h.hora_inicio, fim: h.hora_fim })
        return acc
      }, {}),
    })),
    servicos: servicos || [],
  }

  return new Response(
    JSON.stringify(response),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
