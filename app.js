// ============================================================
// AutoAgenda Web — Frontend (JS puro + Supabase)
// ============================================================

// ---- CONFIG ----
const SUPABASE_URL = 'https://vsyiwgxsbvjjloftpvkf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzeWl3Z3hzYnZqamxvZnRwdmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwOTA2NzgsImV4cCI6MjA5MDY2NjY3OH0.DJqO-Y248xCr5mrffKcG2ZQQ_dhRubjzaQmF4V6sO90'
const FUNCTIONS_URL = SUPABASE_URL + '/functions/v1'

function getSlug() {
  const querySlug = new URLSearchParams(window.location.search).get('slug')
  if (querySlug) return querySlug

  const pathSlug = window.location.pathname.split('/').filter(Boolean).pop()
  if (!pathSlug || pathSlug === 'index.html') return 'espaco-bella'

  return pathSlug
}

const slug = getSlug()

// ---- PIN AUTOMÁTICO ----
// Gerado a partir do telefone: remove não-dígitos, remove primeiro 9, pega 5 primeiros dígitos
// Ex: 98754-2120 → 87542120 → 87542
function gerarPin(telefone) {
  const digits = telefone.replace(/\D/g, '')
  const semNove = digits.replace(/^9/, '')
  return semNove.slice(0, 5)
}

// ---- STATE ----
let config = null
let state = {
  servico: null,
  profissional: null,
  data: null,
  hora: null,
  nome: '',
  tel: '',
  pin: '',
  mesAtual: new Date(),
  slotsData: null,
  clienteEncontrado: false,
  proximaData: null,
  hojeEncerrado: false,
}

// ---- API CALLS ----
async function fetchConfig() {
  const res = await fetch(`${FUNCTIONS_URL}/config?slug=${slug}`)
  if (!res.ok) throw new Error('Negócio não encontrado')
  return res.json()
}

async function fetchHorarios(profissionalId, data, duracaoMin) {
  const params = new URLSearchParams({
    negocio_id: config.negocio.id,
    profissional_id: profissionalId,
    data,
    duracao_min: String(duracaoMin),
  })
  const res = await fetch(`${FUNCTIONS_URL}/horarios?${params}`)
  return res.json()
}

