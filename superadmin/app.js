// ============================================================
// AutoAgenda — Super Admin
// ============================================================

const SUPABASE_URL = 'https://vsyiwgxsbvjjloftpvkf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzeWl3Z3hzYnZqamxvZnRwdmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwOTA2NzgsImV4cCI6MjA5MDY2NjY3OH0.DJqO-Y248xCr5mrffKcG2ZQQ_dhRubjzaQmF4V6sO90'
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let negocios = []
let editingNegocioId = null

// Profissionais
let profNegocioId = null
let profissionais = []
let servicos = []
let editingProfId = null

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
  if (tab === 'profissionais') initProfissionaisTab()
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open')
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none'
  editingNegocioId = null
  editingProfId = null
}

// ---- NEGÓCIOS ----
async function loadNegocios() {
  const { data } = await sb.from('negocios').select('*').order('nome')
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
        <button class="btn btn-sm btn-ghost" onclick="gerenciarProfissionais('${n.id}')">Profissionais</button>
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
  document.getElementById('nCorPrimaria').value = n.cor_primaria || '#3D2B1F'
  document.getElementById('nCorSecundaria').value = n.cor_secundaria || '#C4947A'
  document.getElementById('nCorFundo').value = n.cor_fundo || '#F9F5F0'
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
    cor_primaria: document.getElementById('nCorPrimaria').value,
    cor_secundaria: document.getElementById('nCorSecundaria').value,
    cor_fundo: document.getElementById('nCorFundo').value,
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

// ---- PROFISSIONAIS ----
function gerenciarProfissionais(negocioId) {
  switchTab('profissionais')
  document.getElementById('profNegocioSelect').value = negocioId
  loadProfissionaisDoNegocio(negocioId)
}

async function initProfissionaisTab() {
  const sel = document.getElementById('profNegocioSelect')
  sel.innerHTML = '<option value="">Selecione um negócio...</option>' +
    negocios.map(n => `<option value="${n.id}">${n.nome}</option>`).join('')
  document.getElementById('profissionaisContent').innerHTML = '<div class="empty-state">Selecione um negócio para ver os profissionais</div>'
  profNegocioId = null
  profissionais = []
  servicos = []
}

async function onProfNegocioChange() {
  const id = document.getElementById('profNegocioSelect').value
  if (!id) {
    document.getElementById('profissionaisContent').innerHTML = '<div class="empty-state">Selecione um negócio para ver os profissionais</div>'
    profNegocioId = null
    return
  }
  await loadProfissionaisDoNegocio(id)
}

async function loadProfissionaisDoNegocio(negocioId) {
  profNegocioId = negocioId
  document.getElementById('profissionaisContent').innerHTML = '<div class="empty-state">Carregando...</div>'

  const { data: svcs } = await sb
    .from('servicos')
    .select('*')
    .eq('negocio_id', negocioId)
    .eq('ativo', true)
    .order('nome')
  servicos = svcs || []

  const { data } = await sb
    .from('profissionais')
    .select('*, profissional_servicos(servico_id), profissional_horarios(id, dia_semana, hora_inicio, hora_fim)')
    .eq('negocio_id', negocioId)
    .order('nome')
  profissionais = data || []
  renderProfissionais()
}

function renderProfissionais() {
  const container = document.getElementById('profissionaisContent')
  if (!profissionais.length) {
    container.innerHTML = '<div class="empty-state">Nenhum profissional cadastrado neste negócio</div>'
    return
  }
  container.innerHTML = profissionais.map(p => {
    const servNames = (p.profissional_servicos || [])
      .map(ps => servicos.find(s => s.id === ps.servico_id)?.nome)
      .filter(Boolean).join(', ')
    const horariosCount = (p.profissional_horarios || []).length
    return `
      <div class="table-row">
        <div style="font-size:24px;width:40px;text-align:center">${p.avatar_emoji || '👤'}</div>
        <div class="table-main">
          <div class="table-name">${p.nome} ${!p.ativo ? '<span style="color:#86868b">(inativo)</span>' : ''}</div>
          <div class="table-sub">${servNames || 'Sem serviços'} &bull; ${horariosCount} horários</div>
        </div>
        <div class="table-actions">
          <button class="btn btn-sm btn-ghost" onclick="editProf('${p.id}')">Editar</button>
          <button class="btn btn-sm ${p.ativo ? 'btn-danger' : 'btn-primary'}" onclick="toggleProf('${p.id}', ${p.ativo})">${p.ativo ? 'Desativar' : 'Ativar'}</button>
        </div>
      </div>
    `
  }).join('')
}

function showProfForm() {
  if (!profNegocioId) { alert('Selecione um negócio primeiro'); return }
  editingProfId = null
  document.getElementById('modalProfTitle').textContent = 'Novo Profissional'
  document.getElementById('pNome').value = ''
  document.getElementById('pTel').value = ''
  document.getElementById('pEmoji').value = '👤'
  document.getElementById('pCor').value = '#E8DDD0'
  document.getElementById('pFoto').value = ''
  document.getElementById('pFotoPreview').style.display = 'none'
  document.getElementById('pFotoFile').value = ''
  document.getElementById('pFotoName').textContent = ''
  renderProfServicos([])
  const defaultH = []
  ;['seg','ter','qua','qui','sex','sab'].forEach(d => {
    defaultH.push({ dia_semana: d, hora_inicio: '08:00', hora_fim: '12:00' })
    defaultH.push({ dia_semana: d, hora_inicio: '13:00', hora_fim: '18:00' })
  })
  renderProfHorarios(defaultH)
  document.getElementById('modalProfError').style.display = 'none'
  document.getElementById('modalProf').style.display = 'flex'
}

function editProf(id) {
  const p = profissionais.find(x => x.id === id)
  if (!p) return
  editingProfId = id
  document.getElementById('modalProfTitle').textContent = 'Editar Profissional'
  document.getElementById('pNome').value = p.nome || ''
  document.getElementById('pTel').value = p.telefone || ''
  document.getElementById('pEmoji').value = p.avatar_emoji || '👤'
  document.getElementById('pCor').value = p.avatar_cor || '#E8DDD0'
  document.getElementById('pFoto').value = p.foto_url || ''
  document.getElementById('pFotoFile').value = ''
  document.getElementById('pFotoName').textContent = ''

  const preview = document.getElementById('pFotoPreview')
  if (p.foto_url) { preview.src = p.foto_url; preview.style.display = 'block' }
  else { preview.style.display = 'none' }

  const profServIds = (p.profissional_servicos || []).map(ps => ps.servico_id)
  renderProfServicos(profServIds)
  renderProfHorarios(p.profissional_horarios || [])

  document.getElementById('modalProfError').style.display = 'none'
  document.getElementById('modalProf').style.display = 'flex'
}

function renderProfServicos(selectedIds) {
  const container = document.getElementById('pServicos')
  if (!servicos.length) {
    container.innerHTML = '<div style="color:#86868b;font-size:13px">Nenhum serviço ativo neste negócio</div>'
    return
  }
  container.innerHTML = servicos.map(s => `
    <label class="checkbox-item ${selectedIds.includes(s.id) ? 'checked' : ''}" onclick="this.classList.toggle('checked')">
      <input type="checkbox" value="${s.id}" ${selectedIds.includes(s.id) ? 'checked' : ''}>
      ${s.nome}
    </label>
  `).join('')
}

function renderProfHorarios(horarios) {
  const container = document.getElementById('pHorarios')
  container.innerHTML = horarios.map((h, i) => `
    <div class="horario-row">
      <select data-h="${i}" data-field="dia">
        ${['seg','ter','qua','qui','sex','sab','dom'].map(d =>
          `<option value="${d}" ${h.dia_semana === d ? 'selected' : ''}>${d.charAt(0).toUpperCase()+d.slice(1)}</option>`
        ).join('')}
      </select>
      <input type="time" data-h="${i}" data-field="inicio" value="${(h.hora_inicio||'').slice(0,5)}">
      <span>até</span>
      <input type="time" data-h="${i}" data-field="fim" value="${(h.hora_fim||'').slice(0,5)}">
      <button class="btn-remove" onclick="this.parentElement.remove()">×</button>
    </div>
  `).join('')
}

function addHorarioRow() {
  const container = document.getElementById('pHorarios')
  const dias = ['seg','ter','qua','qui','sex','sab','dom']
  const existentes = [...container.querySelectorAll('.horario-row')].map(row => ({
    dia: row.querySelector('[data-field="dia"]').value,
    inicio: row.querySelector('[data-field="inicio"]').value,
  }))

  let diaSugerido = 'seg', inicioSugerido = '08:00', fimSugerido = '12:00'
  for (const dia of dias) {
    const temManha = existentes.some(h => h.dia === dia && h.inicio < '12:00')
    const temTarde = existentes.some(h => h.dia === dia && h.inicio >= '12:00')
    if (!temManha) { diaSugerido = dia; inicioSugerido = '08:00'; fimSugerido = '12:00'; break }
    if (!temTarde) { diaSugerido = dia; inicioSugerido = '13:00'; fimSugerido = '18:00'; break }
  }

  const i = container.children.length
  container.insertAdjacentHTML('beforeend', `
    <div class="horario-row">
      <select data-h="${i}" data-field="dia">
        ${dias.map(d =>
          `<option value="${d}" ${d === diaSugerido ? 'selected' : ''}>${d.charAt(0).toUpperCase()+d.slice(1)}</option>`
        ).join('')}
      </select>
      <input type="time" data-h="${i}" data-field="inicio" value="${inicioSugerido}">
      <span>até</span>
      <input type="time" data-h="${i}" data-field="fim" value="${fimSugerido}">
      <button class="btn-remove" onclick="this.parentElement.remove()">×</button>
    </div>
  `)
}

function previewFoto(input) {
  const file = input.files[0]
  if (!file) return
  document.getElementById('pFotoPreview').src = URL.createObjectURL(file)
  document.getElementById('pFotoPreview').style.display = 'block'
  document.getElementById('pFotoName').textContent = file.name
}

async function uploadFoto(profId) {
  const fileInput = document.getElementById('pFotoFile')
  const file = fileInput.files[0]
  if (!file) return document.getElementById('pFoto').value || null
  const ext = file.name.split('.').pop()
  const path = `profissionais/${profId}.${ext}`
  const { error } = await sb.storage.from('fotos').upload(path, file, { upsert: true, contentType: file.type })
  if (error) return document.getElementById('pFoto').value || null
  const { data } = sb.storage.from('fotos').getPublicUrl(path)
  return data.publicUrl + '?t=' + Date.now()
}

async function saveProf() {
  const errEl = document.getElementById('modalProfError')
  errEl.style.display = 'none'

  const nome = document.getElementById('pNome').value.trim()
  if (!nome) { errEl.textContent = 'Nome é obrigatório'; errEl.style.display = 'block'; return }

  const obj = {
    negocio_id: profNegocioId,
    nome,
    telefone: document.getElementById('pTel').value.trim() || null,
    avatar_emoji: document.getElementById('pEmoji').value,
    avatar_cor: document.getElementById('pCor').value,
    foto_url: document.getElementById('pFoto').value || null,
  }

  let profId = editingProfId
  if (editingProfId) {
    const fotoUrl = await uploadFoto(editingProfId)
    if (fotoUrl) obj.foto_url = fotoUrl
    await sb.from('profissionais').update(obj).eq('id', editingProfId)
  } else {
    const { data } = await sb.from('profissionais').insert(obj).select().single()
    profId = data.id
    const fotoUrl = await uploadFoto(profId)
    if (fotoUrl) await sb.from('profissionais').update({ foto_url: fotoUrl }).eq('id', profId)
  }

  // Salvar serviços
  await sb.from('profissional_servicos').delete().eq('profissional_id', profId)
  const checkedServicos = [...document.querySelectorAll('#pServicos .checkbox-item.checked input')]
    .map(inp => ({ profissional_id: profId, servico_id: inp.value }))
  if (checkedServicos.length) await sb.from('profissional_servicos').insert(checkedServicos)

  // Salvar horários com validação
  const rows = document.querySelectorAll('#pHorarios .horario-row')
  const horarios = [...rows].map(row => ({
    profissional_id: profId,
    dia_semana: row.querySelector('[data-field="dia"]').value,
    hora_inicio: row.querySelector('[data-field="inicio"]').value,
    hora_fim: row.querySelector('[data-field="fim"]').value,
  }))

  for (let i = 0; i < horarios.length; i++) {
    for (let j = i + 1; j < horarios.length; j++) {
      const a = horarios[i], b = horarios[j]
      if (a.dia_semana !== b.dia_semana) continue
      if (a.hora_inicio < b.hora_fim && b.hora_inicio < a.hora_fim) {
        const dia = a.dia_semana.charAt(0).toUpperCase() + a.dia_semana.slice(1)
        alert(`Horários sobrepostos em ${dia}: ${a.hora_inicio}–${a.hora_fim} e ${b.hora_inicio}–${b.hora_fim}.`)
        return
      }
    }
  }

  await sb.from('profissional_horarios').delete().eq('profissional_id', profId)
  if (horarios.length) await sb.from('profissional_horarios').insert(horarios)

  closeModal('modalProf')
  await loadProfissionaisDoNegocio(profNegocioId)
}

async function toggleProf(id, ativo) {
  await sb.from('profissionais').update({ ativo: !ativo }).eq('id', id)
  await loadProfissionaisDoNegocio(profNegocioId)
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

  if (!email || !senha) { errEl.textContent = 'Email e senha são obrigatórios'; errEl.style.display = 'block'; return }
  if (senha.length < 6) { errEl.textContent = 'Senha deve ter no mínimo 6 caracteres'; errEl.style.display = 'block'; return }

  btn.disabled = true
  btn.textContent = 'Criando...'

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
