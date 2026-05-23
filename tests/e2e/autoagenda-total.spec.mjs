import { expect, test } from '@playwright/test'

const tenantSlug = process.env.E2E_TENANT_SLUG || 'espaco-bella'
const allowMutation = process.env.E2E_ALLOW_MUTATION === '1'
const allowImpersonation = process.env.E2E_ALLOW_IMPERSONATION === '1'

const adminEmail = process.env.E2E_ADMIN_EMAIL
const adminPassword = process.env.E2E_ADMIN_PASSWORD
const superEmail = process.env.E2E_SUPERADMIN_EMAIL
const superPassword = process.env.E2E_SUPERADMIN_PASSWORD

function decodeUrlRepeatedly(value) {
  let decoded = value
  for (let i = 0; i < 3; i += 1) {
    const next = decodeURIComponent(decoded)
    if (next === decoded) break
    decoded = next
  }
  return decoded
}

function requireCredentials(email, password, label) {
  test.skip(!email || !password, `Defina ${label}_EMAIL e ${label}_PASSWORD para testar login real.`)
}

async function loginPassword(page, url, email, password, appSelector) {
  await page.goto(url)
  await expect(page.locator('#loginScreen')).toBeVisible()
  await page.locator('#loginEmail').fill(email)
  await page.locator('#loginSenha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.locator(appSelector)).toBeVisible({ timeout: 20_000 })
}

async function closeModalById(page, modalId) {
  const modal = page.locator(`#${modalId}`)
  await expect(modal).toBeVisible()
  await modal.getByRole('button', { name: /Cancelar|Fechar/ }).click()
  await expect(modal).toBeHidden()
}

test.describe('AutoAgenda E2E publico', () => {
  test('cliente escolhe servico, horario e chega ao login Google com retorno correto', async ({ page }) => {
    await page.goto(`/${tenantSlug}`)
    await expect(page.getByText('Qual serviço?', { exact: true })).toBeVisible()
    await expect(page.getByText('Espaço Bella')).toBeVisible()

    const serviceCard = page.locator('.sel-card').filter({ hasText: 'Corte de Cabelo' })
    await expect(serviceCard).toHaveCount(1)
    await serviceCard.click()

    const firstContinue = page.locator('#btnStep1')
    if (await firstContinue.isVisible()) {
      await expect(firstContinue).toBeEnabled()
      await firstContinue.click()
    }

    await expect(page.getByText('Quando?', { exact: true })).toBeVisible()
    await expect(page.locator('#slotsWrap')).toBeVisible({ timeout: 30_000 })

    const firstSlot = page.locator('.slot').first()
    await expect(firstSlot).toBeVisible()
    await firstSlot.click()
    await expect(page.locator('#btnStep3')).toBeEnabled()
    await page.locator('#btnStep3').click()

    await expect(page.getByText('Seus dados', { exact: true })).toBeVisible()
    await expect(page.locator('#step4Login .btn-login-google')).toBeVisible()

    await Promise.all([
      page.waitForURL(/accounts\.google\.com/, { timeout: 20_000 }),
      page.locator('#step4Login .btn-login-google').click(),
    ])

    const url = page.url()
    expect(url).toContain('accounts.google.com')
    expect(decodeUrlRepeatedly(url)).toContain(`/${tenantSlug}?auth_flow=agendar`)
  })

  test('Edge Functions publicas aceitam headers do cliente Supabase no preflight', async ({ request }) => {
    const functions = [
      { name: 'config', method: 'GET' },
      { name: 'horarios', method: 'GET' },
      { name: 'cliente-lookup', method: 'GET' },
      { name: 'meus-agendamentos', method: 'GET' },
      { name: 'agendar', method: 'POST' },
      { name: 'cancelar', method: 'POST' },
      { name: 'gerar-pix', method: 'POST' },
    ]

    for (const fn of functions) {
      const response = await request.fetch(`https://vsyiwgxsbvjjloftpvkf.supabase.co/functions/v1/${fn.name}`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://agenda.mdinamic.com.br',
          'Access-Control-Request-Method': fn.method,
          'Access-Control-Request-Headers': 'authorization,x-client-info,apikey,content-type',
        },
      })

      expect(response.status(), fn.name).toBe(200)
      expect(response.headers()['access-control-allow-headers'], fn.name)
        .toContain('authorization, x-client-info, apikey, content-type')
    }
  })
})