async function criarAgendamento() {
  const res = await fetch(`${FUNCTIONS_URL}/agendar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      negocio_id: config.negocio.id,
      profissional_id: state.profissional,
      servico_id: state.servico,
      data: state.data,
      hora: state.hora,
      cliente_nome: state.nome,
      cliente_telefone: state.tel,
      // PIN não enviado — gerado no servidor a partir do telefone
    }),
  })
  return res.json()
}

async function buscarCliente(telefone) {
  const tel = telefone.replace(/\D/g, '')
  if (tel.length < 10) return null
  const params = new URLSearchParams({ negocio_id: config.negocio.id, telefone: tel })
  const res = await fetch(`${FUNCTIONS_URL}/cliente-lookup?${params}`)
  return res.json()
}

async function buscarMeusAgendamentos(telefone) {
  const tel = telefone.replace(/\D/g, '')
  const pin = gerarPin(tel)
  const params = new URLSearchParams({ negocio_id: config.negocio.id, telefone: tel, pin })
  const res = await fetch(`${FUNCTIONS_URL}/meus-agendamentos?${params}`)
  return res.json()
}

// ---- INIT ----
async function init() {
  showLoading(true)
  try {
    config = await fetchConfig()
    aplicarCores(config.negocio.cores)
    aplicarHeader(config.negocio)
    aplicarBizInfo(config.negocio)
    renderServicos()
    iniciarFluxoAdaptativo()
    showLoading(false)
  } catch (e) {
    document.getElementById('loadingScreen').innerHTML =
      '<div style="padding:40px;text-align:center;color:#8B3A3A">Negócio não encontrado.</div>'
    document.getElementById('appContent').style.display = 'none'
  }
}

function showLoading(show) {
  document.getElementById('loadingScreen').style.display = show ? 'block' : 'none'
  document.getElementById('appContent').style.display = show ? 'none' : 'block'
}

function aplicarCores(cores) {
  if (!cores) return
  document.documentElement.style.setProperty('--brown', cores.primaria)
  document.documentElement.style.setProperty('--rose', cores.secundaria)
  document.documentElement.style.setProperty('--cream', cores.fundo)
}

function aplicarHeader(negocio) {
  document.getElementById('headerLogo').textContent = negocio.nome
  document.title = negocio.nome + ' — Agendamento Online'
  if (negocio.logo_url) {
    const img = document.getElementById('headerLogoImg')
    img.src = negocio.logo_url
    img.style.display = 'block'
  }
}

function aplicarBizInfo(negocio) {
  const bar = document.getElementById('bizInfo')
  let show = false
  if (negocio.endereco) {
    document.getElementById('bizEnderecoText').textContent = negocio.endereco
    show = true
  } else {
    document.getElementById('bizEndereco').style.display = 'none'
  }
  if (negocio.telefone) {
    const tel = negocio.telefone
    const fmt = tel.length === 13
      ? `+${tel.slice(0,2)} (${tel.slice(2,4)}) ${tel.slice(4,9)}-${tel.slice(9)}`
      : tel
    document.getElementById('bizTelefoneText').textContent = fmt
  } else {
    document.getElementById('bizTelefone').style.display = 'none'
  }
  if (show || negocio.telefone) bar.style.display = 'block'
}

// ---- STEP 1: SERVICOS ----
function renderServicos() {
  const cont = document.getElementById('servicoList')
  cont.innerHTML = config.servicos.map(s => {
    const temPromo = s.promocao_ativa && s.preco_promocional
    const precoDisplay = temPromo
      ? `<span class="card-price-old">R$ ${Number(s.preco).toFixed(2).replace('.', ',')}</span>
         <span class="card-price">R$ ${Number(s.preco_promocional).toFixed(2).replace('.', ',')}</span>
         <span class="card-promo-badge">Promo</span>`
      : `<span class="card-price">R$ ${Number(s.preco).toFixed(2).replace('.', ',')}</span>`

    return `
      <div class="sel-card" id="serv_${s.id}" onclick="selectServico('${s.id}')">
        <div class="card-top">
          <div>
            <div class="card-name">${s.nome}</div>
            <div class="card-detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${s.duracao_min} min
            </div>
          </div>
        </div>
        <div class="card-price-wrap">${precoDisplay}</div>
        <div class="card-action" id="servAction_${s.id}" style="display:none">
          <button class="btn btn-card" onclick="event.stopPropagation(); goStep(2)">Escolher este &rarr;</button>
        </div>
      </div>
    `
  }).join('')
}

function getProfsDoServico(servicoId) {
  return config.profissionais.filter(p => p.servico_ids.includes(servicoId))
}

function iniciarFluxoAdaptativo() {
  if (config.servicos.length !== 1) {
    goStep(1)
    return
  }

  const servico = config.servicos[0]
  selectServico(servico.id)

  const profs = getProfsDoServico(servico.id)
  if (profs.length === 1) {
    selectProf(profs[0].id)
    goStep(3)
    return
  }

  goStep(2)
}

function selectServico(id) {
  state.servico = id
  state.profissional = null
  document.querySelectorAll('#servicoList .sel-card').forEach(c => {
    c.classList.remove('selected')
    const action = c.querySelector('.card-action')
    if (action) action.style.display = 'none'
  })
  const servEl = document.getElementById('serv_' + id)
  const actionEl = document.getElementById('servAction_' + id)
  if (servEl) servEl.classList.add('selected')
  if (actionEl) actionEl.style.display = 'block'
  document.getElementById('btnStep1').disabled = false
}

// ---- STEP 2: PROFISSIONAIS ----
function renderProfs() {
  const profsFiltrados = getProfsDoServico(state.servico)
  const cont = document.getElementById('profList')

  const html = profsFiltrados.map(p => {
    const avatarHtml = p.foto_url
      ? `<img class="prof-avatar-img" src="${p.foto_url}" alt="${p.nome}">`
      : `<div class="prof-avatar" style="background:${p.avatar_cor}">${p.avatar_emoji}</div>`
    return `
      <div class="prof-card" id="prof_${p.id}" onclick="selectProf('${p.id}')">
        ${avatarHtml}
        <div>
          <div class="prof-name">${p.nome}</div>
        </div>
      </div>
    `
  }).join('')

  cont.innerHTML = html

  if (profsFiltrados.length === 1) {
    selectProf(profsFiltrados[0].id)
  } else {
    document.getElementById('btnStep2').disabled = true
  }
}

function selectProf(id) {
  state.profissional = id
  document.querySelectorAll('#profList .prof-card').forEach(c => c.classList.remove('selected'))
  const profEl = document.getElementById('prof_' + id)
  if (profEl) profEl.classList.add('selected')
  document.getElementById('btnStep2').disabled = false
}

// ---- STEP 3: CALENDARIO + HORARIOS ----
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// Semana começa no domingo
const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const DIAS_MAP = { 0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab' }

function getProfDiasAtendimento() {
  const prof = config.profissionais.find(p => p.id === state.profissional)
  if (prof && prof.horarios) return Object.keys(prof.horarios)
  return config.negocio.dias_atendimento
}

function renderDateContext() {
  const serv = config.servicos.find(s => s.id === state.servico)
  const prof = config.profissionais.find(p => p.id === state.profissional)
  const context = document.getElementById('dateContext')

  if (!serv) {
    context.style.display = 'none'
    return
  }

  document.getElementById('dateStepTitle').textContent = 'Quando?'
  document.getElementById('dateStepHint').textContent = `Escolha um horário para ${serv.nome}`
  document.getElementById('dateContextServico').textContent = serv.nome
  document.getElementById('dateContextDuracao').textContent = `${serv.duracao_min} min`
  document.getElementById('dateContextProf').textContent = prof?.nome || ''
  document.getElementById('dateContextProf').style.display = prof ? 'inline' : 'none'
  context.style.display = 'block'
}

function renderCal() {
  const m = state.mesAtual
  const ano = m.getFullYear(), mes = m.getMonth()
  document.getElementById('calMonthLabel').textContent = MESES[mes] + ' ' + ano

  const grid = document.getElementById('calGrid')
  const agora = new Date()
  const hoje = new Date(); hoje.setHours(0,0,0,0)
  const primeiroDia = new Date(ano, mes, 1).getDay()

  const diasNoMes = new Date(ano, mes+1, 0).getDate()
  const diasAtendimento = getProfDiasAtendimento()

  let html = DIAS.map(d => `<div class="cal-day-label">${d}</div>`).join('')
  for (let i = 0; i < primeiroDia; i++) html += `<div class="cal-day empty"></div>`

  for (let d = 1; d <= diasNoMes; d++) {
    const data = new Date(ano, mes, d)
    const isPast = data < hoje
    const diaSemana = DIAS_MAP[data.getDay()]
    const isAtendimento = diasAtendimento.includes(diaSemana)
    const isToday = data.toDateString() === hoje.toDateString()
    const dateStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const isSelected = state.data === dateStr
    const isProximo = state.proximaData === dateStr

    const isTodayEncerrado = isToday && isAtendimento && state.hojeEncerrado

    let cls = 'cal-day'

    if (isPast || !isAtendimento || isTodayEncerrado) {
      cls += ' past'
    } else {
      cls += ' available has-slots'
    }

    if (isToday && !isPast) cls += ' today'
    if (isSelected) cls += ' selected'
    if (isProximo && !isSelected) cls += ' proximo'

    const clickable = !isPast && isAtendimento && !isTodayEncerrado
    const click = clickable ? `onclick="selectData('${dateStr}')"` : ''
    html += `<div class="${cls}" ${click}>${d}</div>`
  }
  grid.innerHTML = html
}

function hasAvailableSlots(slotsData) {
  const slots = [
    ...(slotsData?.manha || []),
    ...(slotsData?.tarde || []),
    ...(slotsData?.noite || []),
  ]
  return slots.some(slot => slot.disponivel)
}

async function findInitialAvailableDate() {
  const diasAtendimento = getProfDiasAtendimento()
  const serv = config.servicos.find(s => s.id === state.servico)
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  const todayStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`

  for (let i = 0; i < 45; i++) {
    const diaSemana = DIAS_MAP[date.getDay()]
    if (diasAtendimento.includes(diaSemana)) {
      const ano = date.getFullYear()
      const mes = String(date.getMonth() + 1).padStart(2, '0')
      const dia = String(date.getDate()).padStart(2, '0')
      const dateStr = `${ano}-${mes}-${dia}`
      const slotsData = await fetchHorarios(state.profissional, dateStr, serv.duracao_min)

      if (hasAvailableSlots(slotsData)) {
        // Se o primeiro dia com slots for amanhã ou depois, hoje está encerrado
        if (dateStr !== todayStr) state.hojeEncerrado = true
        return { dateStr, slotsData }
      } else if (dateStr === todayStr) {
        // Hoje é dia de atendimento mas sem slots → expediente encerrado
        state.hojeEncerrado = true
      }
    }
    date.setDate(date.getDate() + 1)
  }

  return null
}

async function selectData(dateStr, options = {}) {
  state.data = dateStr
  state.hora = null
  document.getElementById('btnStep3').disabled = true
  renderCal()

  const serv = config.servicos.find(s => s.id === state.servico)
  const slotsWrap = document.getElementById('slotsWrap')
  slotsWrap.style.display = 'block'
  slotsWrap.innerHTML = '<div class="loading"><div class="spinner"></div>Buscando horários...</div>'

  try {
    state.slotsData = options.slotsData || await fetchHorarios(state.profissional, dateStr, serv.duracao_min)
    renderSlots()
  } catch (e) {
    slotsWrap.innerHTML = '<div style="color:#8B3A3A;text-align:center;padding:20px">Erro ao buscar horários</div>'
  }
}

function renderSlots() {
  if (!state.slotsData) return
  const slotsWrap = document.getElementById('slotsWrap')
  const { manha, tarde, noite } = state.slotsData

  if ((!manha || !manha.length) && (!tarde || !tarde.length) && (!noite || !noite.length)) {
    slotsWrap.innerHTML = '<div style="text-align:center;color:#8A7060;padding:20px">Sem horários disponíveis nesta data</div>'
    return
  }

  let html = ''

  if (manha && manha.length > 0) {
    html += `<div class="slots-section"><div class="slots-label">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      Manhã</div><div class="slots-grid">`
    html += manha.map(s => renderSlotItem(s)).join('')
    html += '</div></div>'
  }

  if (tarde && tarde.length > 0) {
    html += `<div class="slots-section"><div class="slots-label">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>
      Tarde</div><div class="slots-grid">`
    html += tarde.map(s => renderSlotItem(s)).join('')
    html += '</div></div>'
  }

  if (noite && noite.length > 0) {
    html += `<div class="slots-section"><div class="slots-label">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      Noite</div><div class="slots-grid">`
    html += noite.map(s => renderSlotItem(s)).join('')
    html += '</div></div>'
  }

  slotsWrap.innerHTML = html
}

function renderSlotItem(s) {
  let cls = 'slot'
  if (!s.disponivel) cls += ' unavailable'
  else if (state.hora === s.hora) cls += ' selected'
  const click = s.disponivel ? `onclick="selectHora('${s.hora}')"` : ''
  return `<div class="${cls}" ${click}>${s.hora}</div>`
}

function selectHora(h) {
  state.hora = h
  renderSlots()
  document.getElementById('btnStep3').disabled = false
}

function changeMonth(d) {
  const m = state.mesAtual
  state.mesAtual = new Date(m.getFullYear(), m.getMonth() + d, 1)
  renderCal()
}

// ---- STEP 4: DADOS + CLIENTE LOOKUP ----
function maskTel(el) {
  let v = el.value.replace(/\D/g, '')
  if (v.length > 11) v = v.slice(0, 11)
  if (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`
  else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`
  else if (v.length > 0) v = `(${v}`
  el.value = v
}

let lookupTimer = null
async function onTelInput(el) {
  maskTel(el)

  const tel = el.value.replace(/\D/g, '')
  const feedbackEl = document.getElementById('clienteFeedback')
  const nomeGroup = document.getElementById('nomeGroup')

  if (tel.length < 10) {
    feedbackEl.textContent = ''
    feedbackEl.className = 'cliente-feedback'
    nomeGroup.style.display = 'none'
    state.clienteEncontrado = false
    state.nome = ''
    state.pin = ''
    checkStep4()
    return
  }

  // PIN gerado automaticamente
  state.pin = gerarPin(tel)
  state.tel = el.value

  clearTimeout(lookupTimer)
  lookupTimer = setTimeout(async () => {
    try {
      const result = await buscarCliente(el.value)
      if (result && result.cadastrado) {
        feedbackEl.textContent = `Bem-vindo(a) de volta!`
        feedbackEl.className = 'cliente-feedback found'
        nomeGroup.style.display = 'none'
        state.clienteEncontrado = true
        state.nome = result.nome || ''
      } else {
        feedbackEl.textContent = 'Primeira vez? Preencha seu nome abaixo.'
        feedbackEl.className = 'cliente-feedback'
        nomeGroup.style.display = 'block'
        state.clienteEncontrado = false
      }
    } catch (e) {
      nomeGroup.style.display = 'block'
    }
    checkStep4()
  }, 600)
}

function checkStep4() {
  const tel = document.getElementById('inputTel').value.replace(/\D/g, '')
  const telOk = tel.length >= 10
  const nomeInput = document.getElementById('inputNome').value.trim()
  const nomeOk = state.clienteEncontrado || nomeInput.length >= 2

  if (nomeInput) state.nome = nomeInput
  state.tel = document.getElementById('inputTel').value
  state.pin = gerarPin(tel)

  document.getElementById('btnStep4').disabled = !(telOk && nomeOk)
}

// ---- MEUS AGENDAMENTOS ----
async function showMeusAgendamentos() {
  const container = document.getElementById('meusAgendamentosContent')
  const telInput = document.getElementById('inputTelConsulta')
  const tel = telInput.value.replace(/\D/g, '')

  if (tel.length < 10) {
    container.innerHTML = '<div style="color:#8B3A3A;text-align:center;padding:12px">Digite um telefone válido</div>'
    return
  }

  container.innerHTML = '<div class="loading"><div class="spinner"></div>Buscando...</div>'

  try {
    const result = await buscarMeusAgendamentos(telInput.value)

    if (!result.agendamentos || result.agendamentos.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:#8A7060;padding:16px">Nenhum agendamento encontrado</div>'
      return
    }

    container.innerHTML = result.agendamentos.map(ag => {
      const [ano, mes, dia] = ag.data.split('-')
      return `
        <div class="resumo-card" style="margin-bottom:10px">
          <div class="resumo-row"><span class="resumo-label">Serviço</span><span class="resumo-value">${ag.servico}</span></div>
          <div class="resumo-row"><span class="resumo-label">Profissional</span><span class="resumo-value">${ag.profissional}</span></div>
          <div class="resumo-row"><span class="resumo-label">Data</span><span class="resumo-value">${dia}/${mes}/${ano}</span></div>
          <div class="resumo-row"><span class="resumo-label">Horário</span><span class="resumo-value">${ag.hora?.substring(0,5)}</span></div>
        </div>
      `
    }).join('')
  } catch (e) {
    container.innerHTML = '<div style="color:#8B3A3A;text-align:center;padding:12px">Erro ao buscar agendamentos</div>'
  }
}

// ---- STEP 5: RESUMO ----
function getPrecoServico(serv) {
  if (serv.promocao_ativa && serv.preco_promocional) return serv.preco_promocional
  return serv.preco
}

function buildResumoHTML() {
  const serv = config.servicos.find(s => s.id === state.servico)
  const prof = config.profissionais.find(p => p.id === state.profissional)
  const [ano, mes, dia] = state.data.split('-')
  const dataFmt = `${dia}/${mes}/${ano}`
  const preco = getPrecoServico(serv)
  const precoFmt = `R$ ${Number(preco).toFixed(2).replace('.', ',')}`

  let precoHtml = `<span class="resumo-value resumo-price">${precoFmt}</span>`
  if (serv.promocao_ativa && serv.preco_promocional) {
    const precoOriginal = `R$ ${Number(serv.preco).toFixed(2).replace('.', ',')}`
    precoHtml = `<span class="resumo-value resumo-price">${precoFmt} <span class="card-price-old">${precoOriginal}</span></span>`
  }

  return `
    <div class="resumo-row"><span class="resumo-label">Serviço</span><span class="resumo-value">${serv.nome}</span></div>
    <div class="resumo-row"><span class="resumo-label">Profissional</span><span class="resumo-value">${prof?.nome || ''}</span></div>
    <div class="resumo-row"><span class="resumo-label">Data</span><span class="resumo-value">${dataFmt}</span></div>
    <div class="resumo-row"><span class="resumo-label">Horário</span><span class="resumo-value">${state.hora}</span></div>
    <div class="resumo-row"><span class="resumo-label">Cliente</span><span class="resumo-value">${state.nome}</span></div>
    <div class="resumo-row"><span class="resumo-label">Valor</span>${precoHtml}</div>
  `
}

// ---- CONFIRMAR ----
async function confirmar() {
  const btn = document.querySelector('#step5 .btn-primary')
  const errDiv = document.getElementById('errConfirm')
  btn.disabled = true
  btn.textContent = 'Agendando...'
  errDiv.classList.remove('visible')

  try {
    const result = await criarAgendamento()
    if (result.error) {
      errDiv.textContent = result.error
      errDiv.classList.add('visible')
      btn.disabled = false
      btn.textContent = 'Agendar agora'
      return
    }
    document.getElementById('resumoFinal').innerHTML = buildResumoHTML()
    renderLocationCard()
    goStep(6)
  } catch (e) {
    errDiv.textContent = 'Erro de conexão. Tente novamente.'
    errDiv.classList.add('visible')
    btn.disabled = false
    btn.textContent = 'Agendar agora'
  }
}

// ---- LOCATION CARD ----
function renderLocationCard() {
  const container = document.getElementById('locationCard')
  const neg = config.negocio
  if (!neg.endereco) {
    container.innerHTML = ''
    return
  }

  const mapsUrl = neg.google_maps_url
    || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(neg.endereco + (neg.cidade ? ', ' + neg.cidade : ''))}`

  let html = `<div class="location-card"><div class="location-title">Localização</div>`
  html += `<div class="location-address">${neg.endereco}`
  if (neg.cidade) html += `<br>${neg.cidade}`
  html += `</div>`
  html += `<a class="location-link" href="${mapsUrl}" target="_blank" rel="noopener">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
    Abrir no Google Maps
  </a>`
  html += '</div>'
  container.innerHTML = html
}

// ---- NAVEGACAO ----
function goStep(n) {
  if (n === 1 && config?.servicos?.length === 1) {
    iniciarFluxoAdaptativo()
    return
  }

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  document.getElementById('step' + n).classList.add('active')
  updateProgress(n)
  if (n === 2) {
    const profs = getProfsDoServico(state.servico)
    if (profs.length === 1) {
      selectProf(profs[0].id)
      goStep(3)
      return
    }
    renderProfs()
  }
  if (n === 3) {
    renderDateContext()
    // Reset ao entrar: nenhum dia selecionado, horários ocultos
    state.data = null
    state.hora = null
    state.slotsData = null
    state.proximaData = null
    state.hojeEncerrado = false
    document.getElementById('slotsWrap').style.display = 'none'
    document.getElementById('btnStep3').disabled = true
    renderCal()
    // Busca próximo disponível, seleciona e já mostra horários
    showInitialDateLoading()
    findInitialAvailableDate()
      .then(result => {
        if (result) {
          state.proximaData = result.dateStr
          // Rola para o mês do próximo disponível se for diferente do atual
          const [pAno, pMes] = result.dateStr.split('-').map(Number)
          const mAtual = state.mesAtual
          if (pAno !== mAtual.getFullYear() || pMes !== mAtual.getMonth() + 1) {
            state.mesAtual = new Date(pAno, pMes - 1, 1)
          }
          // Seleciona automaticamente e mostra horários
          selectData(result.dateStr, { slotsData: result.slotsData })
        } else {
          document.getElementById('slotsWrap').style.display = 'none'
          showNoInitialAvailability()
        }
        renderCal()
      })
      .catch(() => {
        document.getElementById('slotsWrap').style.display = 'none'
        renderCal()
      })
  }
  if (n === 5) document.getElementById('resumoCard').innerHTML = buildResumoHTML()
  window.scrollTo(0, 0)
}

function updateProgress(step) {
  const bar = document.getElementById('progressBar')
  if (step === 6 || step === 'consulta') {
    bar.style.display = 'none'
    return
  }

  const visibleSteps = getVisibleProgressSteps()
  const visibleStep = visibleSteps.indexOf(step) + 1
  const totalSteps = visibleSteps.length

  bar.style.display = 'flex'
  for (let i = 1; i <= 5; i++) {
    const dot = document.getElementById('dot' + i)
    const line = i < 5 ? document.getElementById('line' + i) : null

    if (i > totalSteps) {
      dot.style.display = 'none'
      if (line) line.style.display = 'none'
      continue
    }

    dot.style.display = 'flex'
    dot.className = 'step-dot'
    if (i < visibleStep) { dot.classList.add('done'); dot.textContent = '\u2713' }
    else if (i === visibleStep) { dot.classList.add('active'); dot.textContent = i }
    else dot.textContent = i
    if (line) {
      line.style.display = i < totalSteps ? 'block' : 'none'
      line.className = 'step-line' + (i < visibleStep ? ' done' : '')
    }
  }
}

function getVisibleProgressSteps() {
  const steps = []
  if (config?.servicos?.length !== 1) steps.push(1)
  if (state.servico && getProfsDoServico(state.servico).length !== 1) steps.push(2)
  steps.push(3, 4, 5)
  return steps
}

function showInitialDateLoading() {
  // Mostra um spinner discreto abaixo do calendário sem abrir o painel de slots
  const slotsWrap = document.getElementById('slotsWrap')
  slotsWrap.style.display = 'block'
  slotsWrap.innerHTML = '<div class="loading" style="padding:12px 0"><div class="spinner"></div>Verificando disponibilidade...</div>'
}

function showNoInitialAvailability() {
  const slotsWrap = document.getElementById('slotsWrap')
  slotsWrap.style.display = 'block'
  slotsWrap.innerHTML = '<div style="text-align:center;color:#8A7060;padding:20px">Nenhum horário disponível nos próximos dias</div>'
}

function goConsulta() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  document.getElementById('stepConsulta').classList.add('active')
  updateProgress('consulta')
  window.scrollTo(0, 0)
}

function goBackFromDate() {
  if (config?.servicos?.length !== 1) {
    goStep(1)
    return
  }

  const profs = getProfsDoServico(state.servico)
  if (profs.length !== 1) {
    goStep(2)
    return
  }

  reiniciar()
}

function reiniciar() {
  state = { servico: null, profissional: null, data: null, hora: null, nome: '', tel: '', pin: '', mesAtual: new Date(), slotsData: null, clienteEncontrado: false, proximaData: null, hojeEncerrado: false }
  document.getElementById('inputNome').value = ''
  document.getElementById('inputTel').value = ''
  document.getElementById('clienteFeedback').textContent = ''
  document.getElementById('nomeGroup').style.display = 'none'
  document.getElementById('slotsWrap').style.display = 'none'
  renderServicos()
  goStep(1)
}

// ---- START ----
document.addEventListener('DOMContentLoaded', init)
