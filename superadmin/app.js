// ============================================================
// AutoAgenda — Super Admin
// ============================================================

const SUPABASE_URL = 'https://vsyiwgxsbvjjloftpvkf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzeWl3Z3hzYnZqamxvZnRwdmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwOTA2NzgsImV4cCI6MjA5MDY2NjY3OH0.DJqO-Y248xCr5mrffKcG2ZQQ_dhRubjzaQmF4V6sO90'
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: 'autoagenda-superadmin-auth' }
})

let negocios = []
let adminUsersCount = 0
let editingNegocioId = null

// Profissionais
let profNegocioId = null
let profissionais = []
let servicos = []
let editingProfId = null

function getPhoneDigits(value) {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.length > 11 && digits.startsWith('55')) digits = digits.slice(2)
  return digits.slice(0, 11)
}

function normalizePhone(value) {
  let digits = getPhoneDigits(value)

  if (digits.length === 10 && /^[6-9]/.test(digits[2])) {
    digits = digits.slice(0, 2) + '9' + digits.slice(2)
  }

  return digits.slice(0, 11)
}

function formatPhoneDigits(digits) {
  if (digits.length > 10) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7,11)}`
  if (digits.length > 6) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6,10)}`
  if (digits.length > 2) return `(${digits.slice(0,2)}) ${digits.slice(2)}`
  if (digits.length > 0) return `(${digits}`
  return ''
}

function formatPhone(value) {
  return formatPhoneDigits(normalizePhone(value))
}

function maskPhoneInput(input) {
  input.value = formatPhoneDigits(getPhoneDigits(input.value))
}

function normalizePhoneInput(input) {
  input.value = formatPhone(input.value)
}

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
  const navItem = document.querySelector(`[data-tab="${tab}"]`)
  if (navItem) navItem.classList.add('active')
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
  const [{ data }, adminResult] = await Promise.all([
    sb.from('negocios').select('*').order('nome'),
    sb.from('admin_users').select('id', { count: 'exact', head: true }).neq('role', 'superadmin'),
  ])
  negocios = data || []
  adminUsersCount = adminResult.count || 0
  renderNegocioStats()
  renderNegocios(negocios)
}

function filterNegocios() {
  const q = document.getElementById('negocioSearch').value.toLowerCase()
  const status = document.getElementById('negocioStatusFilter')?.value || 'todos'
  const filtered = negocios.filter(n =>
    (
      n.nome.toLowerCase().includes(q)
      || (n.slug || '').toLowerCase().includes(q)
      || (n.cidade || '').toLowerCase().includes(q)
    )
    && (
      status === 'todos'
      || (status === 'ativos' && n.ativo !== false)
      || (status === 'inativos' && n.ativo === false)
    )
  )
  renderNegocios(filtered)
}

function renderNegocioStats() {
  const ativos = negocios.filter(n => n.ativo !== false).length
  const inativos = negocios.filter(n => n.ativo === false).length
  document.getElementById('statAtivos').textContent = ativos
  document.getElementById('statInativos').textContent = inativos
  document.getElementById('statAdmins').textContent = adminUsersCount
}

