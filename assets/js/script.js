// script.js — SPT Mod Sync v0.1
// i18n via Data/Lang/ (externo), publish/update via pywebview API, auto-update app.

const SMS = {
  config: {
    serverIp: '127.0.0.1:8080',
    sptPath: 'J:\\Jogos\\SPT-4.0.13',
    installedVersion: '0.0.0',
    language: 'pt-pt',
    serverOn: false,
    checkAppUpdateOnStart: false,
    appVersion: '—',
  },
  lang: {},
  selected: new Set(),
  _updateUrl: null,
};

const api = () => (window.pywebview && window.pywebview.api) ? window.pywebview.api : null;

// Fallback embutido (PT-PT) — garante que a app NUNCA fica em inglês se faltar o ficheiro de idioma.
const FALLBACK_LANG = {
  "app_name": "ModSync",
  "app_title": "SPT Mod Sync v0.5 - Beta",
  "peers": "peers · LAN/VPN",
  "publish": "Publicar",
  "update": "Actualizar",
  "deploy": "Publicar",
  "refresh": "Actualizar",
  "directories": "Árvore de ficheiros (SPT)",
  "version": "Versão",
  "changelog": "Changelog",
  "patch_name": "Patch",
  "size": "Tamanho",
  "speed": "Velocidade",
  "check_download": "Verificar / Descarregar",
  "check": "Verificar",
  "settings": "Opções",
  "settings_title": "Definições",
  "server": "Servidor",
  "server_on": "Servidor ligado",
  "server_off": "Servidor desligado",
  "autostart": "Ligar servidor ao iniciar",
  "autostart_hint": "Se ligado, o servidor arranca automaticamente quando abres a app.",
  "on": "Ligado",
  "off": "Desligado",
  "server_ip": "IP do servidor",
  "server_ip_ph": "ex. 26.10.20.5:8080",
  "spt_path": "Caminho do SPT",
  "spt_path_ph": "ex. J:\\Jogos\\SPT-4.0.13",
  "installed_version": "Versão instalada",
  "launcher_lbl": "Launcher:",
  "language": "Idioma",
  "save": "Guardar",
  "cancel": "Cancelar",
  "about": "Sobre",
  "verify": "Verificar",
  "check_app_update_on_start": "Verificar atualizações ao iniciar",
  "browse": "Procurar",
  "app_updates": "Atualizações da app",
  "available_version": "Versão disponível",
  "current_version": "Versão actual",
  "check_app_update": "Verificar atualizações",
  "checking": "A verificar...",
  "new_version": "disponível!",
  "up_to_date": "Estás em dia",
  "download": "Descarregar",
  "app_update_title": "Atualização concluída",
  "app_update_installed": "Update instalado! Liga a app manualmente para aplicar.",
  "app_update_launch_manually": "Ligar manualmente",
  "app_update_available_title": "Actualização disponível",
  "app_update_available_msg": "Está disponível uma nova versão:",
  "update_now": "Atualizar agora",
  "later": "Agora não",
  "app_update_downloading": "A descarregar actualização...",
  "app_update_extracting": "A extrair...",
  "app_update_error": "Erro na atualização",
  "select_files_first": "Seleciona pelo menos um ficheiro.",
  "missing_version": "Falta a versão.",
  "done": "Concluído",
  "error": "Erro",
  "nav_server": "SERVIDOR",
  "nav_update": "UPDATE",
  "nav_publish": "PUBLICAR",
  "nav_options": "OPÇÕES",
  "nav_tips": "DICAS",
  "nav_about": "SOBRE",
  "tree_empty": "A árvore aparece quando o servidor está ligado.",
  "publish_hint": "Marca apenas os ficheiros ou pastas que queres incluir. Podes selecionar um mod específico sem enviar tudo.",
  "version_ph": "ex. 1.0.6",
  "changelog_ph": "[+] Adicionado X\n[-] Removido Y",
  "server_card_name": "Servidor de patches",
  "server_card_hint": "Liga/desliga o servidor de patches na porta 8080. O teu colega só recebe updates com isto ligado.",
  "about_desc": "Partilha de mods SPT entre peers, sem browser. Publica patches, recebe updates do teu colega (ou de ti próprio) e mantém tudo sincronizado via LAN ou VPN (Radmin).",
  "about_footer": "Feito para a comunidade SPT modding",
  "spt_detect_unknown": "caminho sem versão detetável",
  "spt_detect_error": "erro",
  "selected_one": "1 selecionado",
  "selected_many": "{n} selecionados",
  "server_first": "Liga o servidor primeiro (botão acima).",
  "tips_title": "Dicas",
  "tips": [
    "Servidor ligado — O botão Publicar e o Actualizar só ficam ativos quando o servidor está ON (rótulo verde no topo). Liga-o no separador SERVIDOR.",
    "Publicar — Assinala apenas os ficheiros ou pastas que queres enviar (por ex.: user/mods ou BepInEx/plugins). Não precisas de enviar o SPT todo.",
    "Actualizar — Recebe os patches publicados. Faz o download, remove os ficheiros obsoletos e extrai automaticamente para a pasta do SPT.",
    "Changelog — Regista o que mudou em cada versão. Ajuda o teu colega a saber o que actualizaste.",
    "IP do servidor — Em LAN usa 127.0.0.1:8080 (ou o IP da máquina). Para jogar à distância, partilha através de VPN (Radmin) e usa o IP dessa VPN.",
    "Aponta para a pasta raiz do teu SPT. A árvore de ficheiros lê a partir daí.",
    "Atualização automática da app — Nas Opções podes verificar e instalar novas versões da SPT Mod Sync automaticamente."
  ],
  "server_log": "Terminal do servidor",
  "make_patch": "Fazer Patch",
  "patch_info": "Informação do patch",
  "patch_file": "Ficheiro",
  "patch_size": "Tamanho",
  "patch_items": "Itens",
  "patch_modified": "Data/Hora",
  "selected_mods": "Mods selecionados",
  "no_mods_selected": "Nenhum mod selecionado."
};

