# AutoAgenda — Planejamento Completo

---

## SITUAÇÃO ATUAL (bugs/pendências)

- [ ] RLS bloqueando superadmin de criar/editar negócios
- [ ] Superadmin não consegue cadastrar serviços nem linkar a profissionais
- [ ] Google Calendar só funciona no admin do tenant, não no superadmin
- [ ] Autenticação do cliente ruim (telefone completo)

---

## ORDEM DE EXECUÇÃO

### Fase 1 — Base
1. RLS superadmin (só SQL)
2. Impersonation

### Fase 2 — Autenticação
3. Login cliente — Google + email magic link
4. "Meus horários" do profissional

### Fase 3 — Agenda
5. Bloqueios (feriados, dia único, período)

### Fase 4 — Pagamento
6. Pix — Mercado Pago primeiro, depois Asaas e PagSeguro

### Fase 5 — Notificações e Reativação
7. Notificações de agendamento
8. Email automático de reativação de clientes sumidos

---

## 1. IMPERSONATION

### O que é
Superadmin entra no admin de qualquer tenant com 1 clique, sem senha do tenant.

### Fluxo
1. Superadmin acessa agenda.mdinamic.com.br/superadmin
2. Na lista de negócios, clica em **"Entrar como admin"**
3. Edge Function gera sessão temporária com service role
4. Abre o admin do tenant já autenticado
5. Banner no topo: "Você está acessando como [Negócio] — Sair"
6. Clica Sair → volta para o superadmin

### Por que resolve tudo
- Cadastro de serviços → já tem no admin do tenant
- Cadastro de profissionais + link com serviços → já tem
- Google Calendar → já tem
- Qualquer funcionalidade futura → automático

### Implementação necessária
- Edge Function `impersonate-tenant` com service role key
- Botão "Entrar como admin" no superadmin
- Banner de impersonation no admin do tenant
- Botão "Sair" no banner que volta para o superadmin

---

## 2. AUTENTICAÇÃO DO CLIENTE

### Duas opções na tela de login
- **Google** — 2 cliques, já logado
- **Email** — link mágico, clica e entra (sem senha)

### Fluxo Google
1. Clica "Entrar com Google"
2. Primeira vez → pede telefone para vincular ao cadastro
3. Da segunda vez → entra direto

### Fluxo Email
1. Clica "Entrar com email"
2. Digita o email
3. Recebe link mágico
4. Clica → entra direto

### Implementação necessária
- Supabase Auth Google OAuth (nativo, sem custo)
- Supabase Auth Magic Link email (nativo, sem custo)
- Tela de login no site do cliente
- Vinculação telefone na primeira vez (Google)

---

## 3. APP DO PROFISSIONAL ("Meus Horários")

### Fluxo
1. Profissional acessa o site do negócio
2. Clica em **"Meus horários"**
3. Digita o telefone cadastrado no sistema
4. Sistema reconhece como profissional daquele negócio
5. Mostra agenda do dia
6. Pode navegar por outros dias
7. Pode cancelar ou remarcar agendamentos

### Autenticação
- Apenas telefone
- Se telefone = profissional → visão do profissional
- Se telefone = cliente → visão do cliente

---

## 4. BLOQUEIOS DE AGENDA

### Tipos

**Feriados nacionais**
- API: brasilapi.com.br (gratuita, sem chave)
- Ativar/desativar no admin
- Por negócio ou por profissional

**Dia único**
- Seleciona um dia no calendário
- Bloquear dia todo ou expediente personalizado (ex: 07h–13h)
- Por negócio ou por profissional

**Período (férias)**
- Seleciona data início e data fim
- Ex: 23/12/2026 até 05/01/2027
- Por negócio ou por profissional

### Implementação necessária
- Tabela `bloqueios` (negocio_id, profissional_id opcional, data_inicio, data_fim, hora_inicio, hora_fim, tipo)
- Integração BrasilAPI feriados
- Calendário visual no admin do tenant
- Lógica de verificação no sistema de agendamento

---

## 5. PAGAMENTO COM PIX

### Modelo
- Você cobra mensalidade do app — sem taxa por agendamento
- Tenant cria conta no gateway e conecta
- Implementar Mercado Pago primeiro, depois Asaas e PagSeguro

### Configuração
- **Por negócio** → conta única, todos os profissionais recebem na mesma conta
- **Por profissional** → cada profissional tem sua própria conta

### Por profissional — opções independentes
- Aceita Pix (conecta conta gateway)
- Somente no local (sem pagamento online)

### Fluxo do cliente
1. Finaliza agendamento
2. Tela: **"Como deseja pagar?"**
   - **"Pagar agora com Pix"** → QR Code → confirma após pagamento
   - **"Pagar no local"** → confirma agendamento
3. Status: `pago` ou `aguardando_pagamento_local`

### Sem reembolso automático
Cancelamento não gera estorno — tratado fora da plataforma.

### Implementação necessária
- Campo `gateway` e `gateway_token` em `negocios` e `profissionais`
- Tela de configuração de pagamento no admin
- Geração QR Code Pix no agendamento
- Webhook de confirmação de pagamento
- Status de pagamento no agendamento

---

## 6. NOTIFICAÇÕES

### Quando cliente agenda
- **Profissional recebe email** com detalhes + botão **"Enviar confirmação WhatsApp"**
  → abre WhatsApp com mensagem pronta, profissional clica enviar

### Lembrete automático
- 1 dia antes → **cliente recebe email** com detalhes + link para cancelar

### Quando agendamento é cancelado pelo cliente
- **Profissional recebe email** — "[Cliente] cancelou o agendamento de [data/hora]"
- **Cliente recebe email** — confirmação do cancelamento

### Quando agendamento é cancelado pelo profissional/admin
- **Cliente recebe email** — "Seu agendamento foi cancelado"
- Profissional não recebe (foi ele quem cancelou)

### Implementação necessária
- Resend ou SendGrid (plano grátis suficiente para começar)
- Templates de email por evento
- Link de unsubscribe em todos os emails marketing

---

## 7. REATIVAÇÃO DE CLIENTES SUMIDOS

### Como funciona
- Sistema verifica automaticamente toda semana
- Prazo configurado **por serviço** — cada serviço tem seu tempo
  - Ex: Unha → 30 dias, Coloração → 60 dias, Corte → 45 dias
- Dispara email automático direto para o cliente — sem envolver o profissional

### Email para o cliente
- Mensagem personalizada: "Olá Maria, faz um tempo que não te vemos no Espaço Bella..."
- Link direto para agendar
- Link de **unsubscribe** (obrigatório — LGPD)

### Controle de frequência
- Mesmo cliente não recebe email toda semana
- Cliente que clicou unsubscribe nunca mais recebe

### Implementação necessária
- Campo `prazo_reativacao_dias` por serviço
- Campo `unsubscribe` no cadastro do cliente
- Job semanal (cron) que verifica e dispara emails
- Template de email de reativação por negócio

---

## DECISÕES TOMADAS

- ✅ Gateway Pix — Mercado Pago primeiro, depois Asaas e PagSeguro
- ✅ Autenticação cliente — Google + email magic link
- ✅ Notificações — email (Resend/SendGrid) + WhatsApp manual pelo profissional
- ✅ Reativação — 100% automático por email, configurado por serviço
- ✅ Pagamento — cliente decide no final do agendamento (Pix agora ou no local)
- ✅ Sem reembolso automático
- ✅ Sem taxa por agendamento — só mensalidade
