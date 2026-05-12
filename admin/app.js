// ============================================================
// AutoAgenda Admin — Painel Administrativo
// ============================================================

const SUPABASE_URL = 'https://vsyiwgxsbvjjloftpvkf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzeWl3Z3hzYnZqamxvZnRwdmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwOTA2NzgsImV4cCI6MjA5MDY2NjY3OH0.DJqO-Y248xCr5mrffKcG2ZQQ_dhRubjzaQmF4V6sO90'

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: 'autoagenda-admin-auth' }
})

let negocioId = null
let negocio = null
let servicos = []
let profissionais = []
let editingId = null

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

// ============ AUTH ============
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

  await initAdmin()
}

async function doLogout() {
  await sb.auth.signOut()
  location.reload()
}

async function checkAuth() {
  const { data: { session } } = await sb.auth.getSession()
  if (session) {
    await initAdmin()
  }
}

async function initAdmin() {
  // Get negocio_id from admin_users
  const { data: { user } } = await sb.auth.getUser()
  const { data: adminUser } = await sb
    .from('admin_users')
    .select('negocio_id')
    .eq('user_id', user.id)
    .single()

  if (!adminUser) {
    alert('Usuário não vinculado a nenhum negócio')
    return
  }

  negocioId = adminUser.negocio_id

  // Load negocio data
  const { data: neg } = await sb.from('negocios').select('*').eq('id', negocioId).single()
  negocio = neg

  document.getElementById('loginScreen').style.display = 'none'
  document.getElementById('adminApp').style.display = 'flex'
  document.getElementById('sidebarNegocio').textContent = negocio.nome

  // Set today's date
  document.getElementById('agendaDate').value = new Date().toISOString().split('T')[0]

  await loadServicos()
  await loadProfissionais()
  loadAgendaProfFilter()
  loadAgenda()
  loadConfig()
}

// ============ SIDEBAR ============
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.getElementById('tab-' + tab).classList.add('active')
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active')
  document.getElementById('mobileTitle').textContent =
    document.querySelector(`[data-tab="${tab}"]`).textContent.trim()

  if (tab === 'clientes') loadClientes()
  if (tab === 'agenda') loadAgenda()
  if (tab === 'bloqueios') initBloqueios()

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open')
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open')
}

// ============ AGENDA ============
function changeAgendaDay(d) {
  const input = document.getElementById('agendaDate')
  const dt = new Date(input.value + 'T12:00:00')
  dt.setDate(dt.getDate() + d)
  input.value = dt.toISOString().split('T')[0]
  loadAgenda()
}

function agendaHoje() {
  document.getElementById('agendaDate').value = new Date().toISOString().split('T')[0]
  loadAgenda()
}

function loadAgendaProfFilter() {
  const sel = document.getElementById('agendaProfFilter')
  sel.innerHTML = '<option value="">Todos os profissionais</option>'
  profissionais.forEach(p => {
    sel.innerHTML += `<option value="${p.id}">${p.nome}</option>`
  })
}

async function loadAgenda() {
  const data = document.getElementById('agendaDate').value
  const profFilter = document.getElementById('agendaProfFilter').value
  const container = document.getElementById('agendaContent')
  container.innerHTML = '<div class="loading-sm">Carregando...</div>'

  let query = sb
    .from('agendamentos')
    .select('*, servicos(nome), profissionais(nome)')
    .eq('negocio_id', negocioId)
    .eq('data', data)
    .order('hora')

  if (profFilter) query = query.eq('profissional_id', profFilter)

  const { data: ags } = await query

  if (!ags || ags.length === 0) {
    container.innerHTML = '<div class="agenda-empty">Nenhum agendamento nesta data</div>'
    return
  }

  container.innerHTML = ags.map(ag => `
    <div class="agenda-card">
      <div class="agenda-time">${ag.hora?.slice(0,5)}</div>
      <div class="agenda-info">
        <div class="agenda-servico">${ag.servicos?.nome || ''}</div>
        <div class="agenda-detail">${ag.profissionais?.nome || ''} &bull; ${ag.cliente_nome} &bull; ${ag.duracao_min}min</div>
      </div>
      <span class="agenda-status status-${ag.status}">${ag.status}</span>
      ${ag.status === 'confirmado' ? `
        <div class="agenda-actions">
          <button class="btn-cancel" onclick="cancelarAg('${ag.id}')">Cancelar</button>
        </div>
      ` : ''}
    </div>
  `).join('')
}

async function cancelarAg(id) {
  if (!confirm('Cancelar este agendamento?')) return
  const { data: { session } } = await sb.auth.getSession()
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cancelar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ agendamento_id: id, origem: 'admin' }),
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok || result.error) {
    alert(result.error || 'Erro ao cancelar agendamento')
    return
  }
  loadAgenda()
}

