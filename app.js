const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSMZM5DrVaNAC-wQXkin1IBYqFowi8KiyPyZ7Goqpc922ePYhJCn0ElG9ZS9oaVhTtF7fkLc4j3xx4P/pub?gid=0&single=true&output=csv";

// Imagem da logo em Base64 (fallback se a URL falhar)
const PF_LOGO_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Pol%C3%ADcia_Federal_do_Brasil_%28logo%29.svg/200px-Pol%C3%ADcia_Federal_do_Brasil_%28logo%29.svg.png";

// ========================= ESTADO =========================
let currentAgent = null;
let protocolCount = 0;
let logoBase64 = null;

// ========================= INIT =========================
document.addEventListener('DOMContentLoaded', () => {
  const isPortal = document.querySelector('.portal-page');
  const isLogin  = document.querySelector('.login-page');

  if (isLogin) initLogin();
  if (isPortal) initPortal();
});

// ========================= PRE-LOAD LOGO =========================
async function preloadLogo() {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      try {
        logoBase64 = canvas.toDataURL('image/png');
      } catch(e) {
        logoBase64 = null;
      }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = PF_LOGO_URL;
  });
}

// ========================= LOGIN =========================
function initLogin() {
  preloadLogo();

  // Set today's date on datetime-local inputs if on portal
  const agent = sessionStorage.getItem('srpf_agent');
  if (agent) {
    window.location.href = 'portal.html';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const loginVal = document.getElementById('login').value.trim();
  const senhaVal = document.getElementById('senha').value.trim();
  const errDiv   = document.getElementById('login-error');
  const btnLogin = document.getElementById('btn-login');
  const btnText  = document.getElementById('btn-text');
  const btnLoading = document.getElementById('btn-loading');

  errDiv.style.display = 'none';
  btnLogin.disabled = true;
  btnText.style.display = 'none';
  btnLoading.style.display = 'inline';

  try {
    const agent = await authenticateWithSheets(loginVal, senhaVal);
    if (agent) {
      sessionStorage.setItem('srpf_agent', JSON.stringify(agent));
      window.location.href = 'portal.html';
    } else {
      showLoginError('Login ou senha inválidos. Verifique suas credenciais.');
    }
  } catch (err) {
    console.error(err);
    showLoginError('Erro ao conectar ao servidor de autenticação. Tente novamente.');
  }

  btnLogin.disabled = false;
  btnText.style.display = 'inline';
  btnLoading.style.display = 'none';
}

function showLoginError(msg) {
  const errDiv = document.getElementById('login-error');
  errDiv.textContent = msg;
  errDiv.style.display = 'block';
}

// ========================= GOOGLE SHEETS AUTH =========================
async function authenticateWithSheets(login, senha) {
  // Adiciona cache-busting para evitar dados antigos
  const url = SHEETS_CSV_URL + '&t=' + Date.now();

  const response = await fetch(url);
  if (!response.ok) throw new Error('Falha ao buscar planilha');

  const text = await response.text();
  const rows = parseCSV(text);

  // Primeira linha = cabeçalhos
  if (rows.length < 2) return null;
  const headers = rows[0].map(h => h.trim().toLowerCase());

  const iLogin   = headers.indexOf('login');
  const iSenha   = headers.indexOf('senha');
  const iNome    = headers.indexOf('nome_sobrenome');
  const iID      = headers.indexOf('id');
  const iBadge   = headers.indexOf('badge');
  const iPatente = headers.indexOf('patente');
  const iAtivo   = headers.indexOf('ativo');

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const rowLogin = (row[iLogin] || '').trim().toLowerCase();
    const rowSenha = (row[iSenha] || '').trim();
    const rowAtivo = iAtivo >= 0 ? (row[iAtivo] || '').trim().toLowerCase() : 'sim';

    if (rowLogin === login.toLowerCase() && rowSenha === senha) {
      if (rowAtivo === 'nao' || rowAtivo === 'não' || rowAtivo === 'false' || rowAtivo === '0') {
        return null; // Agente desativado
      }
      return {
        login: login,
        nome:    (row[iNome]    || 'Agente').trim(),
        id:      (row[iID]      || '---').trim(),
        badge:   (row[iBadge]   || '???').trim(),
        patente: (row[iPatente] || 'Agente Federal').trim(),
      };
    }
  }
  return null;
}