// Fallback embutido (EN) — garante que a troca para EN funciona mesmo se o ficheiro externo falhar.
const FALLBACK_EN = {
  "app_name": "ModSync",
  "app_title": "SPT Mod Sync v0.5 - Beta",
  "peers": "peers · LAN/VPN",
  "publish": "Publish",
  "update": "Update",
  "deploy": "Publish",
  "refresh": "Refresh",
  "directories": "File tree (SPT)",
  "version": "Version",
  "changelog": "Changelog",
  "patch_name": "Patch",
  "size": "Size",
  "speed": "Speed",
  "check_download": "Check / Download",
  "check": "Check",
  "settings": "Options",
  "settings_title": "Settings",
  "server": "Server",
  "server_on": "Server on",
  "server_off": "Server off",
  "autostart": "Start server on launch",
  "autostart_hint": "When on, the server starts automatically when you open the app.",
  "on": "On",
  "off": "Off",
  "server_ip": "Server IP",
  "server_ip_ph": "e.g. 26.10.20.5:8080",
  "spt_path": "SPT path",
  "spt_path_ph": "e.g. J:\\Jogos\\SPT-4.0.13",
  "installed_version": "Installed version",
  "launcher_lbl": "Launcher:",
  "language": "Language",
  "save": "Save",
  "cancel": "Cancel",
  "about": "About",
  "verify": "Check",
  "check_app_update_on_start": "Check for updates on launch",
  "browse": "Browse",
  "app_updates": "App updates",
  "available_version": "Available version",
  "current_version": "Current version",
  "check_app_update": "Check for updates",
  "checking": "Checking...",
  "new_version": "available!",
  "up_to_date": "Up to date",
  "download": "Download",
  "app_update_title": "Update complete",
  "app_update_installed": "Update installed! Launch the app manually to apply.",
  "app_update_launch_manually": "Launch manually",
  "app_update_available_title": "Update available",
  "app_update_available_msg": "A new version is available:",
  "update_now": "Update now",
  "later": "Not now",
  "app_update_downloading": "Downloading update...",
  "app_update_extracting": "Extracting...",
  "app_update_error": "Update error",
  "select_files_first": "Select at least one file.",
  "missing_version": "Version is missing.",
  "done": "Done",
  "error": "Error",
  "nav_server": "SERVER",
  "nav_update": "UPDATE",
  "nav_publish": "PUBLISH",
  "nav_options": "OPTIONS",
  "nav_tips": "TIPS",
  "nav_about": "ABOUT",
  "tree_empty": "The file tree appears when the server is on.",
  "publish_hint": "Only mark the files or folders you want to include. You can pick a specific mod without sending everything.",
  "version_ph": "e.g. 1.0.6",
  "changelog_ph": "[+] Added X\n[-] Removed Y",
  "server_card_name": "Patch server",
  "server_card_hint": "Turns the patch server on/off on port 8080. Your buddy only gets updates when this is on.",
  "about_desc": "SPT mod sharing between peers, no browser. Publish patches, receive updates from your buddy (or yourself) and keep everything synced over LAN or VPN (Radmin).",
  "about_footer": "Made for the SPT modding community",
  "spt_detect_unknown": "path with no detectable version",
  "spt_detect_error": "error",
  "selected_one": "1 selected",
  "selected_many": "{n} selected",
  "server_first": "Turn the server on first (button above).",
  "tips_title": "Tips & Tricks",
  "tips": [
    "Server on — The Publish and Update buttons only become active when the server is ON (green label at the top). Turn it on in the SERVER tab.",
    "Publish — Tick only the files or folders you want to send (e.g. user/mods or BepInEx/plugins). You don't need to send the whole SPT.",
    "Update — Receives the published patches. Downloads, removes obsolete files and extracts automatically into the SPT folder.",
    "Changelog — Note what changed in each version. Helps your buddy know what you updated.",
    "Server IP — On LAN use 127.0.0.1:8080 (or the machine's IP). To play remotely, share over a VPN (Radmin) and use that VPN's IP.",
    "Point it to your SPT root folder. The file tree reads from there.",
    "App auto-update — In Options you can check for and install new SPT Mod Sync versions automatically."
  ],
  "server_log": "Server terminal",
  "make_patch": "Make Patch",
  "patch_info": "Patch info",
  "patch_file": "File",
  "patch_size": "Size",
  "patch_items": "Items",
  "patch_modified": "Date/Time",
  "selected_mods": "Selected mods",
  "no_mods_selected": "No mods selected."
};

