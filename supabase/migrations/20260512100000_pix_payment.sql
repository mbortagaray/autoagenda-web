-- Adicionar suporte a pagamento Pix

-- Profissional: token MP e flag de Pix ativo
ALTER TABLE profissionais
  ADD COLUMN IF NOT EXISTS mp_access_token text,
  ADD COLUMN IF NOT EXISTS pix_ativo boolean DEFAULT false;

-- Agendamento: payment_id do MP e status de pagamento
ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS mp_payment_id text,
  ADD COLUMN IF NOT EXISTS pago boolean DEFAULT false;