// ============ SERVICOS ============
async function loadServicos() {
  const { data } = await sb
    .from('servicos')
    .select('*')
    .eq('negocio_id', negocioId)
    .order('nome')
  servicos = data || []
  renderServicos()
}

function renderServicos() {
  const container = document.getElementById('servicosContent')
  if (!servicos.length) {
    container.innerHTML = '<div class="agenda-empty">Nenhum serviço cadastrado</div>'
    return
  }
  container.innerHTML = '<div class="table-card">' + servicos.map(s => `
    <div class="table-row">
      <div class="table-main">
        <div class="table-name">${s.nome} ${!s.ativo ? '<span style="color:#86868b">(inativo)</span>' : ''}</div>
        <div class="table-sub">${s.duracao_min}min &bull; R$ ${Number(s.preco).toFixed(2).replace('.',',')}${s.promocao_ativa ? ' &bull; Promo: R$ ' + Number(s.preco_promocional||0).toFixed(2).replace('.',',') : ''}${s.prazo_reativacao_dias ? ' &bull; Reativacao: ' + s.prazo_reativacao_dias + ' dias' : ''}</div>
      </div>
      <div class="table-actions">
        <button onclick="editServico('${s.id}')">Editar</button>
        <button onclick="toggleServico('${s.id}', ${s.ativo})">${s.ativo ? 'Desativar' : 'Ativar'}</button>
      </div>
    </div>
  `).join('') + '</div>'
}

function showServicoForm(id) {
  editingId = id || null
  document.getElementById('modalServicoTitle').textContent = id ? 'Editar Serviço' : 'Novo Serviço'

  if (id) {
    const s = servicos.find(x => x.id === id)
    document.getElementById('sNome').value = s.nome
    document.getElementById('sDuracao').value = s.duracao_min
    document.getElementById('sPreco').value = s.preco
    document.getElementById('sPrecoPromo').value = s.preco_promocional || ''
    document.getElementById('sPromoAtiva').value = s.promocao_ativa ? 'true' : 'false'
    document.getElementById('sPrazoReativacao').value = s.prazo_reativacao_dias || ''
  } else {
    document.getElementById('sNome').value = ''
    document.getElementById('sDuracao').value = ''
    document.getElementById('sPreco').value = ''
    document.getElementById('sPrecoPromo').value = ''
    document.getElementById('sPromoAtiva').value = 'false'
    document.getElementById('sPrazoReativacao').value = ''
  }
  document.getElementById('modalServico').style.display = 'flex'
}

function editServico(id) { showServicoForm(id) }

async function saveServico() {
  const obj = {
    negocio_id: negocioId,
    nome: document.getElementById('sNome').value,
    duracao_min: parseInt(document.getElementById('sDuracao').value),
    preco: parseFloat(document.getElementById('sPreco').value),
    preco_promocional: document.getElementById('sPrecoPromo').value ? parseFloat(document.getElementById('sPrecoPromo').value) : null,
    promocao_ativa: document.getElementById('sPromoAtiva').value === 'true',
    prazo_reativacao_dias: document.getElementById('sPrazoReativacao').value ? parseInt(document.getElementById('sPrazoReativacao').value) : null,
  }

  if (editingId) {
    await sb.from('servicos').update(obj).eq('id', editingId)
  } else {
    await sb.from('servicos').insert(obj)
  }
  closeModal('modalServico')
  await loadServicos()
}

async function toggleServico(id, ativo) {
  await sb.from('servicos').update({ ativo: !ativo }).eq('id', id)
  await loadServicos()
}

// ============ PROFISSIONAIS ============
async function loadProfissionais() {
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
    container.innerHTML = '<div class="agenda-empty">Nenhum profissional cadastrado</div>'
    return
  }
  container.innerHTML = '<div class="table-card">' + profissionais.map(p => {
    const servNames = (p.profissional_servicos || [])
      .map(ps => servicos.find(s => s.id === ps.servico_id)?.nome)
      .filter(Boolean).join(', ')
    const horariosCount = (p.profissional_horarios || []).length
    return `
      <div class="table-row">
        <div style="font-size:24px;width:40px;text-align:center">${p.avatar_emoji || '👤'}</div>
        <div class="table-main">
          <div class="table-name">${p.nome} ${!p.ativo ? '<span style="color:#86868b">(inativo)</span>' : ''}</div>
          <div class="table-sub">${servNames || 'Sem serviços'} &bull; ${horariosCount} horários ${p.google_calendar_id ? '&bull; <span style="color:#34c759">📅 Calendar</span>' : ''}</div>
        </div>
        <div class="table-actions">
          <button onclick="editProf('${p.id}')">Editar</button>

          <button onclick="toggleProf('${p.id}', ${p.ativo})">${p.ativo ? 'Desativar' : 'Ativar'}</button>
        </div>
      </div>
    `
  }).join('') + '</div>'
}