// ---------- i18n ----------
async function _fetchLang(code) {
  const res = await fetch(`/Data/Lang/${code}.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function loadLang(code) {
  try {
    SMS.lang = await _fetchLang(code);
  } catch (e) {
    console.warn('lang load fail (', code, '):', e);
    // Fallback: embutido do próprio idioma pedido (nunca cai em inglês).
    SMS.lang = (code === 'en') ? FALLBACK_EN : FALLBACK_LANG;
  }
  applyLang();
}
function t(key) {
  const code = (SMS.config && SMS.config.language) || 'pt-pt';
  return SMS.lang[key] || (code === 'en' ? FALLBACK_EN[key] : FALLBACK_LANG[key]) || key;
}

function applyLang() {
  const L = SMS.lang;
  // Textos estáticos marcados com data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.getAttribute('data-i18n');
    if (L[k] != null) el.textContent = L[k];
  });
  // Placeholders (data-i18n-ph)
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const k = el.getAttribute('data-i18n-ph');
    if (L[k] != null) el.setAttribute('placeholder', L[k]);
  });
  // Tooltips (data-i18n-title)
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const k = el.getAttribute('data-i18n-title');
    if (L[k] != null) el.setAttribute('title', L[k]);
  });
  renderTips();
}

// ---------- Tips (traduzíveis, re-renderiza ao mudar idioma) ----------
function renderTips() {
  const ul = document.getElementById('tips-list');
  if (!ul) return;
  const tips = Array.isArray(SMS.lang.tips) ? SMS.lang.tips : [];
  ul.innerHTML = '';
  for (const tip of tips) {
    const li = document.createElement('li');
    li.textContent = tip;
    ul.appendChild(li);
  }
}

// ---------- Sidebar ----------
function showView(name) {
  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.getElementById('view-publish').style.display = name === 'publish' ? 'flex' : 'none';
  document.getElementById('view-update').style.display = name === 'update' ? 'flex' : 'none';
  document.getElementById('view-server').style.display = name === 'server' ? 'flex' : 'none';
  if (name === 'server') updateServerStatus();
}

// ---------- Modais (Sobre / Tips) ----------
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('open'); el.removeAttribute('aria-hidden'); }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
}

// ---------- Modal "Atualização da app concluída" (pedir para ligar manualmente) ----------
function openAppUpdateDoneModal(msg) {
  const m = document.getElementById('app-update-msg');
  if (m) m.textContent = msg || t('app_update_installed');
  openModal('modal-app-update');
}

// ---------- File tree ----------
async function loadTree(container, path) {
  if (!api()) { container.innerHTML = '<div class="muted" style="padding:8px;">API indisponível</div>'; return; }
  const res = await api().list_dir(path);
  if (!res.ok) { container.innerHTML = `<div class="danger" style="padding:8px;">${res.error}</div>`; return; }
  container.innerHTML = '';
  for (const item of res.items) {
    const node = document.createElement('div');
    node.className = 'tree-node';
    const row = document.createElement('div');
    row.className = 'tree-row';

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'tree-check';
    check.dataset.rel = item.rel_path;
    check.dataset.isDir = item.is_dir ? '1' : '0';
    if (SMS.selected.has(item.rel_path)) { check.checked = true; row.classList.add('checked'); }

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = item.is_dir ? '📁' : '📄';

    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = item.name;

    row.appendChild(check); row.appendChild(icon); row.appendChild(name);
    check.addEventListener('change', async () => {
      if (check.checked) {
        SMS.selected.add(item.rel_path);
        if (item.is_dir) {
          // seleciona recursivamente todos os descendentes
          try {
            const d = await api().list_descendants(item.rel_path);
            if (d && d.ok) {
              for (const rel of d.items) SMS.selected.add(rel);
              syncTreeCheckboxes(item.rel_path, true);
            }
          } catch (e) {}
        }
      } else {
        // desmarca a pasta e todos os seus descendentes
        const toRemove = [item.rel_path];
        if (item.is_dir) {
          const prefix = item.rel_path + '/';
          for (const rel of SMS.selected) {
            if (rel.startsWith(prefix)) toRemove.push(rel);
          }
        }
        for (const rel of toRemove) SMS.selected.delete(rel);
        if (item.is_dir) syncTreeCheckboxes(item.rel_path, false);
      }
      row.classList.toggle('checked', check.checked);
      updateCount();
    });

    if (item.is_dir) {
      const toggle = document.createElement('span');
      toggle.className = 'tree-toggle';
      toggle.textContent = '▶';
      row.insertBefore(toggle, check);
      row.addEventListener('click', async (e) => {
        if (e.target === check) return;
        const children = node.querySelector('.tree-children');
        if (children) { children.remove(); toggle.textContent = '▶'; return; }
        toggle.textContent = '▼';
        const childBox = document.createElement('div');
        childBox.className = 'tree-children';
        childBox.innerHTML = '<div class="muted" style="padding:4px;">A carregar...</div>';
        node.appendChild(childBox);
        await loadTree(childBox, item.rel_path);
      });
    }
    node.appendChild(row);
    container.appendChild(node);
  }
}

// Sincroniza os checkboxes já renderizados no DOM sob uma pasta (para nós expandidos)
function syncTreeCheckboxes(parentRel, checked) {
  const prefix = parentRel + '/';
  const all = document.querySelectorAll('#file-tree input.tree-check');
  for (const c of all) {
    const rel = c.dataset.rel;
    if (!rel) continue;
    if (rel === parentRel || rel.startsWith(prefix)) {
      c.checked = checked;
      const row = c.closest('.tree-row');
      if (row) row.classList.toggle('checked', checked);
    }
  }
}

function updateCount() {
  const n = SMS.selected.size;
  const txt = n === 1 ? t('selected_one') : t('selected_many').replace('{n}', n);
  const el = document.getElementById('publish-count');
  if (el) el.textContent = txt;
  renderSelectedMods();
  updatePublishButtons();
}

// Agrupa os rel_paths selecionados por pasta-pai (user/mods, BepInEx/plugins),
// detetando a pasta em qualquer posição do path (o SPT pode ter prefixo "SPT/").
function renderSelectedMods() {
  const box = document.getElementById('selected-mods');
  if (!box) return;
  const sel = Array.from(SMS.selected);
  if (!sel.length) {
    box.innerHTML = `<div class="muted" style="padding:8px;" id="selected-mods-empty">${t('no_mods_selected')}</div>`;
    return;
  }

  // base -> Map(mod -> { full: bool, sub: Set })
  const groups = new Map();

  for (const rel of sel) {
    const parts = rel.split('/');
    let base = null, modParts = null;
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i] === 'user' && parts[i + 1] === 'mods') {
        base = 'user/mods';
        modParts = parts.slice(i + 2);
        break;
      }
      if (parts[i] === 'BepInEx' && parts[i + 1] === 'plugins') {
        base = 'BepInEx/plugins';
        modParts = parts.slice(i + 2);
        break;
      }
    }
    if (base === null || !modParts.length) continue; // fora das pastas conhecidas, ou é a própria pasta-pai
    const mod = modParts[0];
    if (!groups.has(base)) groups.set(base, new Map());
    const mods = groups.get(base);
    if (!mods.has(mod)) mods.set(mod, { full: false, sub: new Set() });
    const entry = mods.get(mod);
    if (modParts.length === 1) {
      entry.full = true; // a pasta do mod inteira foi selecionada
    } else {
      entry.sub.add(modParts.slice(1).join('/')); // ficheiro/subpasta dentro do mod
    }
  }

  let html = '';
  for (const [base, mods] of groups) {
    html += `<div class="mod-group">${base}</div>`;
    const sortedMods = Array.from(mods.keys()).sort((a, b) => a.localeCompare(b));
    for (const mod of sortedMods) {
      const entry = mods.get(mod);
      html += `<div class="mod-item">└── ${mod}</div>`;
      // se só parte do mod foi selecionado (não a pasta inteira), mostra a sub-hierarquia
      if (!entry.full && entry.sub.size) {
        for (const s of Array.from(entry.sub).sort((a, b) => a.localeCompare(b))) {
          html += `<div class="mod-item">&nbsp;&nbsp;&nbsp;&nbsp;└─ ${s}</div>`;
        }
      }
    }
  }
  box.innerHTML = html || `<div class="muted" style="padding:8px;" id="selected-mods-empty">${t('no_mods_selected')}</div>`;
}

// ---------- Estado do servidor (card moderno + enable/disable de Publish/Update) ----------
async function updateServerStatus() {
  const btn = document.getElementById('btn-server-toggle');
  const state = document.getElementById('server-btn-state');
  const hdr = document.getElementById('server-status');
  const viewStatus = document.getElementById('server-view-status');
  const orb = document.getElementById('server-orb');
  const card = document.getElementById('server-card');
  const cardState = document.getElementById('server-card-state');
  const ipValue = document.getElementById('server-ip-value');
  const sptValue = document.getElementById('server-spt-value');
  const deploy = document.getElementById('btn-deploy');
  const update = document.getElementById('btn-update');
  if (!api()) return;
  let running = false;
  try { const s = await api().get_server_status(); running = !!s.running; } catch (e) {}

  // Botão / card da vista Servidor
  if (btn) { btn.classList.toggle('on', running); btn.classList.toggle('off', !running); }
  if (orb) { orb.classList.toggle('on', running); orb.classList.toggle('off', !running); }
  if (card) { card.classList.toggle('is-on', running); card.classList.toggle('is-off', !running); }
  if (state) state.textContent = running ? t('server_on') : t('server_off');
  if (cardState) cardState.textContent = running ? t('on') : t('off');

  // IP / porta e pasta SPT no card
  if (ipValue) ipValue.textContent = SMS.config.serverIp || '127.0.0.1:8080';
  if (sptValue) sptValue.textContent = SMS.config.sptPath || '—';

  // Label no header (verde quando ligado, cinzento quando não)
  if (hdr) {
    hdr.textContent = running ? t('server_on') : t('server_off');
    hdr.classList.toggle('on', running);
    hdr.classList.toggle('off', !running);
  }

  // Label da vista Servidor
  if (viewStatus) {
    viewStatus.textContent = running ? t('server_on') : t('server_off');
    viewStatus.classList.toggle('on', running);
    viewStatus.classList.toggle('off', !running);
  }

  // Publish ativo quando o servidor está ligado (quem envia).
  if (deploy) deploy.disabled = !running;
  // Botão "Verificar/Download" da aba Update: SEMPRE ativo (precisa do servidor para verificar)
  const dlBtn = document.getElementById('btn-download-update');
  if (dlBtn) {
    dlBtn.disabled = false;
    dlBtn.classList.remove('disabled');
  }

  // Botão "UPDATE" da sidebar: SEMPRE ativo (quem recebe também precisa do servidor ligado)
  const sbUpdate = document.querySelector('.sidebar-btn[data-view="update"]');
  if (sbUpdate) {
    sbUpdate.classList.remove('wip');
    sbUpdate.style.pointerEvents = '';
  }
  // Botão "PUBLICAR" da sidebar: ativo só quando o servidor está LIGADO
  // (para publicar o patch precisas do servidor a servir). Desativa quando desligado.
  const sbPublish = document.querySelector('.sidebar-btn[data-view="publish"]');
  if (sbPublish) {
    sbPublish.classList.toggle('wip', !running);
    sbPublish.style.pointerEvents = !running ? 'none' : '';
  }
  // Árvore: só popula quando o server está ligado
  const tree = document.getElementById('file-tree');
  if (tree) {
    if (running) {
      if (tree.dataset.loaded !== '1') {
        tree.dataset.loaded = '1';
        tree.innerHTML = '<div class="muted" style="padding:8px;">A carregar...</div>';
        loadTree(tree, '');
      }
    } else {
      tree.dataset.loaded = '';
      tree.innerHTML = `<div class="muted" style="padding:8px;" id="tree-empty">${t('tree_empty')}</div>`;
    }
  }

  updatePublishButtons();
}

let patchReady = false;
let patchInfo = null;

function updatePublishButtons() {
  const makeBtn = document.getElementById('btn-make-patch');
  const deployBtn = document.getElementById('btn-deploy');
  const prog = document.getElementById('patch-progress');
  const hasSelection = SMS.selected.size > 0;
  const versionEl = document.getElementById('publish-version');
  const hasVersion = !!(versionEl && versionEl.value.trim());

  if (makeBtn) makeBtn.disabled = !(hasSelection && hasVersion);
  if (prog) prog.classList.toggle('disabled', !hasSelection);
  if (deployBtn) {
    // Publicar só fica ativo se o zip do patch existir em disco
    deployBtn.disabled = true;
    if (api()) {
      api().patch_exists().then(r => {
        deployBtn.disabled = !(r && r.exists);
      }).catch(() => { deployBtn.disabled = true; });
    }
  }
}

// Polling: mantém o label e os botões sincronizados sem depender de trocar de tab
function startServerStatusPolling() {
  if (window.__modsync_status_timer) clearInterval(window.__modsync_status_timer);
  window.__modsync_status_timer = setInterval(() => {
    updateServerStatus();
    updateServerLog();
  }, 1000);
  updateServerLog();
}

let __logLastCount = 0;
function updateServerLog() {
  const box = document.getElementById('server-log');
  if (!box) return;
  if (!api()) return;
  api().get_logs().then(logs => {
    if (!logs || !logs.length) {
      if (__logLastCount !== 0) { box.innerHTML = ''; __logLastCount = 0; }
      return;
    }
    // Só re-renderiza se houver linhas novas (evita flicker)
    if (logs.length === __logLastCount && box.childElementCount === logs.length) return;
    __logLastCount = logs.length;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
    box.innerHTML = logs.map(l => {
      const cls = l.level ? 'log-' + l.level.toLowerCase() : '';
      // extrai apenas a hora (HH:MM:SS) para o prefixo
      const m = (l.text || '').match(/(\d{2}:\d{2}:\d{2})/);
      const time = m ? m[1] : '';
      const rest = (l.text || '').replace(/^\[.*?\]\s*/, ''); // remove [data hora]
      return `<span class="log-line ${cls}"><span class="log-time">${time}</span>${rest}</span>`;
    }).join('');
    if (atBottom) box.scrollTop = box.scrollHeight;
  }).catch(() => {});
}

function initLogClear() {
  const btn = document.getElementById('btn-log-clear');
  if (btn) btn.addEventListener('click', () => {
    const box = document.getElementById('server-log');
    if (box) box.innerHTML = '';
    __logLastCount = 0;
    if (api()) { try { api().clear_logs(); } catch (e) {} }
  });
}

window.__modsync_emit = function (event, data) {
  if (event === 'publish_progress') setProgress('publish', data);
  if (event === 'update_progress') onUpdateProgress(data);
  if (event === 'app_update_progress') {
    if (data.msg_key) data.msg = t(data.msg_key);
    setProgress('appupdate', data);
    if (data.shutdown) {
      // A app vai fechar (update da própria app instalado). Mostra o modal
      // themático a pedir para ligar manualmente, e dá tempo de leitura.
      openAppUpdateDoneModal(data.msg || t('app_update_installed'));
      setTimeout(() => {
        if (api() && typeof api().close_app === 'function') api().close_app();
      }, 3500);
    }
  }
  if (event === 'patch_progress') onPatchProgress(data);
};

function onPatchProgress(d) {
  const bar = document.getElementById('patch-bar');
  const pct = document.getElementById('patch-pct');
  if (bar) bar.style.width = (d.pct || 0) + '%';
  if (pct) pct.textContent = (d.pct || 0) + '%';
  if (d.error) {
    if (pct) pct.textContent = '❌';
    return;
  }
  if (d.done && d.info) {
    fillPatchInfo(d.info);
  }
}

function fillPatchInfo(info) {
  patchReady = true;
  patchInfo = info;
  document.getElementById('patch-file').textContent = info.filename || '—';
  document.getElementById('patch-size').textContent = info.size ? `${info.size} MB` : '—';
  document.getElementById('patch-modified').textContent = info.modified || '—';
  document.getElementById('patch-info').style.display = 'block';
  updatePublishButtons();
}

// Polling do progresso do patch (mais robusto que evaluate_js em thread)
let __patchPoll = null;
function pollPatchProgress() {
  if (__patchPoll) clearInterval(__patchPoll);
  __patchPoll = setInterval(async () => {
    if (!api()) return;
    let p;
    try { p = await api().get_patch_progress(); } catch (e) { return; }
    if (!p) return;
    const bar = document.getElementById('patch-bar');
    const pct = document.getElementById('patch-pct');
    const fileLabel = document.getElementById('patch-file-label');
    if (bar) bar.style.width = (p.pct || 0) + '%';
    if (pct) pct.textContent = (p.pct || 0) + '%';
    if (p.file && fileLabel) {
      fileLabel.style.display = 'block';
      fileLabel.textContent = '📦 ' + p.file;
    }
    if (p.error) {
      if (pct) pct.textContent = '❌';
      clearInterval(__patchPoll);
      __patchPoll = null;
      return;
    }
    if (p.done && p.info) {
      if (fileLabel) { fileLabel.style.display = 'none'; }
      fillPatchInfo(p.info);
      clearInterval(__patchPoll);
      __patchPoll = null;
    }
  }, 100);
}

function setDownloadButtonMode(mode) {
  const label = document.getElementById('btn-download-update-label');
  const icon = document.getElementById('btn-download-update-icon');
  if (mode === 'download') {
    if (label) label.textContent = t('download');
    if (icon) { icon.className = 'fa-solid fa-cloud-arrow-down'; }
  } else {
    if (label) label.textContent = t('check');
    if (icon) { icon.className = 'fa-solid fa-magnifying-glass'; }
  }
}

function resetUpdateInfoCard() {
  const f = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  f('update-patch-name', '—');
  f('update-patch-version', '—');
  f('update-patch-size', '—');
  f('update-patch-speed', '—');
  const chWrap = document.getElementById('update-patch-changelog-wrap');
  if (chWrap) chWrap.style.display = 'none';
  const chEl = document.getElementById('update-patch-changelog');
  if (chEl) chEl.textContent = '';
}

function fillUpdateInfoCard(latest) {
  const nameEl = document.getElementById('update-patch-name');
  const verEl = document.getElementById('update-patch-version');
  const chWrap = document.getElementById('update-patch-changelog-wrap');
  const chEl = document.getElementById('update-patch-changelog');
  const sizeEl = document.getElementById('update-patch-size');
  const speedEl = document.getElementById('update-patch-speed');
  if (nameEl) nameEl.textContent = latest.filename || ('v' + (latest.Version || '?'));
  if (verEl) verEl.textContent = 'v' + (latest.Version || '?');
  if (sizeEl) sizeEl.textContent = '—';
  if (speedEl) speedEl.textContent = '—';
  if (chEl) chEl.textContent = latest.changelog || '';
  if (chWrap) chWrap.style.display = latest.changelog ? 'block' : 'none';
  // limpa barra de progresso para a próxima corrida
  const bar = document.getElementById('update-bar');
  const pct = document.getElementById('update-pct');
  if (bar) bar.style.width = '0%';
  if (pct) pct.textContent = '0%';
}

function onUpdateProgress(d) {
  const bar = document.getElementById('update-bar');
  const pct = document.getElementById('update-pct');
  const wrap = document.getElementById('update-progress');
  const st = document.getElementById('update-status');
  const dlBtn = document.getElementById('btn-download-update');
  const updBtn = document.getElementById('btn-update');
  const phase = d.phase || 'download';

  if (wrap) { wrap.style.display = 'block'; wrap.classList.remove('disabled'); }
  if (bar) bar.style.width = (d.pct || 0) + '%';
  if (pct) pct.textContent = (d.pct || 0) + '%';

  // Info do patch (tamanho / velocidade) durante o download
  if (phase === 'download') {
    const sizeEl = document.getElementById('update-patch-size');
    const speedEl = document.getElementById('update-patch-speed');
    if (sizeEl && d.size_mb != null) sizeEl.textContent = d.size_mb + ' MB';
    if (speedEl && d.speed_mb_s != null) speedEl.textContent = d.speed_mb_s + ' MB/s';
    if (st) {
      st.textContent = d.msg || '';
      st.classList.toggle('danger', !!d.error);
      st.classList.toggle('ok', !!d.done && !d.error);
    }
    // Ao terminar o download, ativa o botão "Actualizar" (instalar)
    if (d.done && !d.error) {
      if (updBtn) updBtn.disabled = false;
      if (dlBtn) dlBtn.disabled = true;
    } else if (d.error) {
      if (dlBtn) dlBtn.disabled = false;
      if (updBtn) updBtn.disabled = true;
    } else {
      // a decorrer: desativa ambos
      if (dlBtn) dlBtn.disabled = true;
    }
  } else if (phase === 'install') {
    // Durante a instalação mostra o label "a instalar file X"
    if (st) {
      st.textContent = d.msg || '';
      st.classList.toggle('danger', !!d.error);
      st.classList.toggle('ok', !!d.done && !d.error);
    }
    if (updBtn) updBtn.disabled = true; // trava durante a instalação
    if (d.done && !d.error) {
      if (dlBtn) dlBtn.disabled = false;
      if (updBtn) updBtn.disabled = true;
    }
  }
}
function setProgress(prefix, d) {
  const bar = document.getElementById(prefix + '-bar');
  const pct = document.getElementById(prefix + '-pct');
  const wrap = document.getElementById(prefix + '-progress');
  const st = document.getElementById(prefix + '-status');
  if (wrap) {
    wrap.style.display = 'block';
    wrap.classList.remove('disabled');
  }
  if (bar) bar.style.width = (d.pct || 0) + '%';
  if (pct) pct.textContent = (d.pct || 0) + '%';
  if (st) st.textContent = d.msg || '';
  if (d.error && st) st.classList.add('danger');
  if (d.done && st) st.classList.add('ok');
}

// ---------- Auto-update app ----------
// Estado da verificação (para saber o que fazer quando o utilizador carrega em Descarregar)
let __appUpdateLatest = null;

// Repõe o botão "Verificar" ao estado normal (ícone + label), sem destruir o conteúdo interno.
function resetCheckButton() {
  const icon = document.getElementById('btn-check-icon');
  const label = document.getElementById('btn-check-label');
  if (icon) { icon.className = 'fa-solid fa-rotate'; }
  if (label) { label.textContent = t('verify'); }
  const btn = document.getElementById('btn-check-app-update');
  if (btn) { btn.classList.remove('btn-download'); btn.disabled = false; }
}

// Botão dedicado para descarregar (criado apenas quando há update), para não
// destruir o botão "Verificar" nem disparar dois handlers em simultâneo.
// Não mexemos em .btn-download (manter as dimensões do botão inalteradas).
function showDownloadButton(latest) {
  const btn = document.getElementById('btn-check-app-update');
  if (!btn) return;
  const icon = document.getElementById('btn-check-icon');
  const label = document.getElementById('btn-check-label');
  if (icon) { icon.className = 'fa-solid fa-download'; }
  if (label) { label.textContent = t('download'); }
}

async function checkAppUpdate() {
  const st = document.getElementById('appupdate-status');
  const btn = document.getElementById('btn-check-app-update');
  __appUpdateLatest = null;
  if (!api()) return;
  // estado "a verificar"
  const icon = document.getElementById('btn-check-icon');
  const label = document.getElementById('btn-check-label');
  if (icon) { icon.className = 'fa-solid fa-spinner fa-spin'; }
  if (label) { label.textContent = t('checking'); }
  btn.disabled = true;
  st.classList.remove('danger', 'ok');
  const d = await api().check_app_update();
  btn.disabled = false;
  if (d.error) {
    st.textContent = '❌ ' + d.error;
    st.classList.add('danger');
    resetCheckButton();
    return;
  }
  if (d.update && d.latest) {
    __appUpdateLatest = d.latest;
    st.innerHTML = `⬇ <b>${d.latest.version}</b> ${t('new_version')}`;
    showDownloadButton(d.latest);
  } else {
    st.textContent = '✅ ' + t('up_to_date');
    st.classList.add('ok');
    resetCheckButton();
  }
}

// Abre o modal "Actualização disponível" (com a skin + idioma da app),
// mostrando a versão disponível. Usado quando o checkbox "verificar ao iniciar" está ligado.
function openAppUpdateAvailableModal(latest) {
  const msg = document.getElementById('app-update-available-msg');
  if (msg) {
    msg.textContent = t('app_update_available_msg') + ' ';
    const b = document.createElement('b');
    b.textContent = latest.version;
    msg.appendChild(b);
  }
  openModal('modal-app-update-available');
}

// ---------- Init ----------
async function init() {
  // 1) Listeners da sidebar EM PRIMEIRO LUGAR — garantir que os botões funcionam
  //    independentemente de o loadLang mais abaixo falhar ou demorar.
  // Sidebar
  document.querySelectorAll('.sidebar-btn').forEach(b =>
    b.addEventListener('click', () => {
      const view = b.dataset.view;
      if (view === 'settings') { openSettings(); return; }
      if (view === 'about') { openModal('modal-about'); return; }
      if (view === 'tips') { openModal('modal-tips'); return; }
      showView(view);
    }));

  // Modal Sobre / Tips (fechar)
  document.getElementById('btn-modal-about-close').addEventListener('click', () => closeModal('modal-about'));
  document.getElementById('btn-modal-tips-close').addEventListener('click', () => closeModal('modal-tips'));
  document.getElementById('btn-app-update-launch').addEventListener('click', () => {
    closeModal('modal-app-update');
    if (api() && typeof api().close_app === 'function') api().close_app();
  });
  // Modal "Actualização disponível" (checkbox verificar ao iniciar)
  document.getElementById('btn-app-update-later').addEventListener('click', () => {
    // "Agora não" -> apenas fecha a mensagem e volta à janela principal da app
    closeModal('modal-app-update-available');
  });
  document.getElementById('btn-app-update-now').addEventListener('click', () => {
    // "Atualizar agora" -> NÃO descarrega sozinho. Fecha este modal e abre as
    // Opções, onde o scan de actualização já está feito e o user vê a versão
    // disponível pronta a instalar (carrega em "Descarregar" nas Opções).
    closeModal('modal-app-update-available');
    openSettings();
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay.id); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(o => closeModal(o.id));
    }
  });

  // 2) Config + tradução (não bloqueia a sidebar se falhar)
  if (api()) {
    try {
      const cfg = await api().get_config();
      SMS.config.serverIp = cfg.server_ip ?? SMS.config.serverIp;
      SMS.config.sptPath = cfg.spt_path ?? SMS.config.sptPath;
      SMS.config.installedVersion = cfg.installed_version ?? SMS.config.installedVersion;
      SMS.config.language = cfg.language ?? SMS.config.language;
      SMS.config.serverOn = cfg.server_on ?? SMS.config.serverOn;
      SMS.config.checkAppUpdateOnStart = (cfg.check_app_update_on_start === 'true' || cfg.check_app_update_on_start === true)
        ? true : false;
      if (api() && typeof api().get_app_version === 'function') {
        try { SMS.config.appVersion = await api().get_app_version(); } catch (e) {}
      }
    } catch (e) { console.warn('config', e); }
  }
  try {
    await loadLang(SMS.config.language || 'pt-pt');
  } catch (e) { console.warn('loadLang', e); }

  // Settings modal
  async function detectAndShowSpt() {
    const path = SMS.config.sptPath;
    const vEl = document.getElementById('spt-version');
    const lEl = document.getElementById('spt-launcher');
    const dEl = document.getElementById('spt-detect');
    if (!api() || !path) { vEl.textContent='—'; lEl.textContent='—'; dEl.textContent='—'; return; }
    try {
      const info = await api().detect_spt(path);
      vEl.textContent = info.spt_version || '?';
      lEl.textContent = info.launcher ? '✅' : '❌';
      dEl.textContent = info.spt_version ? `SPT ${info.spt_version}` : t('spt_detect_unknown');
    } catch(e) { vEl.textContent='?'; lEl.textContent='?'; dEl.textContent=t('spt_detect_error'); }
  }
  function openSettings() {
    document.getElementById('cfg-server-ip').value = SMS.config.serverIp;
    document.getElementById('cfg-spt-path').value = SMS.config.sptPath;
    document.getElementById('cfg-language').value = SMS.config.language;
    document.getElementById('server-toggle').checked = SMS.config.serverOn === 'true' || SMS.config.serverOn === true;
    document.getElementById('server-toggle-state').textContent =
      (SMS.config.serverOn === 'true' || SMS.config.serverOn === true) ? t('on') : t('off');
    const chkAuto = document.getElementById('check-app-update-on-start');
    if (chkAuto) {
      chkAuto.checked = SMS.config.checkAppUpdateOnStart === 'true' || SMS.config.checkAppUpdateOnStart === true;
    }
    // Pinta a versão atual da app nas Opções
    const verEl = document.getElementById('app-current-version');
    if (verEl) verEl.textContent = SMS.config.appVersion || '—';
    // Se há uma actualização disponível (verificada ao iniciar), mostra-a abaixo da versão actual
    const st = document.getElementById('appupdate-status');
    const avail = document.getElementById('appupdate-available');
    if (__appUpdateLatest) {
      if (avail) { avail.style.display = 'block'; avail.innerHTML = `${t('available_version')}: <b>${__appUpdateLatest.version}</b>`; }
      showDownloadButton(__appUpdateLatest);
    } else {
      // repõe o botão de verificação ao estado normal sempre que se abre o modal
      __appUpdateLatest = null;
      resetCheckButton();
      if (st) { st.textContent = ''; st.classList.remove('danger', 'ok'); }
      if (avail) { avail.style.display = 'none'; avail.textContent = ''; }
    }
    detectAndShowSpt();
    openModal('modal-settings');
  }
  document.getElementById('btn-settings-close').addEventListener('click', () => closeModal('modal-settings'));
  // Checkbox "verificar actualizações ao iniciar" — grava imediatamente no INI
  const chkAutoUpdate = document.getElementById('check-app-update-on-start');
  if (chkAutoUpdate) {
    chkAutoUpdate.addEventListener('change', (e) => {
      SMS.config.checkAppUpdateOnStart = e.target.checked ? 'true' : 'false';
      if (api()) api().save_config({ check_app_update_on_start: SMS.config.checkAppUpdateOnStart });
    });
  }
  // Toggle das definições = AUTOSTART (ligar servidor ao iniciar)
  document.getElementById('server-toggle').addEventListener('change', (e) => {
    SMS.config.serverOn = e.target.checked;
    document.getElementById('server-toggle-state').textContent = e.target.checked ? t('on') : t('off');
    if (api()) api().save_config({ server_on: e.target.checked ? 'true' : 'false' });
  });
  document.getElementById('btn-browse').addEventListener('click', async () => {
    if (!api()) return;
    try {
      const r = await api().browse_folder();
      if (r && r.ok && r.path) {
        document.getElementById('cfg-spt-path').value = r.path;
        SMS.config.sptPath = r.path;
        detectAndShowSpt();
      }
    } catch(e) { console.warn('browse', e); }
  });
  document.getElementById('cfg-spt-path').addEventListener('change', () => {
    SMS.config.sptPath = document.getElementById('cfg-spt-path').value;
    detectAndShowSpt();
  });
  document.getElementById('btn-settings-save').addEventListener('click', () => {
    SMS.config.serverIp = document.getElementById('cfg-server-ip').value;
    SMS.config.sptPath = document.getElementById('cfg-spt-path').value;
    SMS.config.language = document.getElementById('cfg-language').value;
    const chkAuto = document.getElementById('check-app-update-on-start');
    SMS.config.checkAppUpdateOnStart = chkAuto ? (chkAuto.checked ? 'true' : 'false') : 'false';
    if (api()) {
      api().save_config({
        server_ip: SMS.config.serverIp,
        spt_path: SMS.config.sptPath,
        language: SMS.config.language,
        check_app_update_on_start: SMS.config.checkAppUpdateOnStart,
      });
      try { api().set_log_lang(SMS.config.language); } catch (e) {}
    }
    loadLang(SMS.config.language);
    closeModal('modal-settings');
  });

  // Árvore (botão Atualizar — respeita o estado do servidor)
  document.getElementById('btn-refresh-tree').addEventListener('click', async () => {
    const tree = document.getElementById('file-tree');
    let running = false;
    if (api()) { try { const s = await api().get_server_status(); running = !!s.running; } catch(e){} }
    if (!running) {
      tree.innerHTML = `<div class="muted" style="padding:8px;">${t('server_first')}</div>`;
      return;
    }
    tree.dataset.loaded = '1';
    tree.innerHTML = '<div class="muted" style="padding:8px;">A carregar...</div>';
    loadTree(tree, '');
  });

  // Publish
  document.getElementById('publish-version').addEventListener('input', updatePublishButtons);
  document.getElementById('btn-make-patch').addEventListener('click', async () => {
    const sel = Array.from(SMS.selected);
    if (!sel.length) { alert(t('select_files_first')); return; }
    const version = document.getElementById('publish-version').value.trim();
    if (!version) { alert(t('missing_version')); return; }
    if (!api()) return;
    document.getElementById('patch-bar').style.width = '0%';
    document.getElementById('patch-pct').textContent = '0%';
    const r = await api().make_patch(sel, version);
    if (r && r.error) { alert(r.error); return; }
    pollPatchProgress();
  });

  document.getElementById('btn-deploy').addEventListener('click', async () => {
    const version = document.getElementById('publish-version').value.trim();
    const changelog = document.getElementById('publish-changelog').value.trim();
    if (!api()) return;
    const pe = await api().patch_exists();
    if (!pe || !pe.exists) { alert('Faz primeiro o patch com o botão Fazer Patch.'); return; }
    if (!version) { alert(t('missing_version')); return; }
    // o patchInfo vem do evento patch_progress (done); se não tiver, usa info mínima
    const info = patchInfo || { ok: true, zip_path: pe.path, filename: 'patch.zip', size: 0, items: 0 };
    api().publish_from_patch(info, version, changelog);
  });

  // Update de mods
  // Botão "Verificar / Descarregar": faz check + download (sem instalar)
  document.getElementById('btn-download-update').addEventListener('click', async () => {
    if (!api()) return;
    const dlBtn = document.getElementById('btn-download-update');
    const updBtn = document.getElementById('btn-update');
    const card = document.getElementById('update-info-card');
    const st = document.getElementById('update-status');
    if (dlBtn) dlBtn.disabled = true;
    if (updBtn) updBtn.disabled = true;
    if (st) { st.textContent = 'A verificar...'; st.classList.remove('danger', 'ok'); }
    resetUpdateInfoCard();
    // 1) verifica se há patch (obtém os dados para os labels)
    let info = null;
    try { info = await api().check_update(); } catch (e) {}
    if (!info || !info.ok) {
      if (st) { st.textContent = '❌ ' + (info && info.error ? info.error : 'erro'); st.classList.add('danger'); }
      if (dlBtn) dlBtn.disabled = false;
      return;
    }
    if (!info.update || !info.latest) {
      if (st) { st.textContent = '✅ ' + t('up_to_date'); st.classList.add('ok'); }
      if (dlBtn) dlBtn.disabled = false;
      // volta ao estado "Verificar"
      setDownloadButtonMode('check');
      return;
    }
    // 2) preenche o card de info do patch
    const latest = info.latest;
    fillUpdateInfoCard(latest);
    // muda o botão para "Download" (há atualização)
    setDownloadButtonMode('download');
    // 3) descarrega (sem instalar)
    const res = await api().download_update();
    if (res && res.error) {
      if (st) { st.textContent = '❌ ' + res.error; st.classList.add('danger'); }
      if (dlBtn) dlBtn.disabled = false;
      setDownloadButtonMode('check');
    }
  });
  // Botão "Actualizar": instala o patch já descarregado
  document.getElementById('btn-update').addEventListener('click', () => {
    if (!api()) return;
    api().install_update();
  });


  // Auto-update app (nas Definições) — um único handler lê o estado atual
  document.getElementById('btn-check-app-update').addEventListener('click', () => {
    if (__appUpdateLatest && __appUpdateLatest.url) {
      api().download_app_update(__appUpdateLatest.url);
    } else {
      checkAppUpdate();
    }
  });

  // Botão do servidor (liga/desliga runtime)
  document.getElementById('btn-server-toggle').addEventListener('click', async () => {
    if (!api()) return;
    let running = false;
    try { const s = await api().get_server_status(); running = !!s.running; } catch (e) {}
    await api().set_server_running(!running);
    await updateServerStatus();
  });

  updateCount();
  updateServerStatus();
  startServerStatusPolling();
  initLogClear();

  // Verificar actualizações da app ao iniciar (se a opção estiver ligada)
  if (SMS.config.checkAppUpdateOnStart) {
    checkAppUpdate().then(() => {
      // Se encontrou actualização, mostra o modal themático (não fica escondido nas Opções)
      if (__appUpdateLatest) {
        openAppUpdateAvailableModal(__appUpdateLatest);
      }
    });
  }
}

// O pywebview injeta `window.pywebview.api` só depois do DOM carregar e dispara
// `pywebviewready`. Como este script é um módulo (deferido), o evento pode ter
// sido disparado ANTES de este ficheiro correr — por isso arrancamos de forma
// defensiva: se a API já está pronta, fazemos boot já; senão ouvimos o evento;
// e há ainda um fallback por timeout para garantir que o init() sempre corre.
function boot() {
  if (window.__modsync_booted) return;
  window.__modsync_booted = true;
  init();
}
function tryBootIfReady() {
  if (window.__modsync_booted) return;
  if (window.pywebview && window.pywebview.api) boot();
}
if (window.pywebview && window.pywebview.api) {
  boot();
} else {
  window.addEventListener('pywebviewready', boot);
}
// Fallback: garante arranque mesmo que o evento tenha passado ou falhado.
document.addEventListener('DOMContentLoaded', tryBootIfReady);
setTimeout(tryBootIfReady, 400);
setTimeout(tryBootIfReady, 1500);
