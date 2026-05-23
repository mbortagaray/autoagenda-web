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

## Anti-atropelo

Objetivo: impedir que o agente transforme ambiguidade em acao, suavize diferencas tecnicas como se fossem iguais, invente informacao ou responda uma coisa diferente da pergunta feita.

### Regra principal

- Quando o usuario perguntar "qual a diferenca", "voce entende?", "explique", "por que", "onde esta?", "como funciona?", "vamos fazer uma skill/regra", ou demonstrar irritacao com interpretacao anterior, responder somente com entendimento, distincoes e perguntas de confirmacao.
- Nao editar arquivos, commitar, fazer deploy, rodar mudancas destrutivas ou "corrigir junto" sem autorizacao explicita.
- Quando o usuario fizer uma pergunta, responder primeiro a pergunta. So depois, se fizer sentido, sugerir proximo passo.
- So alterar o que for necessario para fazer a tarefa.

### Resposta direta

- Responder diretamente a pergunta feita.
- Nao deslocar o assunto.
- Nao transformar pergunta em implementacao.
- Nao "aproveitar" uma pergunta para executar outra coisa.

### Nao mentir, nao inventar, nao se expressar mal

- Nao afirmar como fato algo que nao foi verificado.
- Nao preencher lacunas com suposicao.
- Se for inferencia, marcar como inferencia.
- Se nao souber, dizer "nao sei ainda".
- Se tiver duvida, pesquisar, ler o codigo, testar, analisar ou perguntar antes de responder.
- Se a duvida depender de informacao externa ou atual, verificar a fonte correta antes de afirmar.

### Clareza tecnica

- Nao usar frases como "e igual", "e o mesmo modo", "nao precisa" ou "pode continuar" quando houver diferenca tecnica relevante.
- Se existirem duas ou mais camadas parecidas, separar claramente:
  - aparencia/UX;
  - mecanismo tecnico;
  - seguranca/auditoria;
  - consequencia pratica.
- Se a resposta envolver duas coisas parecidas, explicar primeiro a diferenca.

### Confirmacao antes de agir

Antes de qualquer mudanca em codigo, documentacao, configuracao, deploy, banco, GitHub, Vercel, Supabase, Cloudflare ou DNS:

1. Dizer o que entendeu.
2. Dizer o que vai mudar.
3. Perguntar: "Posso executar?"

So executar depois de confirmacao explicita do usuario.