function togglePixFields() {
  const ativo = document.getElementById('pPixAtivo').checked
  document.getElementById('pPixFields').style.display = ativo ? 'block' : 'none'
}

function showProfForm(id) {
  editingId = id || null
  document.getElementById('modalProfTitle').textContent = id ? 'Editar Profissional' : 'Novo Profissional'

  // Mostrar email da service account
  const serviceEmailEl = document.getElementById('pCalendarServiceEmail')
  if (serviceEmailEl) {
    fetch(`${SUPABASE_URL}/functions/v1/google-calendar-info`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
    }).then(r => r.json()).then(d => {
      if (d.service_email) serviceEmailEl.textContent = d.service_email
    }).catch(() => {
      serviceEmailEl.textContent = 'autoagenda-web@possible-glass-475302-i2.iam.gserviceaccount.com'
    })
  }

  // Render servicos checkboxes
  const checkboxGrid = document.getElementById('pServicos')
  const profServIds = id ? (profissionais.find(p => p.id === id)?.profissional_servicos || []).map(ps => ps.servico_id) : []
  checkboxGrid.innerHTML = servicos.filter(s => s.ativo).map(s => `
    <label class="checkbox-item ${profServIds.includes(s.id) ? 'checked' : ''}">
      <input type="checkbox" value="${s.id}" ${profServIds.includes(s.id) ? 'checked' : ''} onchange="this.closest('.checkbox-item').classList.toggle('checked', this.checked)">
      ${s.nome}
    </label>
  `).join('')

  // Reset foto upload
  document.getElementById('pFotoFile').value = ''
  document.getElementById('pFotoName').textContent = ''

  if (id) {
    const p = profissionais.find(x => x.id === id)
    document.getElementById('pNome').value = p.nome
    document.getElementById('pTel').value = formatPhone(p.telefone || '')
    document.getElementById('pEmail').value = p.email || ''
    document.getElementById('pEmoji').value = p.avatar_emoji || ''
    document.getElementById('pCor').value = p.avatar_cor || '#E8DDD0'
    document.getElementById('pFoto').value = p.foto_url || ''
    document.getElementById('pCalendarId').value = p.google_calendar_id || ''
    document.getElementById('pPixAtivo').checked = !!p.mp_access_token
    document.getElementById('pMpToken').value = p.mp_access_token || ''
    document.getElementById('pPixFields').style.display = p.mp_access_token ? 'block' : 'none'
    // Show existing photo
    const preview = document.getElementById('pFotoPreview')
    if (p.foto_url) {
      preview.src = p.foto_url
      preview.style.display = 'block'
    } else {
      preview.style.display = 'none'
    }
    renderProfHorarios(p.profissional_horarios || [])
  } else {
    document.getElementById('pNome').value = ''
    document.getElementById('pTel').value = ''
    document.getElementById('pEmail').value = ''
    document.getElementById('pEmoji').value = '👤'
    document.getElementById('pCor').value = '#E8DDD0'
    document.getElementById('pFoto').value = ''
    document.getElementById('pCalendarId').value = ''
    document.getElementById('pPixAtivo').checked = false
    document.getElementById('pMpToken').value = ''
    document.getElementById('pPixFields').style.display = 'none'
    document.getElementById('pFotoPreview').style.display = 'none'
    // Default horarios: seg-sab manhã+tarde
    const defaultH = []
    ;['seg','ter','qua','qui','sex','sab'].forEach(d => {
      defaultH.push({ dia_semana: d, hora_inicio: '08:00', hora_fim: '12:00' })
      defaultH.push({ dia_semana: d, hora_inicio: '13:00', hora_fim: '18:00' })
    })
    renderProfHorarios(defaultH)
  }

  document.getElementById('modalProf').style.display = 'flex'
}

function editProf(id) { showProfForm(id) }

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

  // Pegar horários já cadastrados
  const existentes = [...container.querySelectorAll('.horario-row')].map(row => ({
    dia: row.querySelector('[data-field="dia"]').value,
    inicio: row.querySelector('[data-field="inicio"]').value,
    fim: row.querySelector('[data-field="fim"]').value,
  }))

  // Sugerir próximo dia/turno ainda não cadastrado
  let diaSugerido = 'seg', inicioSugerido = '08:00', fimSugerido = '12:00'
  for (const dia of dias) {
    const temManha = existentes.some(h => h.dia === dia && h.inicio < '12:00' && h.fim <= '13:00')
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
  const preview = document.getElementById('pFotoPreview')
  const nameEl = document.getElementById('pFotoName')
  preview.src = URL.createObjectURL(file)
  preview.style.display = 'block'
  nameEl.textContent = file.name
}