function parseCSV(text) {
  const rows = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        cols.push(current);
        current = '';
      } else {
        current += c;
      }
    }
    cols.push(current);
    rows.push(cols);
  }
  return rows;
}

// ========================= PORTAL INIT =========================
function initPortal() {
  const agentData = sessionStorage.getItem('srpf_agent');
  if (!agentData) {
    window.location.href = 'index.html';
    return;
  }

  currentAgent = JSON.parse(agentData);

  // Preenche sidebar
  document.getElementById('sb-name').textContent  = currentAgent.nome;
  document.getElementById('sb-rank').textContent  = currentAgent.patente;
  document.getElementById('sb-id').textContent    = 'ID: ' + currentAgent.id;
  document.getElementById('sb-badge').textContent = currentAgent.badge;

  // Data e hora
  updateClock();
  setInterval(updateClock, 60000);

  // Pré-carrega logo
  preloadLogo();

  // Contagem de protocolos na sessão
  protocolCount = parseInt(sessionStorage.getItem('srpf_count') || '0');
  document.getElementById('proto-count').textContent = protocolCount;

  // Items de apreensão
  addApreensaoItem();

  // Datas padrão
  const now = new Date();
  const dtLocal = toDatetimeLocal(now);
  const dtDate  = now.toISOString().split('T')[0];

  safeSet('bo-data',     dtLocal);
  safeSet('bo-numero',   gerarNumero('BO'));
  safeSet('rel-data',    dtDate);
  safeSet('rel-numero',  gerarNumero('REL'));
  safeSet('pri-data',    dtLocal);
  safeSet('apr-data',    dtLocal);
  safeSet('apr-numero',  gerarNumero('APR'));
  safeSet('lic-emissao', dtDate);
  safeSet('lic-numero',  gerarNumero('LIC'));
  safeSet('lic-validade', futureDate(1));
}

function safeSet(id, val) {
  const el = document.getElementById(id);
  if (el && !el.value) el.value = val;
}

function toDatetimeLocal(d) {
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function futureDate(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split('T')[0];
}

function gerarNumero(prefix) {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `${prefix}-${year}-${rand}`;
}

function updateClock() {
  const now = new Date();
  const el = document.getElementById('date-display');
  if (el) {
    el.innerHTML = now.toLocaleDateString('pt-BR', {weekday:'long', day:'2-digit', month:'long', year:'numeric'})
      + '<br>' + now.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
  }
}

function logout() {
  sessionStorage.removeItem('srpf_agent');
  window.location.href = 'index.html';
}

// ========================= FORM SWITCHING =========================
const formTitles = {
  bo:        'Boletim de Ocorrência',
  relatorio: 'Relatório Policial',
  prisao:    'Registro de Prisão',
  apreensao: 'Registro de Apreensão',
  porte:     'Porte de Arma',
  licenca:   'Licença de Empresa',
};

function showForm(name) {
  document.querySelectorAll('.form-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

  const panel = document.getElementById('form-' + name);
  if (panel) panel.classList.add('active');

  const titleEl = document.getElementById('form-title');
  if (titleEl) titleEl.textContent = formTitles[name] || name;

  // Marca nav item ativo
  document.querySelectorAll('.nav-item').forEach(el => {
    if (el.getAttribute('onclick') && el.getAttribute('onclick').includes("'" + name + "'")) {
      el.classList.add('active');
    }
  });
}

// ========================= APREENSÃO ITEMS =========================
let itemCounter = 0;

function addApreensaoItem() {
  itemCounter++;
  const list = document.getElementById('items-list');
  const div = document.createElement('div');
  div.className = 'apreensao-item';
  div.id = 'item-' + itemCounter;
  div.innerHTML = `
    <input type="text" placeholder="Item nº ${itemCounter}" class="apr-item-desc" style="flex:3" />
    <input type="text" placeholder="Qtd" class="apr-item-qtd" style="flex:0.7; min-width:60px" />
    <input type="text" placeholder="Observação" class="apr-item-obs" style="flex:2" />
    <button class="btn-remove-item" onclick="removeItem(${itemCounter})">✕</button>
  `;
  list.appendChild(div);
}

function removeItem(id) {
  const el = document.getElementById('item-' + id);
  if (el) el.remove();
}

// ========================= NOTIFICAÇÃO =========================
function showNotification(msg, type='success') {
  const old = document.querySelector('.notification');
  if (old) old.remove();

  const div = document.createElement('div');
  div.className = 'notification' + (type === 'error' ? ' error' : '');
  div.textContent = msg;
  document.body.appendChild(div);

  setTimeout(() => {
    div.style.transition = 'opacity 0.4s';
    div.style.opacity = '0';
    setTimeout(() => div.remove(), 400);
  }, 4000);
}

// ========================= PDF GENERATION =========================
const COLORS = {
  gold:     [201, 162, 39],
  darkBlue: [10, 22, 40],
  midBlue:  [18, 32, 64],
  text:     [20, 40, 70],
  muted:    [100, 130, 160],
  white:    [255, 255, 255],
  line:     [220, 210, 180],
  redBand:  [139, 26, 26],
};

function generatePDF() {
  const active = document.querySelector('.form-panel.active');
  if (!active) return;

  const id = active.id.replace('form-', '');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });

  switch (id) {
    case 'bo':        gerarBO(doc); break;
    case 'relatorio': gerarRelatorio(doc); break;
    case 'prisao':    gerarPrisao(doc); break;
    case 'apreensao': gerarApreensao(doc); break;
    case 'porte':     gerarPorte(doc); break;
    case 'licenca':   gerarLicenca(doc); break;
  }
}

