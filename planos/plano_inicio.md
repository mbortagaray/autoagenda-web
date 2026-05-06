# Plano inicial - AutoAgenda Web

## Objetivo

Criar o AutoAgenda Web como um segundo produto, separado do AutoAgenda baseado em n8n/WhatsApp.

O produto sera web-first, usando o Supabase atual, sem WhatsApp, sem bot e sem dependencia do n8n no funcionamento do produto.

## Escopo confirmado

- Multi-tenant.
- Agendamento online pelo navegador.
- Painel administrativo do negocio.
- Tela de super admin.
- Servicos.
- Profissionais.
- Horarios por profissional.
- Feriados nacionais.
- Ferias.
- Recesso.
- Dias com horario reduzido.
- Consulta/cancelamento/remarcacao de agendamentos pelo cliente, quando aplicavel.
- Uso do Supabase atual como base de dados.

## Fora do escopo

- WhatsApp.
- Bot.
- Fluxos de conversa.
- Planos comerciais.
- Regras de plano ou feature gates por plano.
- n8n como parte do runtime do produto web.

O n8n e a documentacao existente podem servir como referencia historica e de regra de negocio, mas o AutoAgenda Web deve funcionar por conta propria.

## Principio de produto

O sistema deve se adaptar ao tamanho do negocio.

Um negocio pode ser:

- uma pessoa so;
- uma pessoa com um unico servico;
- uma equipe com varios profissionais;
- uma operacao com varios servicos e profissionais.

A interface nao deve obrigar o cliente a escolher coisas obvias.

## Fluxo publico adaptativo

### Caso completo

Quando o negocio tem varios servicos e varios profissionais:

1. Cliente escolhe o servico.
2. Cliente escolhe o profissional, se o servico permitir mais de um.
3. Cliente escolhe data e horario.
4. Cliente informa dados.
5. Cliente confirma.

### Negocio com um unico servico

Quando existe apenas um servico ativo:

- A etapa de escolha de servico nao aparece.
- O servico e selecionado automaticamente.
- A tela pode mostrar o contexto, por exemplo: "Escolha um horario para Sobrancelhas".

### Negocio com um unico profissional

Quando existe apenas um profissional ativo:

- A etapa de escolha de profissional nao aparece.
- O profissional e selecionado automaticamente.

### Negocio solo com um unico servico

Exemplo: Claudia trabalha sozinha e atende apenas sobrancelhas.

Nesse caso, o fluxo publico deve abrir direto na escolha de data e horario.

Fluxo:

1. Cliente escolhe data e horario.
2. Cliente informa dados.
3. Cliente confirma.

O banco ainda deve manter um registro de profissional e um registro de servico, mesmo que sejam unicos. A simplificacao deve acontecer na experiencia, nao removendo o modelo de dados.

## Modelo conceitual

### Negocio

Representa o cliente/empresa/profissional que usa o sistema.

Campos relevantes:

- id;
- nome;
- slug/url publica;
- endereco;
- telefone de contato;
- horario padrao;
- dias de atendimento;
- ativo.

Nomenclatura definitiva do banco e do codigo: `negocios` e `negocio_id`.

O produto continua sendo multi-tenant conceitualmente, mas a entidade no AutoAgenda Web se chama `negocio`. Nao migrar para `tenants`.

### Profissional

Representa quem atende.

Campos relevantes:

- negocio_id;
- id;
- nome;
- ativo;
- horarios proprios;
- dias de atendimento proprios.

Mesmo no negocio solo, deve existir um profissional padrao.

### Servico

Representa o que e agendado.

Campos relevantes:

- negocio_id;
- id;
- nome;
- duracao;
- preco, se usado;
- profissional vinculado, quando aplicavel;
- ativo.

Mesmo em negocio com um servico unico, deve existir um servico padrao.

### Agendamento

Representa uma reserva de horario.

Campos relevantes:

- negocio_id;
- cliente;
- profissional;
- servico;
- data;
- hora;
- duracao;
- status.

### Bloqueios e horarios especiais

Devem cobrir:

- feriado nacional;
- feriado local/manual;
- recesso do negocio;
- ferias do profissional;
- dia com horario reduzido.

Sugestao de modelagem:

- escopo `negocio` para bloqueios que fecham o negocio inteiro;
- escopo `profissional` para bloqueios que afetam apenas uma pessoa;
- `dia_todo=true` para bloquear o dia inteiro;
- `dia_todo=false` com `hora_inicio` e `hora_fim` para representar janela aberta em dia reduzido.

## Disponibilidade

A disponibilidade deve ser calculada no backend/API, nao no frontend.

Ela deve considerar:

- negocio ativo;
- servico ativo;
- profissional ativo;
- duracao do servico;
- agenda interna;
- horario padrao do negocio;
- horario especifico do profissional;
- dias de atendimento do negocio;
- dias de atendimento do profissional;
- feriados;
- ferias;
- recesso;
- expediente reduzido;
- antecedencia minima;
- conflitos com agendamentos ativos.

O frontend apenas mostra os horarios retornados pela API.

## Areas do produto

### Publico

Para o cliente final:

- escolher horario;
- informar dados;
- confirmar agendamento;
- consultar agendamentos;
- cancelar ou remarcar, se permitido.

### Admin negocio

Para o dono ou equipe do negocio:

- ver agenda;
- criar/editar/cancelar agendamentos;
- gerenciar servicos;
- gerenciar profissionais;
- configurar horarios;
- configurar feriados, ferias, recesso e horario reduzido;
- ver clientes.

### Super admin

Para operacao geral:

- criar negocios;
- editar negocios;
- ativar/desativar negocios;
- gerenciar usuarios;
- acessar negocio como suporte, com cuidado e auditoria;
- ver status geral do sistema.

## Decisoes tecnicas iniciais

- Usar o Supabase atual.
- Validar o schema real antes de implementar mudancas grandes.
- Usar `negocios` e `negocio_id` como nomenclatura definitiva.
- Preferir uma API central para disponibilidade e criacao de agendamentos.
- Manter o frontend simples e adaptativo.

## Pendencias para validar

- Confirmar o schema real do Supabase em uso pelo AutoAgenda Web.
- Confirmar como usuarios/admins estao autenticados hoje.
- Confirmar se ferias por profissional ja existe no banco ou precisa de ajuste de schema.
- Confirmar quais Edge Functions existem hoje e quais precisam ser criadas/refeitas.

## Primeiro incremento sugerido

1. Validar schema real do Supabase.
2. Escolher o modelo oficial para o AutoAgenda Web.
3. Ajustar o fluxo publico para selecao automatica quando houver um unico servico/profissional.
4. Criar base do painel super admin.
5. Criar configuracao de bloqueios: feriados, ferias, recesso e horario reduzido.
6. Centralizar calculo de disponibilidade no backend.

## Sugestoes aprovadas

### 1. Fluxo publico adaptativo

O fluxo de agendamento deve reduzir etapas quando a escolha for obvia.

- Um unico servico ativo: selecionar automaticamente.
- Um unico profissional ativo: selecionar automaticamente.
- Um unico servico e um unico profissional: abrir direto em data e horario.

### 2. Layout por negocio

Cada negocio deve poder personalizar a experiencia publica sem virar um construtor complexo de site.

Configuracoes sugeridas:

- logo;
- cores;
- foto ou banner;
- estilo visual;
- mostrar/ocultar endereco;
- mostrar/ocultar telefone.

Estilos iniciais sugeridos:

- simples;
- elegante;
- clinico;
- barbearia;
- premium.

### 3. Bloqueios inteligentes

Criar uma area unica para cadastrar bloqueios e horarios especiais:

- feriado;
- ferias;
- recesso;
- horario reduzido;
- bloqueio por profissional.

### 4. Diagnostico de disponibilidade

Criar no admin uma tela para explicar por que determinado horario aparece ou nao aparece.

Motivos esperados:

- agenda interna ocupada;
- ferias;
- recesso;
- feriado;
- fora do expediente;
- profissional nao atende nesse dia;
- horario ja passou;
- antecedencia minima.

### 5. Super admin simples

Comecar com uma tela operacional enxuta:

- listar negocios;
- criar negocio;
- editar negocio;
- ativar/desativar negocio;
- acessar como suporte;
- ver quantidade basica de agendamentos.

### 6. Link publico por negocio

Cada negocio deve ter um link publico simples e legivel.

Exemplo:

```text
agenda.mdinamic.com.br/claudia-sobrancelhas
```

### 7. Modo negocio solo

Quando o negocio e operado por uma pessoa e tem servico unico, o admin tambem deve esconder complexidade desnecessaria.

O modelo continua tendo profissional e servico no banco, mas a interface pode tratar ambos como padrao.

### 8. Confirmacao visual forte

A tela final do agendamento deve deixar claro:

- servico;
- profissional;
- data;
- hora;
- dados do cliente;
- opcao de adicionar ao calendario;
- opcao de copiar dados do agendamento.

### 9. Remarcacao e consulta sem login

Cliente deve poder consultar, cancelar ou remarcar usando telefone e codigo/PIN simples, sem criar conta.

### 10. Auditoria minima

Registrar quem criou, cancelou ou alterou agendamentos:

- cliente;
- admin;
- super admin;
- sistema.

## Prioridade aprovada

1. Fluxo adaptativo.
2. Disponibilidade correta.
3. Bloqueios, ferias, recesso e horario reduzido.
4. Layout por negocio.
5. Super admin.
6. Diagnostico de disponibilidade.