test.describe('AutoAgenda E2E admin tenant', () => {
  test.beforeEach(() => requireCredentials(adminEmail, adminPassword, 'E2E_ADMIN'))

  test('admin entra e navega pelas areas principais sem gravar dados', async ({ page }) => {
    await loginPassword(page, '/admin', adminEmail, adminPassword, '#adminApp')

    await expect(page.locator('#tab-agenda')).toBeVisible()
    await expect(page.locator('#agendaContent')).toBeVisible()

    await page.locator('[data-tab="servicos"]').click()
    await expect(page.getByRole('heading', { name: 'Serviços' })).toBeVisible()
    await page.getByRole('button', { name: '+ Novo serviço' }).click()
    await expect(page.locator('#sNome')).toBeVisible()
    await closeModalById(page, 'modalServico')

    await page.locator('[data-tab="profissionais"]').click()
    await expect(page.getByRole('heading', { name: 'Profissionais' })).toBeVisible()
    await page.getByRole('button', { name: '+ Novo profissional' }).click()
    await expect(page.locator('#pNome')).toBeVisible()
    await closeModalById(page, 'modalProf')

    await page.locator('[data-tab="bloqueios"]').click()
    await expect(page.getByRole('heading', { name: 'Bloqueios' })).toBeVisible()
    await expect(page.locator('#bTipo')).toBeVisible()

    await page.locator('[data-tab="clientes"]').click()
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
    await expect(page.locator('#clienteSearch')).toBeVisible()

    await page.locator('[data-tab="config"]').click()
    await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible()
    await expect(page.locator('#cfgNome')).toBeVisible()
  })
})

test.describe('AutoAgenda E2E superadmin', () => {
  test.beforeEach(() => requireCredentials(superEmail, superPassword, 'E2E_SUPERADMIN'))

  test('superadmin entra e valida negocios, usuarios e modais principais', async ({ page }) => {
    await loginPassword(page, '/superadmin', superEmail, superPassword, '#superApp')

    await expect(page.getByRole('heading', { name: 'Negócios' })).toBeVisible()
    await expect(page.locator('#negociosContent')).toBeVisible()

    await page.locator('#negocioSearch').fill(tenantSlug)
    await expect(page.locator('#negociosContent')).toContainText(tenantSlug, { timeout: 20_000 })

    await page.getByRole('button', { name: '+ Novo negócio' }).click()
    await expect(page.locator('#nNome')).toBeVisible()
    await closeModalById(page, 'modalNegocio')

    await page.locator('[data-tab="usuarios"]').click()
    await expect(page.getByRole('heading', { name: 'Usuários Admin' })).toBeVisible()
    await expect(page.locator('#usuariosContent')).toBeVisible()
    await page.getByRole('button', { name: '+ Novo usuário' }).click()
    await expect(page.locator('#uEmail')).toBeVisible()
    await closeModalById(page, 'modalUsuario')
  })

  test('superadmin pode abrir admin via impersonation quando habilitado', async ({ page }) => {
    test.skip(!allowImpersonation, 'Defina E2E_ALLOW_IMPERSONATION=1 para testar Entrar como admin.')

    await loginPassword(page, '/superadmin', superEmail, superPassword, '#superApp')
    await page.locator('#negocioSearch').fill(tenantSlug)
    await expect(page.locator('#negociosContent')).toContainText(tenantSlug, { timeout: 20_000 })

    const tenantRow = page.locator('.negocio-row').filter({ hasText: `/${tenantSlug}` })
    await expect(tenantRow).toHaveCount(1)

    const enterButton = tenantRow.getByRole('button', { name: /Entrar como admin/ })
    await expect(enterButton).toBeVisible()

    await Promise.all([
      page.waitForURL(/\/admin/, { timeout: 20_000 }),
      enterButton.click(),
    ])

    await expect(page.locator('#adminApp')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('#impersonationBanner')).toBeVisible()
  })

  test('mutacoes ficam bloqueadas por padrao', async () => {
    test.skip(allowMutation, 'Mutacoes habilitadas externamente.')
    expect(allowMutation).toBe(false)
  })
})
