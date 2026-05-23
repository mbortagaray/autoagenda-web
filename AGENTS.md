# Regras Permanentes Para Agentes

Estas regras devem ser usadas em todo trabalho neste repositorio.

## Antes de mexer

- Entender exatamente o pedido do usuario antes de alterar arquivos.
- Se houver ambiguidade real, perguntar antes de implementar.
- Nao escolher uma interpretacao escondida quando existirem duas leituras provaveis.
- Nao trocar o objetivo pedido por uma alternativa "parecida".

## Escopo

- Fazer mudancas cirurgicas: tocar somente nos arquivos necessarios.
- Nao refatorar codigo vizinho sem pedido explicito.
- Nao apagar, reverter ou reorganizar alteracoes existentes sem autorizacao.
- Preservar o estilo e os padroes ja usados no repositorio.

## Simplicidade

- Implementar o minimo necessario para resolver o problema.
- Nao criar abstracoes, configuracoes ou features que nao foram pedidas.
- Preferir solucao clara e pequena a solucao generica demais.

## Verificacao

- Definir o resultado esperado antes de finalizar.
- Verificar com teste, lint, build, sintaxe, HTTP, browser ou outra checagem pratica adequada.
- Na resposta final, dizer o que mudou, onde mudou e como foi verificado.

## Comunicacao

- Quando o pedido envolver GitHub, Vercel, DNS, Cloudflare ou outro sistema externo, confirmar a fonte certa antes de afirmar.
- Distinguir fato confirmado, inferencia e duvida.
- Se algo nao puder ser confirmado, dizer isso claramente.