function formatDateBR(dateStr) {
  if (!dateStr) return ''
  const dt = new Date(dateStr)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

function renderNegocios(list) {
  const cont = document.getElementById('negociosContent')
  if (!list.length) {
    cont.innerHTML = '<div class="empty-state">Nenhum negócio encontrado</div>'
    return
  }
  cont.innerHTML = list.map(n => `
    <div class="table-row negocio-row">
      <div class="table-main">
        <div class="table-name">${n.nome}</div>
        <div class="table-sub">
          <span class="slug-chip">/${n.slug}</span>
          ${n.cidade ? `<span>${n.cidade}</span>` : ''}
          ${n.telefone ? `<span>${formatPhone(n.telefone)}</span>` : ''}
          ${n.created_at ? `<span>Criado em ${formatDateBR(n.created_at)}</span>` : ''}
        </div>
      </div>
      <span class="status-badge ${n.ativo ? 'active' : 'inactive'}">${n.ativo ? 'Ativo' : 'Inativo'}</span>
      <div class="table-actions">
        <button class="btn btn-sm btn-ghost" onclick="gerenciarProfissionais('${n.id}')">Profissionais</button>
        <button class="btn btn-sm btn-ghost" onclick="gerenciarAdminsNegocio('${n.id}')">Admins</button>
        <button class="btn btn-sm btn-accent" onclick="entrarComoAdmin('${n.id}')">⚡ Entrar como admin</button>
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
  document.getElementById('nTel').value = formatPhone(n.telefone || '')
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
    telefone: normalizePhone(document.getElementById('nTel').value) || null,
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

async function entrarComoAdmin(negocioId) {
  const { data: { session } } = await sb.auth.getSession()
  const res = await fetch(SUPABASE_URL + '/functions/v1/impersonate-tenant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + session.access_token
    },
    body: JSON.stringify({ negocio_id: negocioId })
  })
  const result = await res.json()
  if (!res.ok || result.error) {
    alert('Erro: ' + (result.error || 'Nao foi possivel entrar como admin'))
    return
  }

  window.location.href = result.url
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
  document.getElementById('pTel').value = formatPhone(p.telefone || '')
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
    <label class="checkbox-item ${selectedIds.includes(s.id) ? 'checked' : ''}">
      <input type="checkbox" value="${s.id}" ${selectedIds.includes(s.id) ? 'checked' : ''} onchange="this.closest('.checkbox-item').classList.toggle('checked', this.checked)">
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
    telefone: normalizePhone(document.getElementById('pTel').value) || null,
    avatar_emoji: document.getElementById('pEmoji').value,
    avatar_cor: document.getElementById('pCor').value,
    foto_url: document.getElementById('pFoto').value || null,
  }

  let profId = editingProfId
  if (editingProfId) {
    const fotoUrl = await uploadFoto(editingProfId)
    if (fotoUrl) obj.foto_url = fotoUrl
    const { error } = await sb.from('profissionais').update(obj).eq('id', editingProfId)
    if (error) return showProfSaveError(error.message)
  } else {
    const { data, error } = await sb.from('profissionais').insert(obj).select().single()
    if (error) return showProfSaveError(error.message)
    profId = data.id
    const fotoUrl = await uploadFoto(profId)
    if (fotoUrl) {
      const { error } = await sb.from('profissionais').update({ foto_url: fotoUrl }).eq('id', profId)
      if (error) return showProfSaveError(error.message)
    }
  }

  // Salvar serviços
  const { error: deleteServicosError } = await sb.from('profissional_servicos').delete().eq('profissional_id', profId)
  if (deleteServicosError) return showProfSaveError(deleteServicosError.message)

  const checkedServicos = [...document.querySelectorAll('#pServicos input:checked')]
    .map(inp => ({ profissional_id: profId, servico_id: inp.value }))
  if (checkedServicos.length) {
    const { error: insertServicosError } = await sb.from('profissional_servicos').insert(checkedServicos)
    if (insertServicosError) return showProfSaveError(insertServicosError.message)
  }

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

  const { error: deleteHorariosError } = await sb.from('profissional_horarios').delete().eq('profissional_id', profId)
  if (deleteHorariosError) return showProfSaveError(deleteHorariosError.message)
  if (horarios.length) {
    const { error: insertHorariosError } = await sb.from('profissional_horarios').insert(horarios)
    if (insertHorariosError) return showProfSaveError(insertHorariosError.message)
  }

  closeModal('modalProf')
  await loadProfissionaisDoNegocio(profNegocioId)
}

function showProfSaveError(message) {
  const errEl = document.getElementById('modalProfError')
  errEl.textContent = 'Erro ao salvar profissional: ' + message
  errEl.style.display = 'block'
}

async function toggleProf(id, ativo) {
  await sb.from('profissionais').update({ ativo: !ativo }).eq('id', id)
  await loadProfissionaisDoNegocio(profNegocioId)
}

// ---- USUÁRIOS ----
let usuariosAgrupados = []

async function loadUsuarios() {
  const { data } = await sb
    .from('admin_users')
    .select('id, user_id, email, nome, role, negocio_id, negocios(id, nome)')
  const rows = data || []

  // Agrupa por user_id
  const map = new Map()
  for (const r of rows) {
    if (!map.has(r.user_id)) {
      map.set(r.user_id, {
        user_id: r.user_id,
        email: r.email,
        nome: r.nome,
        role: r.role,
        negocios: [],
      })
    }
    const u = map.get(r.user_id)
    if (!u.email && r.email) u.email = r.email
    if (!u.nome && r.nome) u.nome = r.nome
    if (r.negocio_id && r.negocios) {
      u.negocios.push({ admin_users_id: r.id, negocio_id: r.negocio_id, nome: r.negocios.nome })
    }
  }

  // Ordem: superadmin → admin → owner
  const ordem = { superadmin: 0, admin: 1, owner: 2 }
  usuariosAgrupados = [...map.values()].sort((a, b) => (ordem[a.role] ?? 9) - (ordem[b.role] ?? 9))
  renderUsuarios(usuariosAgrupados)
}

function renderUsuarios(list) {
  const cont = document.getElementById('usuariosContent')
  if (!list.length) {
    cont.innerHTML = '<div class="empty-state">Nenhum usuário encontrado</div>'
    return
  }
  cont.innerHTML = list.map(u => {
    const isSuperadmin = u.role === 'superadmin'
    const negCount = u.negocios.length
    const negBtn = isSuperadmin
      ? '<span style="color:var(--text-muted);font-size:13px">—</span>'
      : `<button class="btn btn-sm btn-ghost" onclick="openUserNegociosDrawer('${u.user_id}')">${negCount} negócio${negCount === 1 ? '' : 's'} ›</button>`
    return `
      <div class="table-row" style="align-items:center;gap:12px">
        <div class="table-main">
          <span class="role-chip role-${u.role}">${u.role}</span>
          <div class="table-name" style="margin-top:6px">${u.nome || '—'}</div>
          <div class="table-sub">${u.email || u.user_id}</div>
        </div>
        ${negBtn}
      </div>
    `
  }).join('')
}

// ---- DRAWER NEGÓCIOS DO USUÁRIO ----
let drawerUserCurrent = null

function openUserNegociosDrawer(userId) {
  const u = usuariosAgrupados.find(x => x.user_id === userId)
  if (!u) return
  drawerUserCurrent = u
  document.getElementById('drawerUserNome').textContent = u.nome || '—'
  document.getElementById('drawerUserEmail').textContent = u.email || u.user_id
  const roleEl = document.getElementById('drawerUserRole')
  roleEl.textContent = u.role
  roleEl.className = `role-chip role-${u.role}`
  renderDrawerUserNegocios()
  document.getElementById('drawerUserFeedback').style.display = 'none'
  document.getElementById('drawerUserNegocios').style.display = 'flex'
}

function renderDrawerUserNegocios() {
  const list = document.getElementById('drawerUserNegociosList')
  if (!drawerUserCurrent.negocios.length) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Nenhum negócio vinculado.</div>'
  } else {
    list.innerHTML = drawerUserCurrent.negocios.map(n => `
      <div class="drawer-item">
        <span class="drawer-item-name">${n.nome}</span>
        <button class="btn btn-sm btn-danger" onclick="desvincularNegocioDoUser('${n.admin_users_id}')">Desvincular</button>
      </div>
    `).join('')
  }
  // Popula select com negócios não vinculados
  const linkedIds = new Set(drawerUserCurrent.negocios.map(n => n.negocio_id))
  const available = negocios.filter(n => !linkedIds.has(n.id))
  const sel = document.getElementById('drawerUserNegocioSelect')
  sel.disabled = !available.length
  sel.innerHTML = available.length
    ? '<option value="">Selecione...</option>' + available.map(n => `<option value="${n.id}">${n.nome}</option>`).join('')
    : '<option value="">Nenhum negócio disponível</option>'
}

async function vincularNegocioAoUser() {
  const negocioId = document.getElementById('drawerUserNegocioSelect').value
  const feedback = document.getElementById('drawerUserFeedback')
  feedback.style.display = 'none'
  if (!negocioId || !drawerUserCurrent) return

  // Insere vínculo
  const { error } = await sb.from('admin_users').insert({
    user_id: drawerUserCurrent.user_id,
    negocio_id: negocioId,
    role: drawerUserCurrent.role,
    email: drawerUserCurrent.email,
    nome: drawerUserCurrent.nome,
  })
  if (error) {
    feedback.textContent = 'Erro: ' + error.message
    feedback.style.display = 'block'
    return
  }

  // Se era a 1ª vinculação, deletar a linha órfã (negocio_id=null)
  if (drawerUserCurrent.negocios.length === 0) {
    await sb.from('admin_users').delete().eq('user_id', drawerUserCurrent.user_id).is('negocio_id', null)
  }

  await loadUsuarios()
  // Reabre o drawer com o estado atualizado
  const updated = usuariosAgrupados.find(x => x.user_id === drawerUserCurrent.user_id)
  if (updated) {
    drawerUserCurrent = updated
    renderDrawerUserNegocios()
  }
}

async function desvincularNegocioDoUser(adminUsersId) {
  if (!confirm('Desvincular este negócio do usuário?')) return
  await sb.from('admin_users').delete().eq('id', adminUsersId)
  await loadUsuarios()
  const updated = usuariosAgrupados.find(x => x.user_id === drawerUserCurrent.user_id)
  if (updated) {
    drawerUserCurrent = updated
    renderDrawerUserNegocios()
  } else {
    closeDrawer('drawerUserNegocios')
  }
}

function closeDrawer(id) {
  document.getElementById(id).style.display = 'none'
  drawerUserCurrent = null
}

function mapAuthError(msg) {
  if (!msg) return 'Erro desconhecido'
  if (msg.includes('already registered') || msg.includes('already been registered')) return 'Email já cadastrado'
  if (msg.includes('invalid email') || msg.includes('Invalid email')) return 'Email inválido'
  if (msg.includes('Password should be') || msg.includes('password')) return 'Senha deve ter no mínimo 6 caracteres'
  return msg
}

function onRoleChange() {
  const role = document.getElementById('uRole').value
  document.getElementById('uNegocioGroup').style.display = (role === 'superadmin' || role === 'admin') ? 'none' : ''
}

async function showUsuarioForm() {
  document.getElementById('uNome').value = ''
  document.getElementById('uEmail').value = ''
  document.getElementById('uSenha').value = ''
  document.getElementById('uSenhaConfirm').value = ''
  document.getElementById('uRole').value = 'admin'
  document.getElementById('modalUsuarioError').style.display = 'none'
  document.getElementById('modalUsuarioSuccess').style.display = 'none'
  document.getElementById('btnSaveUsuario').disabled = false
  document.getElementById('btnSaveUsuario').textContent = 'Criar usuário'
  const sel = document.getElementById('uNegocio')
  sel.innerHTML = negocios.map(n => `<option value="${n.id}">${n.nome}</option>`).join('')
  onRoleChange()
  document.getElementById('modalUsuario').style.display = 'flex'
}

async function saveUsuario() {
  const errEl = document.getElementById('modalUsuarioError')
  const sucEl = document.getElementById('modalUsuarioSuccess')
  const btn = document.getElementById('btnSaveUsuario')
  errEl.style.display = 'none'
  sucEl.style.display = 'none'

  const nome = document.getElementById('uNome').value.trim()
  const email = document.getElementById('uEmail').value.trim()
  const senha = document.getElementById('uSenha').value
  const senhaConfirm = document.getElementById('uSenhaConfirm').value
  const negocioId = document.getElementById('uNegocio').value
  const role = document.getElementById('uRole').value

  if (!nome) { errEl.textContent = 'Nome é obrigatório'; errEl.style.display = 'block'; return }
  if (!email || !senha) { errEl.textContent = 'Email e senha são obrigatórios'; errEl.style.display = 'block'; return }
  if (senha.length < 6) { errEl.textContent = 'Senha deve ter no mínimo 6 caracteres'; errEl.style.display = 'block'; return }
  if (senha !== senhaConfirm) { errEl.textContent = 'Senhas não coincidem'; errEl.style.display = 'block'; return }
  if (role === 'owner' && !negocioId) { errEl.textContent = 'Selecione um negócio'; errEl.style.display = 'block'; return }

  btn.disabled = true
  btn.textContent = 'Criando...'

  const { data: { session } } = await sb.auth.getSession()
  const res = await fetch(`${SUPABASE_URL}/functions/v1/criar-admin-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ nome, email, senha, negocio_id: (role === 'admin' || role === 'superadmin') ? null : (negocioId || null), role }),
  })
  const result = await res.json()

  if (!res.ok || result.error) {
    errEl.textContent = mapAuthError(result.error)
    errEl.style.display = 'block'
    btn.disabled = false
    btn.textContent = 'Criar usuário'
    return
  }

  sucEl.textContent = `Usuário ${email} criado com sucesso!`
  sucEl.style.display = 'block'
  btn.textContent = 'Criado ✓'
  await loadUsuarios()
  setTimeout(() => closeModal('modalUsuario'), 1500)
}