// ---- CABEÇALHO PADRÃO ----
function drawHeader(doc, titulo, numero) {
  const W = 210;

  // Faixa superior dourada fina
  doc.setFillColor(...COLORS.gold);
  doc.rect(0, 0, W, 2, 'F');

  // Fundo cabeçalho
  doc.setFillColor(...COLORS.darkBlue);
  doc.rect(0, 2, W, 42, 'F');

  // Logo
  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', 12, 5, 28, 28); } catch(e) {}
  }

  // Textos do cabeçalho — alinhados ao lado da logo
  const xText = 46;
  doc.setTextColor(...COLORS.muted);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text('STATE OF SAN ANDREAS', xText, 11);
  doc.setFont('helvetica', 'normal');
  doc.text('MINISTRY OF JUSTICE AND PUBLIC SECURITY', xText, 15.5);

  doc.setTextColor(...COLORS.gold);
  doc.setFontSize(11.5);
  doc.setFont('helvetica', 'bold');
  doc.text('POLICE DEPARTMENT', xText, 21);

  doc.setTextColor(...COLORS.muted);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('REPORTING SYSTEM — RPS', xText, 26);

  // Linha dourada separadora
  doc.setDrawColor(...COLORS.gold);
  doc.setLineWidth(0.5);
  doc.line(12, 35, W - 12, 35);

  // Título do documento
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(titulo.toUpperCase(), W / 2, 41, { align: 'center' });

  // Faixa vermelha separadora
  doc.setFillColor(...COLORS.redBand);
  doc.rect(0, 44, W, 3.5, 'F');

  // Linha de protocolo
  doc.setFillColor(245, 242, 235);
  doc.rect(0, 47.5, W, 7, 'F');

  doc.setTextColor(...COLORS.text);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`PROTOCOLO: ${numero}`, 12, 52.5);

  const now = new Date();
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Emitido em: ${now.toLocaleString('pt-BR')}   |   Officer: ${currentAgent.nome} — Badge ${currentAgent.badge} — ${currentAgent.patente}`,
    W - 12, 52.5, { align: 'right' }
  );

  return 62; // Y inicial para conteúdo
}

// ---- SEÇÃO ----
function drawSectionTitle(doc, title, y) {
  const W = 210;
  doc.setFillColor(...COLORS.darkBlue);
  doc.rect(12, y, W - 24, 6, 'F');
  doc.setDrawColor(...COLORS.gold);
  doc.setLineWidth(0.4);
  doc.rect(12, y, W - 24, 6, 'S');

  doc.setTextColor(...COLORS.gold);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), 15, y + 4.2);
  return y + 9;
}

// ---- CAMPO SIMPLES ----
function drawField(doc, label, value, x, y, w, h = 8) {
  doc.setFillColor(245, 243, 238);
  doc.rect(x, y, w, h, 'F');
  doc.setDrawColor(200, 195, 180);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h, 'S');

  doc.setTextColor(...COLORS.muted);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.text(label.toUpperCase(), x + 2, y + 2.8);

  doc.setTextColor(...COLORS.text);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  const displayVal = value && value.trim() ? value : '—';
  doc.text(displayVal, x + 2, y + 6.2);

  return y + h;
}

// ---- CAMPO TEXTO LONGO ----
function drawTextArea(doc, label, value, x, y, w) {
  doc.setTextColor(...COLORS.muted);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text(label.toUpperCase(), x, y);

  const textY = y + 3;
  const text = value && value.trim() ? value : '—';
  doc.setTextColor(...COLORS.text);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(text, w - 4);
  const boxH = Math.max(lines.length * 4.5 + 6, 20);

  doc.setFillColor(250, 248, 243);
  doc.rect(x, textY, w, boxH, 'F');
  doc.setDrawColor(200, 195, 180);
  doc.setLineWidth(0.2);
  doc.rect(x, textY, w, boxH, 'S');

  doc.text(lines, x + 2, textY + 4.5);
  return textY + boxH + 4;
}

// ---- RODAPÉ ----
function drawFooter(doc) {
  const W = 210;
  const H = 297;

  doc.setFillColor(...COLORS.darkBlue);
  doc.rect(0, H - 18, W, 18, 'F');

  doc.setFillColor(...COLORS.gold);
  doc.rect(0, H - 18, W, 1, 'F');

  doc.setTextColor(...COLORS.muted);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Este documento é gerado exclusivamente para fins de Roleplay no servidor State Of San Andreas.', W / 2, H - 11, { align: 'center' });
  doc.text('Qualquer uso fora do contexto de State Of San Andreas é estritamente proibido. RPS v2.4', W / 2, H - 7, { align: 'center' });

  // Linha de assinatura
  const sigY = H - 28;
  doc.setDrawColor(...COLORS.muted);
  doc.setLineWidth(0.3);
  doc.line(W / 2 - 40, sigY, W / 2 + 40, sigY);
  doc.setTextColor(...COLORS.muted);
  doc.setFontSize(7);
  doc.text(currentAgent.nome, W / 2, sigY + 3.5, { align: 'center' });
  doc.text(`${currentAgent.patente} — Badge ${currentAgent.badge} — ID ${currentAgent.id}`, W / 2, sigY + 7, { align: 'center' });
}

// ========================= DOCUMENTOS =========================

// ---- BOLETIM DE OCORRÊNCIA ----
function gerarBO(doc) {
  const numero = val('bo-numero') || gerarNumero('BO');
  let y = drawHeader(doc, 'Boletim de Ocorrência', numero);
  const W = 210, m = 12, cw = W - m * 2;

  y = drawSectionTitle(doc, 'Identificação da Ocorrência', y);
  const half = (cw - 4) / 2;
  drawField(doc, 'Número do BO', val('bo-numero'), m, y, half);
  drawField(doc, 'Data e Hora', formatDatetime(val('bo-data')), m + half + 4, y, half);
  y += 12;
  drawField(doc, 'Local da Ocorrência', val('bo-local'), m, y, cw);
  y += 12;
  drawField(doc, 'Natureza do Delito', val('bo-natureza'), m, y, half);
  drawField(doc, 'Artigo Infringido', val('bo-artigo'), m + half + 4, y, half);
  y += 14;

  y = drawSectionTitle(doc, 'Envolvidos', y);
  drawField(doc, 'Nome do Envolvido', val('bo-envolvido'), m, y, half);
  drawField(doc, 'Papel', val('bo-papel'), m + half + 4, y, half);
  y += 12;
  drawField(doc, 'ID do Personagem', val('bo-id-perso'), m, y, half);
  drawField(doc, 'Documento', val('bo-doc'), m + half + 4, y, half);
  y += 14;

  y = drawSectionTitle(doc, 'Descrição dos Fatos', y);
  y = drawTextArea(doc, '', val('bo-descricao'), m, y, cw);

  y = drawSectionTitle(doc, 'Providências Tomadas', y);
  drawTextArea(doc, '', val('bo-providencias'), m, y, cw);

  drawFooter(doc);
  salvar(doc, 'BO');
}

// ---- RELATÓRIO POLICIAL ----
function gerarRelatorio(doc) {
  const numero = val('rel-numero') || gerarNumero('REL');
  let y = drawHeader(doc, 'Relatório Policial', numero);
  const W = 210, m = 12, cw = W - m * 2;

  y = drawSectionTitle(doc, 'Identificação', y);
  const half = (cw - 4) / 2;
  drawField(doc, 'Número do Relatório', val('rel-numero'), m, y, half);
  drawField(doc, 'Data', formatDate(val('rel-data')), m + half + 4, y, half);
  y += 12;
  drawField(doc, 'Assunto / Operação', val('rel-assunto'), m, y, cw);
  y += 12;
  drawField(doc, 'Classificação', val('rel-class'), m, y, half);
  drawField(doc, 'Unidade Responsável', val('rel-unidade'), m + half + 4, y, half);
  y += 14;

  y = drawSectionTitle(doc, 'I — Introdução', y);
  y = drawTextArea(doc, '', val('rel-intro'), m, y, cw);

  y = drawSectionTitle(doc, 'II — Desenvolvimento', y);
  y = drawTextArea(doc, '', val('rel-corpo'), m, y, cw);

  y = drawSectionTitle(doc, 'III — Conclusão', y);
  drawTextArea(doc, '', val('rel-conclusao'), m, y, cw);

  drawFooter(doc);
  salvar(doc, 'REL');
}

// ---- REGISTRO DE PRISÃO ----
function gerarPrisao(doc) {
  const numero = gerarNumero('RPR');
  let y = drawHeader(doc, 'Registro de Prisão', numero);
  const W = 210, m = 12, cw = W - m * 2;
  const half = (cw - 4) / 2;

  y = drawSectionTitle(doc, 'Dados do Preso', y);
  drawField(doc, 'Nome Completo', val('pri-nome'), m, y, cw);
  y += 12;
  drawField(doc, 'Data de Nascimento', formatDate(val('pri-nasc')), m, y, half);
  drawField(doc, 'ID FiveM', val('pri-id'), m + half + 4, y, half);
  y += 12;
  drawField(doc, 'Documento', val('pri-doc'), m, y, half);
  drawField(doc, 'Endereço', val('pri-end'), m + half + 4, y, half);
  y += 14;

  y = drawSectionTitle(doc, 'Dados da Prisão', y);
  drawField(doc, 'Data e Hora da Prisão', formatDatetime(val('pri-data')), m, y, half);
  drawField(doc, 'Local da Prisão', val('pri-local'), m + half + 4, y, half);
  y += 12;
  drawField(doc, 'Tipo de Prisão', val('pri-tipo'), m, y, half);
  drawField(doc, 'Artigo(s) Infringido(s)', val('pri-artigo'), m + half + 4, y, half);
  y += 12;
  drawField(doc, 'Pena Aplicada', val('pri-pena'), m, y, half);
  drawField(doc, 'Fiança', val('pri-fianca'), m + half + 4, y, half);
  y += 14;

  y = drawSectionTitle(doc, 'Circunstâncias da Prisão', y);
  y = drawTextArea(doc, '', val('pri-circunstancias'), m, y, cw);

  y = drawSectionTitle(doc, 'Equipe Responsável', y);
  drawField(doc, 'Officers Presentes', val('pri-agentes'), m, y, cw);
  y += 12;
  drawField(doc, 'Agente Responsável pelo Registro', currentAgent.nome, m, y, half);
  drawField(doc, 'Badge / Patente', `${currentAgent.badge} — ${currentAgent.patente}`, m + half + 4, y, half);

  drawFooter(doc);
  salvar(doc, 'PRISAO');
}

// ---- APREENSÃO ----
function gerarApreensao(doc) {
  const numero = val('apr-numero') || gerarNumero('APR');
  let y = drawHeader(doc, 'Auto de Apreensão', numero);
  const W = 210, m = 12, cw = W - m * 2;
  const half = (cw - 4) / 2;

  y = drawSectionTitle(doc, 'Dados da Apreensão', y);
  drawField(doc, 'Número do Auto', val('apr-numero'), m, y, half);
  drawField(doc, 'Data e Hora', formatDatetime(val('apr-data')), m + half + 4, y, half);
  y += 12;
  drawField(doc, 'Local da Apreensão', val('apr-local'), m, y, cw);
  y += 12;
  drawField(doc, 'Proprietário / Envolvido', val('apr-prop'), m, y, cw);
  y += 14;

  // Itens
  y = drawSectionTitle(doc, 'Relação de Itens Apreendidos', y);
  const items = document.querySelectorAll('.apreensao-item');

  // Cabeçalho da tabela
  doc.setFillColor(...COLORS.midBlue);
  doc.rect(m, y, cw, 6, 'F');
  doc.setTextColor(...COLORS.gold);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('Nº', m + 2, y + 4);
  doc.text('DESCRIÇÃO', m + 12, y + 4);
  doc.text('QTD', m + 110, y + 4);
  doc.text('OBSERVAÇÃO', m + 130, y + 4);
  y += 6;

  let i = 0;
  items.forEach(item => {
    i++;
    const desc = item.querySelector('.apr-item-desc')?.value || '';
    const qtd  = item.querySelector('.apr-item-qtd')?.value  || '';
    const obs  = item.querySelector('.apr-item-obs')?.value  || '';
    if (!desc && !qtd) return;

    doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 245 : 252, i % 2 === 0 ? 238 : 248);
    doc.rect(m, y, cw, 7, 'F');
    doc.setDrawColor(200, 195, 180);
    doc.setLineWidth(0.1);
    doc.rect(m, y, cw, 7, 'S');

    doc.setTextColor(...COLORS.text);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(String(i), m + 2, y + 4.8);
    doc.text(desc.substring(0, 45), m + 12, y + 4.8);
    doc.text(qtd, m + 110, y + 4.8);
    doc.text(obs.substring(0, 30), m + 130, y + 4.8);
    y += 7;
  });

  y += 6;
  y = drawSectionTitle(doc, 'Observações Gerais', y);
  drawTextArea(doc, '', val('apr-obs'), m, y, cw);

  drawFooter(doc);
  salvar(doc, 'APREENSAO');
}

// ---- PORTE DE ARMA ----
function gerarPorte(doc) {
  const numero = gerarNumero('PRT');
  let y = drawHeader(doc, 'Porte de Arma de Fogo — Documento Fictício', numero);
  const W = 210, m = 12, cw = W - m * 2;
  const half = (cw - 4) / 2;
  const third = (cw - 8) / 3;

  // Banner de aviso
  doc.setFillColor(201, 162, 39, 30);
  doc.setDrawColor(...COLORS.gold);
  doc.setLineWidth(0.4);
  doc.rect(m, y, cw, 8, 'FD');
  doc.setTextColor(...COLORS.gold);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('⚠ DOCUMENTO FICTÍCIO — EMITIDO EXCLUSIVAMENTE PARA FINS DE ROLEPLAY NO SERVIDOR STATE OF SAN ANDREAS', W/2, y + 5, { align: 'center' });
  y += 12;

  y = drawSectionTitle(doc, 'Dados do Portador', y);
  drawField(doc, 'Nome Completo', val('prt-nome'), m, y, cw);
  y += 12;
  drawField(doc, 'Documento', val('prt-doc'), m, y, half);
  drawField(doc, 'ID FiveM', val('prt-id'), m + half + 4, y, half);
  y += 12;
  drawField(doc, 'Profissão / Cargo', val('prt-cargo'), m, y, half);
  drawField(doc, 'Endereço', val('prt-end'), m + half + 4, y, half);
  y += 14;

  y = drawSectionTitle(doc, 'Dados da Arma Autorizada', y);
  drawField(doc, 'Tipo de Arma', val('prt-tipo'), m, y, third);
  drawField(doc, 'Marca / Modelo', val('prt-marca'), m + third + 4, y, third);
  drawField(doc, 'Calibre', val('prt-calibre'), m + 2*(third + 4), y, third);
  y += 12;
  drawField(doc, 'Número de Série', val('prt-serie'), m, y, half);
  drawField(doc, 'Validade do Porte', formatDate(val('prt-validade')), m + half + 4, y, half);
  y += 12;
  drawField(doc, 'Restrições', val('prt-restricoes'), m, y, cw);
  y += 14;

  y = drawSectionTitle(doc, 'Justificativa / Observações', y);
  drawTextArea(doc, '', val('prt-obs'), m, y, cw);

  drawFooter(doc);
  salvar(doc, 'PORTE');
}

// ---- LICENÇA DE EMPRESA ----
function gerarLicenca(doc) {
  const numero = val('lic-numero') || gerarNumero('LIC');
  let y = drawHeader(doc, 'Licença de Empresa — Documento Fictício', numero);
  const W = 210, m = 12, cw = W - m * 2;
  const half = (cw - 4) / 2;

  // Banner
  doc.setFillColor(201, 162, 39, 30);
  doc.setDrawColor(...COLORS.gold);
  doc.setLineWidth(0.4);
  doc.rect(m, y, cw, 8, 'FD');
  doc.setTextColor(...COLORS.gold);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('⚠ DOCUMENTO FICTÍCIO — EMITIDO EXCLUSIVAMENTE PARA FINS DE ROLEPLAY NO SERVIDOR FIVEM', W/2, y + 5, { align: 'center' });
  y += 12;

  y = drawSectionTitle(doc, 'Dados da Empresa', y);
  drawField(doc, 'Razão Social', val('lic-razao'), m, y, cw);
  y += 12;
  drawField(doc, 'CNPJ', val('lic-cnpj'), m, y, half);
  drawField(doc, 'Ramo de Atividade', val('lic-ramo'), m + half + 4, y, half);
  y += 12;
  drawField(doc, 'Responsável Legal', val('lic-resp'), m, y, half);
  drawField(doc, 'Endereço do Estabelecimento', val('lic-end'), m + half + 4, y, half);
  y += 14;

  y = drawSectionTitle(doc, 'Dados da Licença', y);
  drawField(doc, 'Número da Licença', val('lic-numero'), m, y, half);
  drawField(doc, 'Tipo de Licença', val('lic-tipo'), m + half + 4, y, half);
  y += 12;
  drawField(doc, 'Data de Emissão', formatDate(val('lic-emissao')), m, y, half);
  drawField(doc, 'Validade', formatDate(val('lic-validade')), m + half + 4, y, half);
  y += 14;

  y = drawSectionTitle(doc, 'Condições e Restrições de Funcionamento', y);
  drawTextArea(doc, '', val('lic-cond'), m, y, cw);

  drawFooter(doc);
  salvar(doc, 'LICENCA');
}

// ========================= UTILITÁRIOS =========================
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function formatDate(str) {
  if (!str) return '—';
  try {
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
  } catch { return str; }
}

function formatDatetime(str) {
  if (!str) return '—';
  try {
    const [date, time] = str.split('T');
    return formatDate(date) + ' ' + (time || '').substring(0,5);
  } catch { return str; }
}

function salvar(doc, tipo) {
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
  doc.save(`SRPF_${tipo}_${ts}.pdf`);

  protocolCount++;
  sessionStorage.setItem('srpf_count', protocolCount);
  const pcEl = document.getElementById('proto-count');
  if (pcEl) pcEl.textContent = protocolCount;

  showNotification(`✔ ${tipo} gerado com sucesso!`);
}
