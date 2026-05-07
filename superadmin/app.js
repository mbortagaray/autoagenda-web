// ============================================================
// AutoAgenda — Super Admin
// ============================================================

const SUPABASE_URL = 'https://vsyiwgxsbvjjloftpvkf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzeWl3Z3hzYnZqamxvZnRwdmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwOTA2NzgsImV4cCI6MjA5MDY2NjY3OH0.DJqO-Y248xCr5mrffKcG2ZQQ_dhRubjzaQmF4V6sO90'
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let negocios = []
let editingNegocioId = null

// ---- AUTH ----
async function doLogin() {
  const email = document.getElementById('loginEmail').value
  const senha = document.getElementById('loginSenha').value
  const errEl = document.getElementById('loginError')
  errEl.className = 'login-error'

  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha })
  if (error) {
    errEl.textContent = 'Email ou senha incorretos'
    errEl.className = 'login-error visible'
    return
  }

  // Verificar se é superadmin
  const { data: adminUser } = await sb
    .from('admin_users')
    .select('role')
    .eq('user_id', data.user.id)
    .single()

  if (!adminUser || adminUser.role !== 'superadmin') {
    await sb.auth.signOut()
    errEl.textContent = 'Acesso restrito ao Super Admin'
    errEl.className = 'login-error visible'
    return
  }

  await initSuperAdmin()
}

async function doLogout() {
  await sb.auth.signOut()
  location.reload()
}

async function checkSession() {
  const { data: { session } } = await sb.auth.getSession()
  if (session) {
    const { data: adminUser } = await sb
      .from('admin_users')
      .select('role')
      .eq('user_id', session.user.id)
      .single()
    if (adminUser?.role === 'superadmin') {
      await initSuperAdmin()
      return
    }
  }
  // Não autenticado ou não é superadmin — mostra login
}

async function initSuperAdmin() {
  document.getElementById('loginScreen').style.display = 'none'
  document.getElementById('superApp').style.display = 'flex'
  await loadNegocios()
}

// ---- TABS ----
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.getElementById('tab-' + tab).classList.add('active')
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active')
  document.getElementById('mobileTitle').textContent = tab.charAt(0).toUpperCase() + tab.slice(1)
  if (tab === 'usuarios') loadUsuarios()
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open')
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none'
  editingNegocioId = null
}

// ---- NEGÓCIOS ----
async function loadNegocios() {
  const { data } = await sb
    .from('negocios')
    .select('*')
    .order('nome')
  negocios = data || []
  renderNegocios(negocios)
}

function filterNegocios() {
  const q = document.getElementById('negocioSearch').value.toLowerCase()
  const filtered = negocios.filter(n =>
    n.nome.toLowerCase().includes(q) || (n.slug || '').toLowerCase().includes(q)
  )
  renderNegocios(filtered)
}

function renderNegocios(list) {
  const cont = document.getElementById('negociosContent')
  if (!list.length) {
    cont.innerHTML = '<div class="empty-state">Nenhum negócio encontrado</div>'
    return
  }

  cont.innerHTML = list.map(n => `
    <div class="table-row">
      <div class="table-main">
        <div class="table-name">${n.nome}</div>
        <div class="table-sub">
          <span class="slug-chip">/${n.slug}</span>
          ${n.cidade ? `<span>${n.cidade}</span>` : ''}
          ${n.telefone ? `<span>${n.telefone}</span>` : ''}
        </div>
      </div>
      <div class="table-actions">
        <span class="status-badge ${n.ativo ? 'active' : 'inactive'}">${n.ativo ? 'Ativo' : 'Inativo'}</span>
        <button class="btn btn-sm btn-ghost" onclick="editNegocio('${n.id}')">Editar</button>
        <button class="btn btn-sm ${n.ativo ? 'btn-danger' : 'btn-primary'}" onclick="toggleNegocio('${n.id}', ${n.ativo})">
          ${n.ativo ? 'Desativar' : 'Ativar'}
        </button>
        <a class="btn btn-sm btn-ghost" href="https://agenda.mdinamic.com.br/${n.slug}" target="_blank">↗ Ver</a>
      </div>
    </div>
  `).join('')
}

function showNegocioForm() {
  editingNegocioId = null
  document.getElementById('modalNegocioTitle').textContent = 'Novo Negócio'
  document.getElementById('nNome').value = ''
  document.getElementById('nSlug').value = ''
  document.getElementById('nTel').value = ''
  document.getElementById('nEndereco').value = ''
  document.getElementById('nCidade').value = ''
  document.getElementById('nMaps').value = ''
  document.getElementById('nCorPrimaria').value = '#3D2B1F'
  document.getElementById('nCorSecundaria').value = '#C4947A'
  document.getElementById('nCorFundo').value = '#F9F5F0'
  document.getElementById('nAntecedencia').value = '60'
  document.getElementById('nJanela').value = '24'
  document.getElementById('nAtivo').value = 'true'
  document.getElementById('modalNegocioError').style.display = 'none'
  document.getElementById('modalNegocio').style.display = 'flex'
}