async function uploadFoto(profId) {
  const fileInput = document.getElementById('pFotoFile')
  const file = fileInput.files[0]
  if (!file) return document.getElementById('pFoto').value || null

  const ext = file.name.split('.').pop()
  const path = `profissionais/${profId}.${ext}`

  const { error } = await sb.storage.from('fotos').upload(path, file, {
    upsert: true,
    contentType: file.type,
  })

  if (error) {
    console.error('Upload error:', error)
    return document.getElementById('pFoto').value || null
  }

  const { data } = sb.storage.from('fotos').getPublicUrl(path)
  return data.publicUrl + '?t=' + Date.now()
}

async function saveProf() {
  const modalError = document.getElementById('modalProfError')
  if (modalError) modalError.style.display = 'none'

  const obj = {
    negocio_id: negocioId,
    nome: document.getElementById('pNome').value,
    telefone: normalizePhone(document.getElementById('pTel').value) || null,
    email: document.getElementById('pEmail').value.trim() || null,
    avatar_emoji: document.getElementById('pEmoji').value,
    avatar_cor: document.getElementById('pCor').value,
    foto_url: document.getElementById('pFoto').value || null,
    google_calendar_id: document.getElementById('pCalendarId').value.trim() || null,
    mp_access_token: document.getElementById('pPixAtivo').checked ? (document.getElementById('pMpToken').value.trim() || null) : null,
  }

  let profId = editingId
  if (editingId) {
    // Upload foto if new file selected
    const fotoUrl = await uploadFoto(editingId)
    if (fotoUrl) obj.foto_url = fotoUrl
    const { error } = await sb.from('profissionais').update(obj).eq('id', editingId)
    if (error) return showProfSaveError(error.message)
  } else {
    const { data, error } = await sb.from('profissionais').insert(obj).select().single()
    if (error) return showProfSaveError(error.message)
    profId = data.id
    // Upload foto for new prof
    const fotoUrl = await uploadFoto(profId)
    if (fotoUrl) {
      const { error } = await sb.from('profissionais').update({ foto_url: fotoUrl }).eq('id', profId)
      if (error) return showProfSaveError(error.message)
    }
  }

  // Save servicos (delete + reinsert)
  const { error: deleteServicosError } = await sb.from('profissional_servicos').delete().eq('profissional_id', profId)
  if (deleteServicosError) return showProfSaveError(deleteServicosError.message)

  const checkedServicos = [...document.querySelectorAll('#pServicos input:checked')]
    .map(inp => ({ profissional_id: profId, servico_id: inp.value }))
  if (checkedServicos.length) {
    const { error: insertServicosError } = await sb.from('profissional_servicos').insert(checkedServicos)
    if (insertServicosError) return showProfSaveError(insertServicosError.message)
  }

  // Save horarios (delete + reinsert) — valida sobreposições antes
  const rows = document.querySelectorAll('#pHorarios .horario-row')
  const horarios = [...rows].map(row => ({
    profissional_id: profId,
    dia_semana: row.querySelector('[data-field="dia"]').value,
    hora_inicio: row.querySelector('[data-field="inicio"]').value,
    hora_fim: row.querySelector('[data-field="fim"]').value,
  }))

  // Validar sobreposição: mesmo dia com horários que se cruzam
  for (let i = 0; i < horarios.length; i++) {
    for (let j = i + 1; j < horarios.length; j++) {
      const a = horarios[i], b = horarios[j]
      if (a.dia_semana !== b.dia_semana) continue
      const aIni = a.hora_inicio, aFim = a.hora_fim
      const bIni = b.hora_inicio, bFim = b.hora_fim
      // Sobreposição: a começa antes do fim de b E b começa antes do fim de a
      if (aIni < bFim && bIni < aFim) {
        const dia = a.dia_semana.charAt(0).toUpperCase() + a.dia_semana.slice(1)
        alert(`Horários sobrepostos em ${dia}: ${aIni}–${aFim} e ${bIni}–${bFim}.\nCorrija antes de salvar.`)
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
  await loadProfissionais()
  loadAgendaProfFilter()
}

function showProfSaveError(message) {
  const modalError = document.getElementById('modalProfError')
  if (modalError) {
    modalError.textContent = 'Erro ao salvar profissional: ' + message
    modalError.style.display = 'block'
  } else {
    alert('Erro ao salvar profissional: ' + message)
  }
}

async function toggleProf(id, ativo) {
  await sb.from('profissionais').update({ ativo: !ativo }).eq('id', id)
  await loadProfissionais()
}

function connectGoogleCal(profId) {
  const url = SUPABASE_URL + '/functions/v1/google-auth?profissional_id=' + profId
  window.open(url, '_blank', 'width=500,height=600')
  // Reload after a delay to check if connected
  setTimeout(() => loadProfissionais(), 10000)
}

// ============ BLOQUEIOS ============
function initBloqueios() {
  const today = new Date().toISOString().split('T')[0]
  document.getElementById('bDataInicio').value = today
  document.getElementById('bDataFim').value = today
  document.getElementById('bAno').value = new Date().getFullYear()
  renderBloqueioProfissionais()
  renderBloqueioEscopos()
  renderBloqueioFiltros()
  onBloqueioTipoChange()
  loadBloqueios()
}

function clearBloqueioFeedback() {
  const feedback = document.getElementById('bloqueioFeedback')
  feedback.style.display = 'none'
  feedback.textContent = ''
}

function switchBloqueiosView(view) {
  document.getElementById('bloqueiosCriarView').style.display = view === 'criar' ? 'block' : 'none'
  document.getElementById('bloqueiosConsultarView').style.display = view === 'consultar' ? 'block' : 'none'
  document.getElementById('bloqueiosCriarTab').classList.toggle('active', view === 'criar')
  document.getElementById('bloqueiosConsultarTab').classList.toggle('active', view === 'consultar')
  if (view === 'consultar') loadBloqueios()
}

function renderBloqueioProfissionais() {
  const sel = document.getElementById('bProfissional')
  sel.innerHTML =
    profissionais
      .filter(p => p.ativo !== false)
      .map(p => `<option value="${p.id}">${p.nome}</option>`)
      .join('')
}

function renderBloqueioEscopos() {
  const nomeNegocio = negocio?.nome || 'negócio'
  document.getElementById('bEscopo').innerHTML = `
    <option value="negocio">Todo o ${nomeNegocio}</option>
    <option value="profissional">Apenas um profissional</option>
  `
}

function renderBloqueioFiltros() {
  const nomeNegocio = negocio?.nome || 'negócio'
  document.getElementById('bFiltro').innerHTML = `
    <option value="todos">Todos</option>
    <option value="negocio">Todo o ${nomeNegocio}</option>
    ${profissionais
      .filter(p => p.ativo !== false)
      .map(p => `<option value="${p.id}">${p.nome}</option>`)
      .join('')}
  `
}

function onBloqueioEscopoChange() {
  clearBloqueioFeedback()
  const escopo = document.getElementById('bEscopo').value
  document.getElementById('bProfissionalGroup').style.display = escopo === 'profissional' ? 'block' : 'none'
}

function onBloqueioTipoChange() {
  clearBloqueioFeedback()
  const tipo = document.getElementById('bTipo').value
  const horarioLabels = document.querySelectorAll('#bHorarioRow .form-label')
  const isHorarioEspecial = tipo === 'horario_especial'
  const isPeriodo = tipo === 'periodo'
  document.getElementById('bDataFimGroup').style.display = tipo === 'periodo' ? 'block' : 'none'
  document.getElementById('bAnoGroup').style.display = tipo === 'feriado' ? 'block' : 'none'
  document.getElementById('bDataInicio').style.display = tipo === 'feriado' ? 'none' : 'block'
  document.getElementById('bDataInicioLabel').style.display = tipo === 'feriado' ? 'none' : 'block'
  document.getElementById('bHorarioRow').style.display = (tipo === 'feriado' || isPeriodo) ? 'none' : 'flex'
  if (horarioLabels.length >= 2) {
    horarioLabels[0].textContent = isHorarioEspecial ? 'Abertura' : 'Inicio'
    horarioLabels[1].textContent = isHorarioEspecial ? 'Fechamento' : 'Fim'
  }
  document.getElementById('bEscopo').value = tipo === 'periodo' ? 'profissional' : 'negocio'
  onBloqueioEscopoChange()
  if (tipo === 'feriado') document.getElementById('bMotivo').value = 'Feriado nacional'
  if (isHorarioEspecial) document.getElementById('bMotivo').value = 'Horario especial'
}

async function fetchFeriadosBrasil(year) {
  const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`)
  if (!res.ok) throw new Error('Não foi possível buscar feriados')
  return res.json()
}

function getDateRange(startStr, endStr) {
  const dates = []
  const current = new Date(startStr + 'T12:00:00')
  const end = new Date(endStr + 'T12:00:00')
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }
  return dates
}

async function saveBloqueio() {
  clearBloqueioFeedback()
  const feedback = document.getElementById('bloqueioFeedback')

  const tipo = document.getElementById('bTipo').value
  const escopo = document.getElementById('bEscopo').value
  const profId = escopo === 'profissional' ? document.getElementById('bProfissional').value : null
  const motivoBase = document.getElementById('bMotivo').value.trim()

  if (escopo === 'profissional' && !profId) return showBloqueioError('Selecione um profissional.')

  let datas = []
  let horaInicio = document.getElementById('bHoraInicio').value || '00:00'
  let horaFim = document.getElementById('bHoraFim').value || '23:59'
  let motivo = motivoBase || (tipo === 'horario_especial' ? 'Horario especial' : 'Bloqueio de agenda')

  try {
    if (tipo === 'feriado') {
      const year = Number(document.getElementById('bAno').value) || new Date().getFullYear()
      const feriados = await fetchFeriadosBrasil(year)
      datas = feriados.map(f => ({ inicio: f.date, fim: f.date, motivo: f.name || 'Feriado nacional' }))
      horaInicio = '00:00'
      horaFim = '23:59'
    } else {
      const dataInicio = document.getElementById('bDataInicio').value
      const dataFim = tipo === 'periodo' ? document.getElementById('bDataFim').value : dataInicio
      if (!dataInicio || !dataFim) return showBloqueioError('Informe a data do bloqueio.')
      if (dataFim < dataInicio) return showBloqueioError('A data final não pode ser anterior à inicial.')
      if (tipo === 'periodo') {
        horaInicio = '00:00'
        horaFim = '23:59'
        datas = getDateRange(dataInicio, dataFim).map(data => ({ inicio: data, fim: data, motivo }))
      } else if (horaFim <= horaInicio) {
        return showBloqueioError('O horario final deve ser maior que o inicial.')
      } else {
        datas = [{ inicio: dataInicio, fim: dataFim, motivo }]
      }
    }

    const rows = datas.map(item => ({
      negocio_id: negocioId,
      profissional_id: profId,
      data: item.inicio,
      hora_inicio: horaInicio,
      hora_fim: horaFim,
      motivo: formatBloqueioMotivo(tipo, item.motivo || motivo),
    }))

    const existing = await findBloqueioConflicts(rows, profId)
    if (existing.length) return showBloqueioError('Já existe bloqueio neste período.')

    const { error } = await sb.from('bloqueios').insert(rows)
    if (error) return showBloqueioError(error.message)

    clearBloqueioFeedback()
    await loadBloqueios()
  } catch (err) {
    showBloqueioError(err.message || 'Erro ao criar bloqueio.')
  }
}

async function findBloqueioConflicts(rows, profId) {
  const dates = [...new Set(rows.map(r => r.data))]
  if (!dates.length) return []

  // Busca bloqueios do profissional E do negócio inteiro (profissional_id null)
  let query = sb
    .from('bloqueios')
    .select('id, data, hora_inicio, hora_fim, profissional_id')
    .eq('negocio_id', negocioId)
    .in('data', dates)

  // Se é bloqueio de profissional, verifica conflito com o profissional E com negócio todo
  // Se é bloqueio de negócio todo, verifica conflito com qualquer bloqueio existente
  if (profId) {
    query = query.or(`profissional_id.eq.${profId},profissional_id.is.null`)
  }
  // se profId é null (negócio todo), busca todos os bloqueios do negócio

  const { data, error } = await query
  if (error) throw error

  return (data || []).filter(existing =>
    rows.some(row =>
      row.data === existing.data &&
      row.hora_inicio < (existing.hora_fim || '23:59') &&
      row.hora_fim > (existing.hora_inicio || '00:00')
    )
  )
}

function showBloqueioError(message) {
  const feedback = document.getElementById('bloqueioFeedback')
  feedback.className = 'form-error'
  feedback.textContent = message
  feedback.style.display = 'block'
}

async function loadBloqueios() {
  const container = document.getElementById('bloqueiosContent')
  container.innerHTML = '<div class="loading-sm">Carregando...</div>'
  const today = new Date().toISOString().split('T')[0]
  const filtro = document.getElementById('bFiltro')?.value || 'todos'
  let query = sb
    .from('bloqueios')
    .select('id, data, hora_inicio, hora_fim, motivo, profissional_id, profissionais(nome)')
    .eq('negocio_id', negocioId)
    .gte('data', today)
    .order('data', { ascending: true })
    .order('hora_inicio', { ascending: true })
    .limit(80)

  if (filtro === 'negocio') query = query.is('profissional_id', null)
  if (filtro !== 'todos' && filtro !== 'negocio') query = query.or(`profissional_id.eq.${filtro},profissional_id.is.null`)

  const { data, error } = await query

  if (error) {
    container.innerHTML = '<div class="agenda-empty">Erro ao carregar bloqueios</div>'
    return
  }
  if (!data || !data.length) {
    container.innerHTML = '<div class="agenda-empty">Nenhum bloqueio futuro</div>'
    return
  }

  const grupos = groupBloqueios(data)
  container.innerHTML = '<div class="table-card">' + grupos.map(b => {
    const inicio = b.data_inicio
    const fim = b.data_fim
    const dataLabel = formatBloqueioPeriodo(inicio, fim)
    const tipo = getBloqueioTipoFromMotivo(b.motivo)
    const horarioLabel = tipo === 'horario_especial'
      ? `funciona ${b.hora_inicio?.slice(0,5) || '00:00'}-${b.hora_fim?.slice(0,5) || '23:59'}`
      : `${b.hora_inicio?.slice(0,5) || '00:00'}-${b.hora_fim?.slice(0,5) || '23:59'}`
    const escopoLabel = b.profissional_id ? (b.profissionais?.nome || 'Profissional') : `Todo o ${negocio?.nome || 'negócio'}`
    return `
      <div class="table-row">
        <div class="table-main">
          <div class="table-name">${cleanBloqueioMotivo(b.motivo) || tipoBloqueioLabel(tipo)} &bull; ${dataLabel}</div>
          <div class="table-sub">${escopoLabel} &bull; ${horarioLabel}</div>
        </div>
        <div class="table-actions">
          <button onclick="deleteBloqueioGrupo('${b.ids.join(',')}')">Remover</button>
        </div>
      </div>
    `
  }).join('') + '</div>'
}

function groupBloqueios(rows) {
  const grouped = new Map()
  for (const row of rows || []) {
    const key = [
      row.profissional_id || 'negocio',
      row.hora_inicio || '',
      row.hora_fim || '',
      row.motivo || '',
    ].join('|')
    if (!grouped.has(key)) {
      grouped.set(key, {
        ...row,
        ids: [],
        dates: [],
        data_inicio: row.data,
        data_fim: row.data,
      })
    }
    const group = grouped.get(key)
    group.ids.push(row.id)
    group.dates.push(row.data)
  }

  return [...grouped.values()].flatMap(group => {
    const dates = [...new Set(group.dates)].sort()
    const chunks = []
    let current = null
    for (const date of dates) {
      if (!current || !isNextDate(current.data_fim, date)) {
        current = { ...group, ids: [], data_inicio: date, data_fim: date }
        chunks.push(current)
      } else {
        current.data_fim = date
      }
      current.ids.push(...group.ids.filter((_, i) => group.dates[i] === date))
    }
    return chunks
  }).sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
}

function isNextDate(prev, next) {
  const dt = new Date(prev + 'T12:00:00')
  dt.setDate(dt.getDate() + 1)
  return dt.toISOString().split('T')[0] === next
}

function formatDateBr(dateStr) {
  if (!dateStr) return ''
  const [ano, mes, dia] = dateStr.split('-')
  return `${dia}/${mes}/${ano}`
}

function formatBloqueioPeriodo(inicio, fim) {
  if (!fim || fim === inicio) return formatDateBr(inicio)
  return `${formatDateBr(inicio)} até ${formatDateBr(fim)}`
}

function tipoBloqueioLabel(tipo) {
  const labels = {
    feriado: 'Feriado',
    dia_unico: 'Bloqueio',
    periodo: 'Periodo',
    horario_especial: 'Horario especial',
  }
  return labels[tipo] || 'Bloqueio'
}

function formatBloqueioMotivo(tipo, motivo) {
  if (tipo === 'periodo') return `[periodo] ${motivo}`
  if (tipo === 'horario_especial') return `[horario_especial] ${motivo}`
  return motivo
}

function getBloqueioTipoFromMotivo(motivo) {
  if (String(motivo || '').startsWith('[horario_especial]')) return 'horario_especial'
  if (String(motivo || '').startsWith('[periodo]')) return 'periodo'
  return 'dia_unico'
}

function cleanBloqueioMotivo(motivo) {
  return String(motivo || '').replace(/^\[(periodo|horario_especial)\]\s*/, '')
}

async function deleteBloqueio(id) {
  if (!confirm('Remover este bloqueio?')) return
  const { error } = await sb.from('bloqueios').delete().eq('id', id)
  if (error) return alert('Erro ao remover bloqueio: ' + error.message)
  clearBloqueioFeedback()
  await loadBloqueios()
}

async function deleteBloqueioGrupo(idsCsv) {
  const ids = idsCsv.split(',').filter(Boolean)
  if (!ids.length) return
  if (!confirm(ids.length > 1 ? 'Remover este período inteiro?' : 'Remover este bloqueio?')) return
  const { error } = await sb.from('bloqueios').delete().in('id', ids)
  if (error) return alert('Erro ao remover bloqueio: ' + error.message)
  clearBloqueioFeedback()
  await loadBloqueios()
}

// ============ CLIENTES ============
let allClientes = []

async function loadClientes() {
  const { data } = await sb
    .from('clientes')
    .select('*')
    .eq('negocio_id', negocioId)
    .order('nome')
  allClientes = data || []
  renderClientes(allClientes)
}

function searchClientes() {
  const q = document.getElementById('clienteSearch').value.toLowerCase()
  const qDigits = normalizePhone(q)
  const filtered = allClientes.filter(c =>
    c.nome.toLowerCase().includes(q) || normalizePhone(c.telefone).includes(qDigits)
  )
  renderClientes(filtered)
}

function renderClientes(list) {
  const container = document.getElementById('clientesContent')
  if (!list.length) {
    container.innerHTML = '<div class="agenda-empty">Nenhum cliente encontrado</div>'
    return
  }
  container.innerHTML = '<div class="table-card">' + list.map(c => `
    <div class="table-row">
      <div class="table-main">
        <div class="table-name">${c.nome}</div>
        <div class="table-sub">${formatPhone(c.telefone)} ${c.pin ? '&bull; PIN definido' : '&bull; Sem PIN'}</div>
      </div>
      <div class="table-actions">
        <button onclick="resetPin('${c.id}', '${c.nome}')">Novo PIN</button>
      </div>
      <div class="pin-result" id="pinResult_${c.id}" style="display:none"></div>
    </div>
  `).join('') + '</div>'
}

async function resetPin(id, nome) {
  if (!confirm('Gerar novo PIN para ' + nome + '? Informe o novo PIN ao cliente.')) return
  const novoPin = String(Math.floor(1000 + Math.random() * 9000))
  await sb.from('clientes').update({ pin: novoPin }).eq('id', id)
  alert('Novo PIN para ' + nome + ':\n\n' + novoPin + '\n\nInforme este PIN ao cliente.')
  loadClientes()
}

// ============ CONFIG ============
function loadConfig() {
  document.getElementById('cfgNome').value = negocio.nome || ''
  document.getElementById('cfgTel').value = formatPhone(negocio.telefone || '')
  document.getElementById('cfgEndereco').value = negocio.endereco || ''
  document.getElementById('cfgCidade').value = negocio.cidade || ''
  document.getElementById('cfgMaps').value = negocio.google_maps_url || ''
  document.getElementById('cfgEmailRemetente').value = negocio.email_remetente || ''
  document.getElementById('cfgEmailRemetenteNome').value = negocio.email_remetente_nome || ''
  document.getElementById('cfgEmailNotificacoes').value = String(negocio.email_notificacoes_ativas !== false)
  document.getElementById('cfgCorPrimaria').value = negocio.cor_primaria || '#3D2B1F'
  document.getElementById('cfgCorSecundaria').value = negocio.cor_secundaria || '#C4947A'
  document.getElementById('cfgCorFundo').value = negocio.cor_fundo || '#F9F5F0'
  document.getElementById('cfgJanela').value = negocio.janela_cancelamento_horas || 24
}

async function saveConfig() {
  const obj = {
    nome: document.getElementById('cfgNome').value,
    telefone: normalizePhone(document.getElementById('cfgTel').value) || null,
    endereco: document.getElementById('cfgEndereco').value,
    cidade: document.getElementById('cfgCidade').value,
    google_maps_url: document.getElementById('cfgMaps').value,
    email_remetente: document.getElementById('cfgEmailRemetente').value.trim() || null,
    email_remetente_nome: document.getElementById('cfgEmailRemetenteNome').value.trim() || null,
    email_notificacoes_ativas: document.getElementById('cfgEmailNotificacoes').value === 'true',
    cor_primaria: document.getElementById('cfgCorPrimaria').value,
    cor_secundaria: document.getElementById('cfgCorSecundaria').value,
    cor_fundo: document.getElementById('cfgCorFundo').value,
    janela_cancelamento_horas: parseInt(document.getElementById('cfgJanela').value),
  }

  const { error } = await sb.from('negocios').update(obj).eq('id', negocioId)
  const feedback = document.getElementById('cfgFeedback')
  if (error) {
    feedback.innerHTML = '<span style="color:#ff3b30">Erro ao salvar</span>'
  } else {
    feedback.innerHTML = '<span style="color:#34c759">Salvo com sucesso!</span>'
    negocio = { ...negocio, ...obj }
    document.getElementById('sidebarNegocio').textContent = obj.nome
  }
  setTimeout(() => feedback.innerHTML = '', 3000)
}

// ============ UTILS ============
function closeModal(id) {
  document.getElementById(id).style.display = 'none'
  editingId = null
}

// ============ INIT ============
checkAuth()

// ============ IMPERSONATION ============
function checkImpersonation() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('impersonating') === 'true') {
    const banner = document.getElementById('impersonationBanner')
    if (banner) {
      banner.style.display = 'flex'
      // Adicionar padding no body para o banner
      document.body.style.paddingTop = '44px'
      const contentEl = document.querySelector('.content')
      if (contentEl) contentEl.style.paddingTop = '70px'
      const sidebar = document.querySelector('.sidebar')
      if (sidebar) sidebar.style.paddingTop = '44px'
      // Preencher nome do negócio quando carregar
      const interval = setInterval(() => {
        if (negocio?.nome) {
          document.getElementById('impersonationNome').textContent = negocio.nome
          clearInterval(interval)
        }
      }, 500)
    }
  }
}

function sairImpersonation() {
  sb.auth.signOut().then(() => {
    window.location.href = 'https://agenda.mdinamic.com.br/superadmin'
  })
}

document.addEventListener('DOMContentLoaded', checkImpersonation)
