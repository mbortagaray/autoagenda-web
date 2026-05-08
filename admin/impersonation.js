const IMPERSONATION_STORAGE_KEY = 'autoagenda_impersonating'

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

  window.close()
  setTimeout(() => {
    window.location.href = 'https://agenda.mdinamic.com.br/superadmin'
  }, 150)
}document.addEventListener('click', (event) => {
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