function editNegocio(id) {
  const n = negocios.find(x => x.id === id)
  if (!n) return
  editingNegocioId = id
  document.getElementById('modalNegocioTitle').textContent = 'Editar Negócio'
  document.getElementById('nNome').value = n.nome || ''
  document.getElementById('nSlug').value = n.slug || ''
  document.getElementById('nTel').value = n.telefone || ''
  document.getElementById('nEndereco').value = n.endereco || ''
  document.getElementById('nCidade').value = n.cidade || ''
  document.getElementById('nMaps').value = n.google_maps_url || ''
  document.getElementById('nCorPrimaria').value = n.cores?.primaria || '#3D2B1F'
  document.getElementById('nCorSecundaria').value = n.cores?.secundaria || '#C4947A'
  document.getElementById('nCorFundo').value = n.cores?.fundo || '#F9F5F0'
  document.getElementById('nAntecedencia').value = n.antecedencia_minima_min || 60
  document.getElementById('nJanela').value = n.janela_cancelamento_horas || 24
  document.getElementById('nAtivo').value = String(n.ativo !== false)
  document.getElementById('modalNegocioError').style.display = 'none'
  document.getElementById('modalNegocio').style.display = 'flex'
}

async function saveNegocio() {
  const errEl = document.getElementById('modalNegocioError')
  errEl.style.display = 'none'

  const nome = document.getElementById('nNome').value.trim()
  const slug = document.getElementById('nSlug').value.trim()

  if (!nome || !slug) {
    errEl.textContent = 'Nome e slug são obrigatórios'
    errEl.style.display = 'block'
    return
  }

  const payload = {
    nome,
    slug,
    telefone: document.getElementById('nTel').value.trim() || null,
    endereco: document.getElementById('nEndereco').value.trim() || null,
    cidade: document.getElementById('nCidade').value.trim() || null,
    google_maps_url: document.getElementById('nMaps').value.trim() || null,
    cores: {
      primaria: document.getElementById('nCorPrimaria').value,
      secundaria: document.getElementById('nCorSecundaria').value,
      fundo: document.getElementById('nCorFundo').value,
    },
    antecedencia_minima_min: Number(document.getElementById('nAntecedencia').value) || 60,
    janela_cancelamento_horas: Number(document.getElementById('nJanela').value) || 24,
    ativo: document.getElementById('nAtivo').value === 'true',
  }

  let error
  if (editingNegocioId) {
    ;({ error } = await sb.from('negocios').update(payload).eq('id', editingNegocioId))
  } else {
    ;({ error } = await sb.from('negocios').insert(payload))
  }

  if (error) {
    errEl.textContent = error.message.includes('slug') ? 'Esse slug já está em uso' : error.message
    errEl.style.display = 'block'
    return
  }

  closeModal('modalNegocio')
  await loadNegocios()
}

async function toggleNegocio(id, ativo) {
  const acao = ativo ? 'desativar' : 'ativar'
  if (!confirm(`Deseja ${acao} este negócio?`)) return
  await sb.from('negocios').update({ ativo: !ativo }).eq('id', id)
  await loadNegocios()
}

// ---- USUÁRIOS ----
async function loadUsuarios() {
  const { data } = await sb
    .from('admin_users')
    .select('id, user_id, role, negocio_id, negocios(nome)')
    .order('role')
  renderUsuarios(data || [])
}

function renderUsuarios(list) {
  const cont = document.getElementById('usuariosContent')
  if (!list.length) {
    cont.innerHTML = '<div class="empty-state">Nenhum usuário encontrado</div>'
    return
  }

  cont.innerHTML = list.map(u => `
    <div class="table-row">
      <div class="table-main">
        <div class="table-name">${u.negocios?.nome || '—'}</div>
        <div class="table-sub">
          <span class="role-chip role-${u.role}">${u.role}</span>
          <span class="user-id-chip">${u.user_id}</span>
        </div>
      </div>
    </div>
  `).join('')
}

async function showUsuarioForm() {
  document.getElementById('uEmail').value = ''
  document.getElementById('uSenha').value = ''
  document.getElementById('uRole').value = 'owner'
  document.getElementById('modalUsuarioError').style.display = 'none'
  document.getElementById('modalUsuarioSuccess').style.display = 'none'
  document.getElementById('btnSaveUsuario').disabled = false
  document.getElementById('btnSaveUsuario').textContent = 'Criar usuário'

  // Populate negócios select
  const sel = document.getElementById('uNegocio')
  sel.innerHTML = negocios.map(n => `<option value="${n.id}">${n.nome}</option>`).join('')

  document.getElementById('modalUsuario').style.display = 'flex'
}

async function saveUsuario() {
  const errEl = document.getElementById('modalUsuarioError')
  const sucEl = document.getElementById('modalUsuarioSuccess')
  const btn = document.getElementById('btnSaveUsuario')
  errEl.style.display = 'none'
  sucEl.style.display = 'none'

  const email = document.getElementById('uEmail').value.trim()
  const senha = document.getElementById('uSenha').value.trim()
  const negocioId = document.getElementById('uNegocio').value
  const role = document.getElementById('uRole').value

  if (!email || !senha) {
    errEl.textContent = 'Email e senha são obrigatórios'
    errEl.style.display = 'block'
    return
  }
  if (senha.length < 6) {
    errEl.textContent = 'Senha deve ter no mínimo 6 caracteres'
    errEl.style.display = 'block'
    return
  }

  btn.disabled = true
  btn.textContent = 'Criando...'

  // Criar usuário via Edge Function (precisa de service role)
  const res = await fetch(`${SUPABASE_URL}/functions/v1/criar-admin-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha, negocio_id: negocioId, role }),
  })
  const result = await res.json()

  if (!res.ok || result.error) {
    errEl.textContent = result.error || 'Erro ao criar usuário'
    errEl.style.display = 'block'
    btn.disabled = false
    btn.textContent = 'Criar usuário'
    return
  }

  sucEl.textContent = `Usuário ${email} criado com sucesso!`
  sucEl.style.display = 'block'
  btn.textContent = 'Criado ✓'
  await loadUsuarios()
}

// ---- START ----
document.addEventListener('DOMContentLoaded', checkSession)