// ---- ADMINS DO NEGÓCIO ----
let adminsNegocioCurrentId = null

async function gerenciarAdminsNegocio(negocioId) {
  adminsNegocioCurrentId = negocioId
  const neg = negocios.find(n => n.id === negocioId)
  document.getElementById('modalAdminsNegocioTitle').textContent = `Admins — ${neg?.nome || ''}`
  document.getElementById('adminsNegocioFeedback').style.display = 'none'
  await loadAdminsNegocio(negocioId)
  document.getElementById('modalAdminsNegocio').style.display = 'flex'
}

async function loadAdminsNegocio(negocioId) {
  const [{ data: linked }, { data: allAdmins }] = await Promise.all([
    sb.from('admin_users').select('id, user_id, email, role').eq('negocio_id', negocioId).neq('role', 'superadmin'),
    sb.from('admin_users').select('user_id, email, role').neq('role', 'superadmin'),
  ])

  const uniqueMap = new Map()
  for (const a of (allAdmins || [])) {
    if (!uniqueMap.has(a.user_id)) uniqueMap.set(a.user_id, a)
  }
  const linkedIds = new Set((linked || []).map(l => l.user_id))
  const available = [...uniqueMap.values()].filter(a => !linkedIds.has(a.user_id))

  const listEl = document.getElementById('adminsNegocioList')
  listEl.innerHTML = linked?.length
    ? linked.map(u => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
          <div>
            <span style="font-size:14px;font-weight:500">${u.email || u.user_id}</span>
            <span class="role-chip role-${u.role}" style="margin-left:8px">${u.role}</span>
          </div>
          <button class="btn btn-sm btn-danger" onclick="desvincularAdmin('${u.id}')">Desvincular</button>
        </div>`).join('')
    : '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Nenhum admin vinculado.</div>'

  const sel = document.getElementById('adminsNegocioSelect')
  sel.disabled = !available.length
  sel.innerHTML = available.length
    ? '<option value="">Selecione...</option>' + available.map(a => `<option value="${a.user_id}">${a.email || a.user_id}</option>`).join('')
    : '<option value="">Nenhum admin disponível</option>'
}

async function vincularAdminSelecionado() {
  const userId = document.getElementById('adminsNegocioSelect').value
  const feedback = document.getElementById('adminsNegocioFeedback')
  feedback.style.display = 'none'
  if (!userId || !adminsNegocioCurrentId) return

  const { data: adminInfo } = await sb.from('admin_users').select('role, email').eq('user_id', userId).limit(1).single()
  const { error } = await sb.from('admin_users').insert({
    user_id: userId,
    negocio_id: adminsNegocioCurrentId,
    role: adminInfo.role,
    email: adminInfo.email,
  })

  if (error) {
    feedback.textContent = 'Erro: ' + error.message
    feedback.style.display = 'block'
    return
  }
  await loadAdminsNegocio(adminsNegocioCurrentId)
}

async function desvincularAdmin(adminUsersId) {
  if (!confirm('Desvincular este admin do negócio?')) return
  await sb.from('admin_users').delete().eq('id', adminUsersId)
  await loadAdminsNegocio(adminsNegocioCurrentId)
}

// ---- TEMA ----
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const next = isDark ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', next)
  localStorage.setItem('sa-theme', next)
  document.getElementById('themeIcon').textContent = next === 'dark' ? '☀️' : '🌙'
}

function initTheme() {
  const saved = localStorage.getItem('sa-theme') || 'light'
  document.documentElement.setAttribute('data-theme', saved)
  const icon = document.getElementById('themeIcon')
  if (icon) icon.textContent = saved === 'dark' ? '☀️' : '🌙'
}

// ---- START ----
document.addEventListener('DOMContentLoaded', () => { initTheme(); checkSession() })
