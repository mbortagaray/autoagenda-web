const IMPERSONATION_STORAGE_KEY = 'autoagenda_impersonating'
const IMPERSONATION_REAL_ADMIN_AUTH_KEY = 'autoagenda_real_admin_auth'
const IMPERSONATION_RETURN_TO_KEY = 'autoagenda_impersonation_return_to'
const ADMIN_AUTH_STORAGE_KEY = 'autoagenda-admin-auth'

function hasImpersonationParam() {
  const searchParams = new URLSearchParams(window.location.search)
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return searchParams.get('impersonating') === 'true' || hashParams.get('impersonating') === 'true'
}

if (hasImpersonationParam()) {
  sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, 'true')
}

function sairImpersonationPreservandoSuperadmin() {
  sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY)
  const realAdminAuth = sessionStorage.getItem(IMPERSONATION_REAL_ADMIN_AUTH_KEY)
  const returnTo = sessionStorage.getItem(IMPERSONATION_RETURN_TO_KEY)

  sessionStorage.removeItem(IMPERSONATION_REAL_ADMIN_AUTH_KEY)
  sessionStorage.removeItem(IMPERSONATION_RETURN_TO_KEY)

  if (realAdminAuth) {
    localStorage.setItem(ADMIN_AUTH_STORAGE_KEY, realAdminAuth)
    window.location.href = returnTo || '/admin'
    return
  }

  window.close()
  setTimeout(() => {
    window.location.href = 'https://agenda.mdinamic.com.br/superadmin'
  }, 150)
}

function sairImpersonation() {
  sairImpersonationPreservandoSuperadmin()
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('.impersonation-exit')) return
  event.preventDefault()
  event.stopImmediatePropagation()
  sairImpersonationPreservandoSuperadmin()
}, true)

document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem(IMPERSONATION_STORAGE_KEY) !== 'true') return

  const banner = document.getElementById('impersonationBanner')
  if (!banner) return

  const interval = setInterval(() => {
    if (negocio?.nome) {
      document.body.classList.add('is-impersonating')
      banner.style.display = 'flex'
      document.getElementById('impersonationNome').textContent = negocio.nome
      clearInterval(interval)
    }
  }, 300)
})
