import { supabaseAdmin } from '../_shared/email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function html(message: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AutoAgenda</title>
  </head>
  <body style="margin:0;background:#f5f5f7;font-family:Arial,sans-serif;color:#1d1d1f">
    <main style="max-width:520px;margin:64px auto;padding:0 20px">
      <div style="background:#fff;border:1px solid #e5e5e7;border-radius:14px;padding:28px">
        <h1 style="margin:0 0 12px;font-size:24px">AutoAgenda</h1>
        <p style="margin:0;line-height:1.5">${message}</p>
      </div>
    </main>
  </body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)
  const clienteId = url.searchParams.get('cliente_id')
  if (!clienteId) {
    return new Response(html('Link invalido.'), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const supabase = supabaseAdmin()
  const { error } = await supabase
    .from('clientes')
    .update({ unsubscribe_reativacao: true })
    .eq('id', clienteId)

  if (error) {
    return new Response(html('Nao foi possivel concluir o descadastro.'), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  return new Response(html('Voce nao recebera mais emails de reativacao.'), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
})
