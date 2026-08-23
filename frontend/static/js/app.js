/**
 * HermesForge arayüzü.
 *
 * Tasarım kararları:
 * - Ajan seçimi YOK. Hangi ajanların çalışacağına sunucudaki yönlendirici
 *   karar verir; arayüz yalnızca sonucu gösterir.
 * - Üst başlık canlıdır: o an hangi ajan çalışıyorsa onun adını taşır.
 * - Kod hiçbir zaman düz metin akmaz; dosya adı başlıklı, kopyalanabilir ve
 *   indirilebilir kod kartlarına dönüşür (markdown.js).
 */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const els = {
    title: $('topTitle'),
    subtitle: $('topSubtitle'),
    menuBtn: $('menuBtn'),
    settingsBtn: $('settingsBtn'),
    drawer: $('drawer'),
    settings: $('settingsPanel'),
    overlay: $('overlay'),
    closeDrawer: $('closeDrawerBtn'),
    closeSettings: $('closeSettingsBtn'),
    messages: $('messages'),
    empty: $('emptyState'),
    input: $('userInput'),
    sendBtn: $('sendBtn'),
    stopBtn: $('stopBtn'),
    fileInput: $('fileInput'),
    attachments: $('attachments'),
    pipeline: $('pipelineStrip'),
    artifactBar: $('artifactBar'),
    artifactCount: $('artifactCount'),
    artifactFiles: $('artifactFiles'),
    formatSelect: $('formatSelect'),
    downloadBtn: $('downloadBtn'),
    newChatBtn: $('newChatBtn'),
    historyList: $('historyList'),
    projectList: $('projectList'),
    memoryList: $('memoryList'),
    sourceList: $('sourceList'),
    engineBadge: $('engineBadge'),
    engineDetail: $('engineDetail'),
    startHermesBtn: $('startHermesBtn'),
    hermesLog: $('hermesLog'),
    themeBtn: $('themeBtn'),
    exportChatBtn: $('exportChatBtn'),
    clearMemoryBtn: $('clearMemoryBtn'),
    clearSourcesBtn: $('clearSourcesBtn'),
    memoryInput: $('memoryInput'),
    addMemoryBtn: $('addMemoryBtn'),
    saveSettingsBtn: $('saveSettingsBtn'),
    toast: $('toast')
  };

  const state = {
    messages: [],
    projectId: null,
    sessionId: null,
    chatTitle: '',
    running: false,
    controller: null,
    // Ajanlar paralel çalıştığı için tek bir "aktif balon" yetmez: her düğüm
    // (fan-out'ta aynı rolden birden çok olabilir) kendi balonunu tutar.
    streams: new Map(),   // node anahtarı -> {bubble, text, card}
    active: new Map(),    // o an çalışan düğümler -> card
    history: JSON.parse(localStorage.getItem('hf.history') || '[]'),
    chatId: null,
    discovering: false,   // ağ taraması aynı anda iki kez başlamasın
    dark: localStorage.getItem('hf.dark') !== 'false'
  };

  // ---------------------------------------------------------------- yardımcı

  function toast(text, kind) {
    els.toast.textContent = text;
    els.toast.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { els.toast.className = 'toast'; }, 3200);
  }

  function scrollToEnd(force) {
    const box = els.messages;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
    if (force || nearBottom) box.scrollTop = box.scrollHeight;
  }

  function setTitle(main, sub) {
    els.title.textContent = main;
    els.subtitle.textContent = sub || '';
    els.subtitle.style.display = sub ? 'block' : 'none';
    document.title = main === 'HermesForge' ? 'HermesForge' : main + ' · HermesForge';
  }

  function applyTheme() {
    document.body.classList.toggle('dark', state.dark);
    els.themeBtn.textContent = state.dark ? '☀️  Aydınlık tema' : '🌙  Karanlık tema';
  }

  function openPanel(panel) {
    panel.classList.add('open');
    els.overlay.classList.add('show');
  }
  function closePanels() {
    els.drawer.classList.remove('open');
    els.settings.classList.remove('open');
    els.overlay.classList.remove('show');
  }

  // ---------------------------------------------------------------- mesajlar

  function clearEmpty() {
    if (els.empty) els.empty.style.display = 'none';
  }

  function addUserMessage(text) {
    clearEmpty();
    const row = document.createElement('div');
    row.className = 'msg msg-user';
    row.innerHTML = '<div class="bubble">' + window.Markdown.escapeHtml(text).replace(/\n/g, '<br>') + '</div>';
    els.messages.appendChild(row);
    scrollToEnd(true);
  }

  function addAgentMessage(agent) {
    clearEmpty();
    const row = document.createElement('div');
    row.className = 'msg msg-agent';
    row.innerHTML =
      '<div class="agent-head">' +
        '<span class="agent-emoji">' + (agent.emoji || '🤖') + '</span>' +
        '<span class="agent-name">' + window.Markdown.escapeHtml(agent.name || 'Ajan') + '</span>' +
        '<span class="agent-title">' + window.Markdown.escapeHtml(agent.title || '') + '</span>' +
        '<span class="agent-spinner" aria-hidden="true"></span>' +
      '</div>' +
      '<div class="bubble markdown"></div>';
    els.messages.appendChild(row);
    scrollToEnd(true);
    return row;
  }

  function addNotice(text, kind) {
    clearEmpty();
    const row = document.createElement('div');
    row.className = 'notice notice-' + (kind || 'info');
    row.textContent = text;
    els.messages.appendChild(row);
    scrollToEnd();
    return row;
  }

  /** Bir düğüm için balon açar (yoksa) ve akış kaydını döndürür. */
  function openStream(card) {
    const key = card.node || card.id;
    let stream = state.streams.get(key);
    if (!stream) {
      const row = addAgentMessage(card);
      stream = { bubble: row.querySelector('.bubble'), text: '', card: card, row: row };
      row.classList.add('streaming');
      state.streams.set(key, stream);
    }
    return stream;
  }

  function renderStream(stream) {
    stream.bubble.innerHTML = window.Markdown.render(stream.text);
    scrollToEnd();
  }

  /** Tek bir düğümün balonunu kapatır; diğerleri akmaya devam eder. */
  function closeStream(key) {
    const stream = state.streams.get(key);
    if (!stream) return;
    stream.row.classList.remove('streaming');
    renderStream(stream);
    if (stream.text.trim()) {
      state.messages.push({
        role: 'assistant',
        content: stream.text,
        agentId: stream.card.id,
        agentName: stream.card.label || stream.card.name
      });
    }
    state.streams.delete(key);
  }

  function closeAllStreams() {
    Array.from(state.streams.keys()).forEach(closeStream);
    state.active.clear();
  }

  /** Başlık: tek ajan varsa adı, birden fazlaysa kaç ajan çalıştığı. */
  function refreshTitle() {
    const cards = Array.from(state.active.values());
    if (cards.length === 0) {
      setTitle(state.chatTitle || 'HermesForge');
    } else if (cards.length === 1) {
      const card = cards[0];
      setTitle(card.emoji + '  ' + (card.label || card.name), card.title);
    } else {
      setTitle(
        cards.length + ' ajan çalışıyor',
        cards.map(function (c) { return c.emoji + ' ' + (c.label || c.name); }).join(', ')
      );
    }
  }

  /** Alt başlığı geçici bir duruma çevirir (düşünüyor, araç çalıştırıyor…). */
  function setStatusLine(text) {
    const cards = Array.from(state.active.values());
    if (cards.length === 1) {
      const card = cards[0];
      setTitle(card.emoji + '  ' + (card.label || card.name), text);
    } else if (cards.length > 1) {
      setTitle(cards.length + ' ajan çalışıyor', text);
    } else {
      setTitle(state.chatTitle || 'HermesForge', text);
    }
  }

  // ------------------------------------------------------------ hat şeridi

  /**
   * Hat şeridi. Ajanlar artık doğrusal ilerlemediği için birden çok çip aynı
   * anda etkin olabilir; ok yerine dalga sınırlarını gösteriyoruz.
   */
  function renderPipeline(agents) {
    if (!agents || !agents.length) { els.pipeline.innerHTML = ''; els.pipeline.classList.remove('show'); return; }
    els.pipeline.classList.add('show');
    const activeIds = new Set(Array.from(state.active.values()).map(function (c) { return c.id; }));
    els.pipeline.innerHTML = agents.map(function (agent) {
      let cls = 'pipe-chip';
      if (activeIds.has(agent.id)) cls += ' active';
      else if (agent.done) cls += ' done';
      const count = agent.instances > 1 ? ' <small>×' + agent.instances + '</small>' : '';
      return '<span class="' + cls + '"><span>' + agent.emoji + '</span>' +
        window.Markdown.escapeHtml(agent.name) + count + '</span>';
    }).join('<span class="pipe-arrow">→</span>');
  }

  // ------------------------------------------------------------- ürün paneli

  function renderArtifacts(payload) {
    state.projectId = payload.project_id || state.projectId;
    const files = payload.files || [];
    if (!files.length) { els.artifactBar.classList.remove('show'); return; }

    els.artifactBar.classList.add('show');
    els.artifactCount.textContent = files.length + ' dosya';
    const newSet = new Set(payload.new_files || []);
    els.artifactFiles.innerHTML = files.map(function (file) {
      const fresh = newSet.has(file.path) ? ' fresh' : '';
      return '<button type="button" class="artifact-file' + fresh + '" data-path="' +
        window.Markdown.escapeHtml(file.path) + '">' +
        window.Markdown.escapeHtml(file.path) + '<small>' + file.bytes + 'B</small></button>';
    }).join('');

    if (payload.suggested_format) els.formatSelect.value = payload.suggested_format;
    refreshProjects();
  }

  function downloadProject() {
    if (!state.projectId) { toast('Henüz üretilmiş bir proje yok.', 'warn'); return; }
    const fmt = els.formatSelect.value || 'zip';
    window.location.href = '/api/projects/' + encodeURIComponent(state.projectId) +
      '/export?format=' + encodeURIComponent(fmt);
  }

  // ----------------------------------------------------------------- akış

  async function send() {
    const text = els.input.value.trim();
    if (!text || state.running) return;

    els.input.value = '';
    els.input.style.height = 'auto';
    addUserMessage(text);
    state.messages.push({ role: 'user', content: text });
    if (!state.chatTitle) { state.chatTitle = text.slice(0, 40); setTitle(state.chatTitle); }

    state.running = true;
    els.sendBtn.style.display = 'none';
    els.stopBtn.style.display = 'flex';
    state.controller = new AbortController();

    let pipelineAgents = [];

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: state.messages.slice(-14).map(function (m) {
            return { role: m.role, content: m.content };
          }),
          project_id: state.projectId,
          session_id: state.sessionId
        }),
        signal: state.controller.signal
      });

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(function () { return ''; });
        throw new Error('Sunucu yanıt vermedi (' + response.status + ') ' + detail.slice(0, 200));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });

        let index;
        while ((index = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          if (!frame.startsWith('data:')) continue;
          let event;
          try { event = JSON.parse(frame.slice(5).trim()); } catch (err) { continue; }
          pipelineAgents = handleEvent(event, pipelineAgents);
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') addNotice('Akış durduruldu.', 'warn');
      else addNotice('Hata: ' + err.message, 'error');
    } finally {
      // Akış bittiğinde/kesildiğinde açık kalan tüm balonları kapat —
      // paralel çalışırken birden fazla olabilir.
      closeAllStreams();
      state.running = false;
      state.controller = null;
      els.sendBtn.style.display = 'flex';
      els.stopBtn.style.display = 'none';
      renderPipeline(pipelineAgents.map(function (a) { return Object.assign({}, a, { done: true }); }));
      setTitle(state.chatTitle || 'HermesForge');
      persistChat();
    }
  }

  function handleEvent(event, pipelineAgents) {
    switch (event.type) {
      case 'status':
        setStatusLine(event.text);
        break;

      case 'engine':
        updateEngineBadge(event);
        if (event.engine === 'none') addNotice(event.note || 'Çalışan motor yok.', 'error');
        break;

      case 'route':
        pipelineAgents = (event.agents || []).map(function (a) {
          return Object.assign({}, a, { done: false, instances: 1 });
        });
        if (event.title) { state.chatTitle = event.title; }
        renderPipeline(pipelineAgents);
        addNotice('Yönlendirme: ' + event.mode + ' · ' + (event.reason || ''), 'info');
        break;

      case 'wave':
        // Aynı dalgadaki ajanlar paralel çalışır. Fan-out'ta aynı rolden
        // birden çok düğüm olur; şeritte "×2" olarak gösteriyoruz.
        (event.agents || []).forEach(function (card) {
          const row = pipelineAgents.find(function (a) { return a.id === card.id; });
          if (row) row.instances = (event.agents || []).filter(function (c) {
            return c.id === card.id;
          }).length;
        });
        if (event.parallel) {
          addNotice(
            event.agents.length + ' ajan paralel başlıyor: ' +
            event.agents.map(function (c) { return c.emoji + ' ' + (c.label || c.name); }).join(', '),
            'info'
          );
        }
        renderPipeline(pipelineAgents);
        break;

      case 'project':
        state.projectId = event.project_id;
        break;

      case 'session':
        state.sessionId = event.session_id;
        break;

      case 'agent_start': {
        const card = event.agent;
        state.active.set(card.node || card.id, card);
        openStream(card);
        refreshTitle();
        renderPipeline(pipelineAgents);
        break;
      }

      case 'delta': {
        // Paralel akışta hangi balona yazılacağını düğüm anahtarı belirler.
        const key = event.node || event.agent_id;
        let stream = state.streams.get(key);
        if (!stream) {
          stream = openStream(state.active.get(key) || {
            id: event.agent_id || 'advisor', name: 'Ajan', emoji: '🤖', title: '', node: key
          });
        }
        stream.text += event.text;
        renderStream(stream);
        break;
      }

      case 'reasoning':
        setStatusLine('düşünüyor…');
        break;

      case 'tool_start':
        setStatusLine('🔧 ' + event.tool);
        break;

      case 'agent_end': {
        const key = event.node || event.agent_id;
        state.active.delete(key);
        closeStream(key);
        const row = pipelineAgents.find(function (a) { return a.id === event.agent_id; });
        // Fan-out'ta rol, ancak tüm düğümleri bitince "tamam" sayılır.
        if (row && !Array.from(state.active.values()).some(function (c) { return c.id === event.agent_id; })) {
          row.done = true;
        }
        renderPipeline(pipelineAgents);
        refreshTitle();
        if (event.files && event.files.length) {
          addNotice((event.agent.label || event.agent.name) + ' ' + event.files.length +
            ' dosya yazdı: ' + event.files.map(function (f) { return f.path; }).join(', '), 'ok');
        }
        break;
      }

      case 'artifacts':
        renderArtifacts(event);
        break;

      case 'memory':
        if (event.stored && event.stored.length) {
          addNotice('Belleğe eklendi: ' + event.stored.map(function (s) { return s.text; }).join(' | '), 'info');
          refreshMemory();
        }
        break;

      case 'error':
        addNotice(event.text, 'error');
        break;

      case 'done':
        break;
    }
    return pipelineAgents;
  }

  // ------------------------------------------------------------- kalıcılık

  function persistChat() {
    if (!state.messages.length) return;
    const entry = {
      id: state.chatId || String(Date.now()),
      title: state.chatTitle || 'Sohbet',
      projectId: state.projectId,
      sessionId: state.sessionId,
      messages: state.messages,
      at: Date.now()
    };
    state.chatId = entry.id;
    state.history = state.history.filter(function (c) { return c.id !== entry.id; });
    state.history.unshift(entry);
    state.history = state.history.slice(0, 40);
    localStorage.setItem('hf.history', JSON.stringify(state.history));
    renderHistory();
  }

  function renderHistory() {
    els.historyList.innerHTML = state.history.map(function (chat) {
      const active = chat.id === state.chatId ? ' active' : '';
      return '<button type="button" class="list-item' + active + '" data-chat="' + chat.id + '">' +
        window.Markdown.escapeHtml(chat.title) + '</button>';
    }).join('') || '<div class="list-empty">Henüz sohbet yok.</div>';
  }

  function loadChat(chatId) {
    const chat = state.history.find(function (c) { return c.id === chatId; });
    if (!chat) return;
    state.chatId = chat.id;
    state.messages = chat.messages || [];
    state.projectId = chat.projectId || null;
    state.sessionId = chat.sessionId || null;
    state.chatTitle = chat.title;
    state.streams.clear();
    state.active.clear();

    els.messages.innerHTML = '';
    state.messages.forEach(function (message) {
      if (message.role === 'user') addUserMessage(message.content);
      else {
        const row = addAgentMessage({
          emoji: '🤖', name: message.agentName || 'Ajan', title: ''
        });
        row.querySelector('.bubble').innerHTML = window.Markdown.render(message.content);
      }
    });
    setTitle(chat.title);
    if (state.projectId) loadProjectFiles(state.projectId);
    renderHistory();
    closePanels();
  }

  function newChat() {
    persistChat();
    state.streams.clear();
    state.active.clear();
    state.messages = [];
    state.projectId = null;
    state.sessionId = null;
    state.chatTitle = '';
    state.chatId = null;
    els.messages.innerHTML = '';
    if (els.empty) { els.messages.appendChild(els.empty); els.empty.style.display = 'flex'; }
    els.artifactBar.classList.remove('show');
    els.pipeline.classList.remove('show');
    setTitle('HermesForge');
    renderHistory();
    closePanels();
  }

  // ------------------------------------------------------------- veri çekme

  function updateEngineBadge(info) {
    const engine = info.engine || 'none';
    els.engineBadge.textContent = info.label || engine;
    els.engineBadge.className = 'engine-badge engine-' + engine;
    // Detay boşken başta yalnız bir tire kalmasın.
    els.engineDetail.textContent = [info.detail, info.note].filter(Boolean).join(' — ');
  }

  /** Motor durumuna bağlı yan öğeler (düğme, günlük, ipucu). */
  function applyEngineExtras(reachable, data) {
    // Gateway'i yalnızca aynı makinede başlatabiliriz; telefonda kabuk yok.
    els.startHermesBtn.style.display =
      (!reachable && platform !== 'android' && !embeddedAvailable) ? 'block' : 'none';
    els.hermesLog.style.display = platform === 'android' ? 'none' : '';

    const optional = $('hermesOptionalHint');
    if (!optional) return;
    optional.style.display = reachable ? 'none' : '';
    if (reachable) return;

    if (embeddedAvailable) {
      const embedded = (data && data.embedded) || {};
      optional.textContent = embedded.error
        ? 'Gömülü motor açılamadı: ' + embedded.error +
          ' Ağdaki bir Hermes\'e de bağlanabilirsin.'
        : 'Hermes uygulamanın içinde açılıyor.';
    } else {
      optional.textContent = platform === 'android'
        ? 'Uygulama tüm işi Hermes\'e yaptırır. Hermes\'in çalıştığı bilgisayarda ' +
          'scripts/hermes_sunucu.sh komutunu çalıştır, ekrandaki QR kodu telefonun ' +
          'kamerasıyla okut.'
        : 'Hermes çalışmıyor; uygulama Hermes olmadan iş üretemez.';
    }
  }

  async function refreshStatus() {
    try {
      const data = await fetch('/api/status').then(function (r) { return r.json(); });
      platform = data.platform || 'desktop';
      if (data.catalog) catalog = data.catalog;

      const reachable = !!(data.hermes && data.hermes.health && data.hermes.health.reachable);
      engineIsHermes = reachable;

      const embedded = data.embedded || {};
      embeddedAvailable = !!embedded.available;
      $('embeddedSection').style.display = embeddedAvailable ? '' : 'none';
      $('remoteSection').style.display = embeddedAvailable ? 'none' : '';

      // Motor içeride ama model anahtarı yoksa iş üretemez; kurulumu göster.
      if (embeddedAvailable && !embedded.model_configured) {
        if (!state.messages.length) showSetup(true);
        updateEngineBadge({
          engine: 'none',
          label: 'Model ayarlanmadı',
          detail: '',
          note: 'Menü → Ayarlar → Model bölümünden bir DeepSeek anahtarı gir.'
        });
        applyEngineExtras(false, data);
        return;
      }

      if (embeddedAvailable && !reachable) {
        // Gateway ilk açılışta şema kuruyor; bu saniyeler sürebilir.
        updateEngineBadge({
          engine: 'none',
          label: 'Motor başlatılıyor…',
          detail: '',
          note: embedded.error || 'Hermes uygulamanın içinde açılıyor, birkaç saniye.'
        });
        applyEngineExtras(false, data);
        return;
      }

      if (reachable) {
        showSetup(false);
        updateEngineBadge({
          engine: 'hermes',
          label: 'Hermes Agent',
          detail: data.hermes.base_url,
          note: 'araçlar ve beceriler etkin'
        });
      } else {
        // Hermes olmadan çalışan bir yol yok; kullanıcıyı menüde arattırma.
        if (!state.messages.length) showSetup(true);
        updateEngineBadge({
          engine: 'none',
          label: 'Hermes\'e bağlı değil',
          detail: data.hermes ? data.hermes.base_url : '',
          note: platform === 'android'
            ? 'Hermes\'in çalıştığı bilgisayardaki QR kodu okut ya da adresi elle gir.'
            : 'scripts/hermes_sunucu.sh ile gateway\'i başlat.'
        });
      }

      applyEngineExtras(reachable, data);

      if (data.rag) $('ragStat').textContent = data.rag.documents + ' belge · ' + data.rag.chunks + ' parça';
      if (data.memory) $('memoryStat').textContent = data.memory.total + ' anı';
      if (data.formats && els.formatSelect.options.length === 0) {
        els.formatSelect.innerHTML = data.formats.map(function (f) {
          return '<option value="' + f + '">' + formatLabel(f) + '</option>';
        }).join('');
      }
    } catch (err) {
      updateEngineBadge({ engine: 'none', label: 'Sunucuya ulaşılamadı', detail: err.message });
    }
  }

  function formatLabel(fmt) {
    return { zip: 'ZIP arşivi', targz: 'tar.gz', markdown: 'Markdown', json: 'JSON', single: 'Tek dosya (.py)' }[fmt] || fmt;
  }

  async function refreshMemory() {
    try {
      const data = await fetch('/api/memory').then(function (r) { return r.json(); });
      els.memoryList.innerHTML = (data.memories || []).map(function (m) {
        return '<div class="mem-item"><span class="mem-cat">' + m.category + '</span>' +
          '<span class="mem-body">' + window.Markdown.escapeHtml(m.body) + '</span>' +
          '<button type="button" class="mem-del" data-mem="' + m.id + '">×</button></div>';
      }).join('') || '<div class="list-empty">Bellek boş.</div>';
      $('memoryStat').textContent = (data.stats ? data.stats.total : 0) + ' anı';
    } catch (err) { /* panel kapalıyken sessiz geç */ }
  }

  async function refreshSources() {
    try {
      const data = await fetch('/api/rag/sources').then(function (r) { return r.json(); });
      els.sourceList.innerHTML = (data.sources || []).map(function (s) {
        return '<div class="list-row"><span>' + window.Markdown.escapeHtml(s.source) + '</span><small>' +
          s.chunks + '</small></div>';
      }).join('') || '<div class="list-empty">Yüklenmiş dosya yok.</div>';
    } catch (err) { /* yoksay */ }
  }

  async function refreshProjects() {
    try {
      const data = await fetch('/api/projects').then(function (r) { return r.json(); });
      els.projectList.innerHTML = (data.projects || []).map(function (p) {
        const active = p.project_id === state.projectId ? ' active' : '';
        return '<button type="button" class="list-item' + active + '" data-project="' + p.project_id + '">' +
          window.Markdown.escapeHtml(p.project_id) + '<small>' + p.files + ' dosya</small></button>';
      }).join('') || '<div class="list-empty">Henüz proje yok.</div>';
    } catch (err) { /* yoksay */ }
  }

  async function loadProjectFiles(projectId) {
    try {
      const data = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/files')
        .then(function (r) { return r.json(); });
      renderArtifacts({ project_id: projectId, files: data.files || [], new_files: [] });
    } catch (err) { /* yoksay */ }
  }

  async function openProjectFile(path) {
    if (!state.projectId) return;
    const data = await fetch('/api/projects/' + encodeURIComponent(state.projectId) +
      '/file?path=' + encodeURIComponent(path)).then(function (r) { return r.json(); });
    if (data.error) { toast(data.error, 'error'); return; }
    const language = (path.split('.').pop() || 'text').toLowerCase();
    const row = document.createElement('div');
    row.className = 'msg msg-agent';
    row.innerHTML = '<div class="bubble markdown">' +
      window.Markdown.render('```' + language + ' path=' + path + '\n' + data.content + '\n```') + '</div>';
    els.messages.appendChild(row);
    scrollToEnd(true);
  }

  // ----------------------------------------------------------------- yükleme

  async function uploadFiles(files) {
    for (const file of files) {
      const chip = document.createElement('span');
      chip.className = 'attach-chip loading';
      chip.textContent = '⏳ ' + file.name;
      els.attachments.appendChild(chip);

      const form = new FormData();
      form.append('file', file);
      try {
        const data = await fetch('/api/upload', { method: 'POST', body: form })
          .then(function (r) { return r.json(); });
        if (data.error) {
          chip.className = 'attach-chip error';
          chip.textContent = '⚠️ ' + file.name;
          toast(data.error, 'error');
        } else {
          chip.className = 'attach-chip ok';
          chip.textContent = '📎 ' + file.name + ' (' + data.chunks + ' parça)';
          refreshSources();
        }
      } catch (err) {
        chip.className = 'attach-chip error';
        chip.textContent = '⚠️ ' + file.name;
      }
    }
  }

  // ------------------------------------------------------------------ olaylar

  function bind() {
    els.menuBtn.addEventListener('click', function () { openPanel(els.drawer); refreshProjects(); refreshMemory(); refreshSources(); });
    els.settingsBtn.addEventListener('click', function () { openPanel(els.settings); loadSettings(); });
    els.closeDrawer.addEventListener('click', closePanels);
    els.closeSettings.addEventListener('click', closePanels);
    els.overlay.addEventListener('click', closePanels);

    // Dar telefon ekranlarında panel, örtünün neredeyse tamamını kaplar;
    // Escape her zaman çalışan bir kaçış yolu bırakır.
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closePanels();
    });

    els.sendBtn.addEventListener('click', send);
    els.stopBtn.addEventListener('click', function () {
      if (state.controller) state.controller.abort();
    });

    els.input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey && window.innerWidth > 820) {
        event.preventDefault();
        send();
      }
    });
    els.input.addEventListener('input', function () {
      els.input.style.height = 'auto';
      els.input.style.height = Math.min(els.input.scrollHeight, 190) + 'px';
    });

    els.fileInput.addEventListener('change', function () {
      if (els.fileInput.files.length) uploadFiles(Array.from(els.fileInput.files));
      els.fileInput.value = '';
    });

    els.newChatBtn.addEventListener('click', newChat);
    els.downloadBtn.addEventListener('click', downloadProject);
    els.themeBtn.addEventListener('click', function () {
      state.dark = !state.dark;
      localStorage.setItem('hf.dark', state.dark);
      applyTheme();
    });

    els.exportChatBtn.addEventListener('click', async function () {
      if (!state.messages.length) { toast('Dışa aktarılacak mesaj yok.', 'warn'); return; }
      const response = await fetch('/api/export/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: state.messages })
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'hermesforge-konusma.zip';
      link.click();
      URL.revokeObjectURL(url);
    });

    els.startHermesBtn.addEventListener('click', async function () {
      const reset = function () {
        els.startHermesBtn.disabled = false;
        els.startHermesBtn.textContent = 'Hermes gateway başlat';
      };
      els.startHermesBtn.disabled = true;
      els.startHermesBtn.textContent = 'Başlatılıyor…';
      try {
        const data = await fetch('/api/hermes/start', { method: 'POST' })
          .then(function (r) { return r.json(); });
        toast(data.started ? 'Hermes gateway başlatıldı.' : (data.error || 'Başlatılamadı.'),
              data.started ? 'ok' : 'error');
        // Başlatma başarısızsa 4 saniye beklemenin anlamı yok; düğme hemen
        // eski hâline dönsün, yoksa "Başlatılıyor…" diye takılı kalıyor.
        if (!data.started) { reset(); return; }
        setTimeout(function () {
          refreshStatus();
          reset();
          fetch('/api/hermes/log').then(function (r) { return r.json(); })
            .then(function (d) { els.hermesLog.textContent = d.log || ''; });
        }, 4000);
      } catch (err) {
        toast('Başlatılamadı: ' + err.message, 'error');
        reset();
      }
    });

    els.addMemoryBtn.addEventListener('click', async function () {
      const text = els.memoryInput.value.trim();
      if (!text) return;
      await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, category: 'olgu', importance: 0.9 })
      });
      els.memoryInput.value = '';
      refreshMemory();
    });

    els.clearMemoryBtn.addEventListener('click', async function () {
      if (!confirm('Tüm bellek silinsin mi?')) return;
      await fetch('/api/memory', { method: 'DELETE' });
      refreshMemory();
    });

    els.clearSourcesBtn.addEventListener('click', async function () {
      if (!confirm('Yüklenen dosyalar dizinden silinsin mi?')) return;
      await fetch('/api/rag', { method: 'DELETE' });
      refreshSources();
      els.attachments.innerHTML = '';
    });

    els.saveSettingsBtn.addEventListener('click', saveSettings);
    $('setupSaveBtn').addEventListener('click', runSetup);
    $('setupModelBtn').addEventListener('click', function () {
      saveModelKey($('setupModelKey'), $('setupModelName'), $('setupModelStatus'), function () {
        showSetup(false);
        els.input.focus();
      });
    });
    $('setupModelKey').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') $('setupModelBtn').click();
    });
    $('saveModelBtn').addEventListener('click', function () {
      saveModelKey($('modelKey'), $('modelName'), $('modelStatus'), null);
    });
    $('setupKey').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') runSetup();
    });
    $('setupBaseUrl').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') runSetup();
    });
    $('testHermesBtn').addEventListener('click', testHermesFromSettings);
    $('discoverHermesBtn').addEventListener('click', function () {
      discoverHermes({ rescan: true, status: $('hermesTestStatus'), fill: true });
    });

    // Kod kartı düğmeleri, sohbet listesi, proje listesi: tek delege dinleyici.
    document.addEventListener('click', function (event) {
      const codeBtn = event.target.closest('.code-btn');
      if (codeBtn) { handleCodeAction(codeBtn); return; }

      const foundBtn = event.target.closest('[data-hermes]');
      if (foundBtn) {
        $('setupBaseUrl').value = foundBtn.dataset.hermes;
        $('setupKey').focus();
        return;
      }

      const chatItem = event.target.closest('[data-chat]');
      if (chatItem) { loadChat(chatItem.dataset.chat); return; }

      const projectItem = event.target.closest('[data-project]');
      if (projectItem) {
        state.projectId = projectItem.dataset.project;
        loadProjectFiles(state.projectId);
        closePanels();
        return;
      }

      const artifactFile = event.target.closest('.artifact-file');
      if (artifactFile) { openProjectFile(artifactFile.dataset.path); return; }

      const memDel = event.target.closest('[data-mem]');
      if (memDel) {
        fetch('/api/memory/' + memDel.dataset.mem, { method: 'DELETE' }).then(refreshMemory);
      }
    });
  }

  function handleCodeAction(button) {
    const code = document.getElementById(button.dataset.target);
    if (!code) return;
    const text = code.textContent;
    const card = button.closest('.code-card');
    const path = (card && card.dataset.path) || '';

    if (button.dataset.action === 'copy') {
      copyText(text).then(function () {
        button.textContent = 'Kopyalandı ✓';
        setTimeout(function () { button.textContent = 'Kopyala'; }, 1600);
      }).catch(function () { toast('Kopyalanamadı.', 'error'); });
      return;
    }

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = path ? path.split('/').pop() : 'kod.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Termux'ta http:// üzerinden açıldığında Clipboard API kapalıdır.
    return new Promise(function (resolve, reject) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
      } catch (err) { reject(err); }
      document.body.removeChild(area);
    });
  }


  // ------------------------------------------------------------ kurulum

  /**
   * İlk açılış kurulumu.
   *
   * Uygulama yalnızca Hermes ile çalışır; gereken tek şey Hermes'in adresi ve
   * anahtarı. Kaydetmeden ÖNCE sunucuya karşı sınıyoruz — yanlış bir adres
   * aksi hâlde ancak ilk sohbet denemesinde, akışın ortasında anlaşılıyor.
   */
  function showSetup(show) {
    const card = $('setupCard');
    const wasHidden = card.style.display === 'none';
    card.style.display = show ? 'flex' : 'none';
    if (els.empty) els.empty.style.display = show ? 'none' : '';
    if (!show) return;

    // İki kurulum yolu var: motor telefonun içindeyse yalnızca model anahtarı
    // gerekiyor; değilse ağdaki bir Hermes'e bağlanmak gerekiyor.
    $('setupEmbedded').style.display = embeddedAvailable ? '' : 'none';
    $('setupRemote').style.display = embeddedAvailable ? 'none' : '';

    // Uzak yolda kurulum ekranı ilk açıldığında ağı kendimiz tarayalım;
    // kullanıcı 192.168.x.x adresini aramak zorunda kalmasın.
    if (!embeddedAvailable && wasHidden && !state.discovering) {
      discoverHermes({ status: $('setupStatus'), fill: true, quiet: true });
    }
  }

  /** Gömülü Hermes'in model sağlayıcısını kaydeder. */
  async function saveModelKey(keyInput, modelInput, status, onDone) {
    const key = keyInput.value.trim();
    if (!key) {
      status.className = 'setup-status error';
      status.textContent = 'Önce anahtarı yapıştır.';
      return;
    }
    status.className = 'setup-status busy';
    status.textContent = 'Kaydediliyor…';
    try {
      const data = await fetch('/api/hermes/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, model: modelInput.value })
      }).then(function (r) { return r.json(); });

      if (!data.saved) {
        status.className = 'setup-status error';
        status.textContent = data.error || 'Kaydedilemedi.';
        return;
      }
      keyInput.value = '';
      status.className = 'setup-status ok';
      status.textContent = data.restart_required
        ? 'Kaydedildi. Yeni ayarın geçerli olması için uygulamayı kapatıp aç.'
        : 'Kaydedildi! Artık yazabilirsin.';
      await refreshStatus();
      // Sağlayıcı değişmiş olabilir; düzey listesi ona göre yeniden kurulmalı.
      applyCatalog($('reasoning_effort').value);
      if (onDone) setTimeout(onDone, data.restart_required ? 2600 : 900);
    } catch (err) {
      status.className = 'setup-status error';
      status.textContent = 'Hata: ' + err.message;
    }
  }

  /**
   * Hermes'i ev ağında arar.
   *
   * Bilgisayarın IP'si değiştiğinde uygulama bir sabah "bağlanamadı" diyordu
   * ve kullanıcı neyin bozulduğunu bilmiyordu. Artık kendi buluyor.
   */
  async function discoverHermes(options) {
    const opts = options || {};
    const status = opts.status;
    if (state.discovering) return null;
    state.discovering = true;
    if (status) {
      status.className = 'setup-status busy';
      status.textContent = 'Ev ağında Hermes aranıyor…';
    }
    try {
      const data = await fetch('/api/hermes/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rescan: !!opts.rescan })
      }).then(function (r) { return r.json(); });

      const found = data.found || [];
      renderFound(found);

      if (!found.length) {
        if (status) {
          status.className = opts.quiet ? 'setup-status' : 'setup-status error';
          status.textContent = opts.quiet
            ? 'Ağda Hermes bulunamadı — adresi elle girebilirsin.'
            : 'Ağda Hermes bulunamadı. Bilgisayarda hermes_sunucu.sh çalışıyor mu?';
        }
        return null;
      }

      if (opts.fill) {
        const target = found[0].base_url;
        if ($('setupBaseUrl') && !$('setupBaseUrl').value.trim()) $('setupBaseUrl').value = target;
        if ($('hermes_base_url') && opts.rescan) $('hermes_base_url').value = target;
      }
      if (status) {
        status.className = 'setup-status ok';
        status.textContent = 'Hermes bulundu: ' + found[0].base_url +
          (found[0].version ? ' (sürüm ' + found[0].version + ')' : '');
      }
      return found[0];
    } catch (err) {
      if (status) {
        status.className = 'setup-status error';
        status.textContent = 'Arama başarısız: ' + err.message;
      }
      return null;
    } finally {
      state.discovering = false;
    }
  }

  function renderFound(found) {
    const box = $('setupFound');
    if (!box) return;
    if (!found.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = '';
    box.innerHTML = found.map(function (hit) {
      return '<button class="found-btn" data-hermes="' +
        window.Markdown.escapeHtml(hit.base_url) + '">' +
        '<span class="found-dot"></span>' +
        '<span><b>Hermes bulundu</b><br>' + window.Markdown.escapeHtml(hit.base_url) +
        (hit.version ? ' · sürüm ' + window.Markdown.escapeHtml(hit.version) : '') +
        '</span></button>';
    }).join('');
  }

  /** Adresi/anahtarı sınar, sonucu verilen durum kutusuna yazar. */
  async function probeHermes(baseUrl, apiKey, status) {
    status.className = 'setup-status busy';
    status.textContent = 'Bağlanılıyor…';
    const result = await fetch('/api/hermes/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_url: baseUrl, api_key: apiKey })
    }).then(function (r) { return r.json(); });

    if (!result.ok) {
      status.className = 'setup-status error';
      status.textContent = result.error || 'Bağlanılamadı.';
    }
    return result;
  }

  async function runSetup() {
    const button = $('setupSaveBtn');
    const status = $('setupStatus');
    const baseUrl = $('setupBaseUrl').value.trim();
    const key = $('setupKey').value.trim();

    if (!baseUrl) {
      status.className = 'setup-status error';
      status.textContent = 'Hermes adresini gir (örn. http://192.168.1.20:8642).';
      return;
    }

    button.disabled = true;
    try {
      const test = await probeHermes(baseUrl, key, status);
      if (!test.ok) return;

      status.textContent = 'Kaydediliyor…';
      const payload = { hermes_base_url: test.base_url || baseUrl };
      if (key) payload.hermes_api_key = key;

      const saved = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json(); });

      if (!saved.saved) {
        status.className = 'setup-status error';
        status.textContent = saved.error || 'Kaydedilemedi.';
        return;
      }

      status.className = 'setup-status ok';
      status.textContent = 'Bağlandı! Artık yazabilirsin.';
      await refreshStatus();
      setTimeout(function () { showSetup(false); els.input.focus(); }, 900);
    } catch (err) {
      status.className = 'setup-status error';
      status.textContent = 'Hata: ' + err.message;
    } finally {
      button.disabled = false;
    }
  }

  /** Ayarlar panelindeki "Bağlantıyı sına" düğmesi. */
  async function testHermesFromSettings() {
    const button = $('testHermesBtn');
    const status = $('hermesTestStatus');
    button.disabled = true;
    try {
      const result = await probeHermes(
        $('hermes_base_url').value.trim(), $('hermes_api_key').value.trim(), status
      );
      if (result.ok) {
        status.className = 'setup-status ok';
        status.textContent = 'Bağlantı çalışıyor.' +
          (result.models && result.models.length ? ' Model: ' + result.models[0] : '');
      }
    } catch (err) {
      status.className = 'setup-status error';
      status.textContent = 'Hata: ' + err.message;
    } finally {
      button.disabled = false;
    }
  }

  // ------------------------------------------------------------------ ayarlar

  const SETTING_FIELDS = ['hermes_base_url', 'hermes_api_key', 'hermes_model', 'hermes_repo_dir'];
  const NUMERIC_FIELDS = ['max_tokens', 'max_parallel_agents'];

  // Düşünme düzeyi listesi sunucudan gelir; Hermes'in kendi kaynak kodundan
  // türetilmiştir, arayüzde sabit liste tutmuyoruz.
  let catalog = null;
  let platform = 'desktop';      // 'android' ise kabuk komutu önerilmez
  let engineIsHermes = false;
  let embeddedAvailable = false;   // Hermes APK'nın içinde mi?

  /** Düşünme düzeyi listesini ve token ipucunu kurar.
   *
   * Liste sağlayıcıya göre değişiyor: Hermes'in iç merdiveni (minimal, xhigh,
   * ultra…) her sağlayıcıda geçerli değil, telde en yakın düzeye kırpılıyor.
   * Kullanıcıya seçemeyeceği bir şey göstermek, seçtiğinden başka bir şeyin
   * gitmesi demekti.
   */
  function applyCatalog(currentEffort) {
    const efforts = (catalog && (catalog.efforts || catalog.hermes_efforts)) || [];
    if (!efforts.length) return;

    const effortSelect = $('reasoning_effort');
    effortSelect.innerHTML = efforts.map(function (e) {
      return '<option value="' + e.id + '">' + window.Markdown.escapeHtml(e.label) + '</option>';
    }).join('');
    effortSelect.value = efforts.some(function (e) { return e.id === currentEffort; })
      ? currentEffort : 'default';

    const label = catalog.provider_label;
    $('effortHint').textContent = catalog.provider_known
      ? label + ' bu düzeyleri kabul ediyor. ' + (catalog.default_note ||
          '"Varsayılan" seçiliyken hiçbir şey gönderilmez.')
      : 'Sağlayıcı bilinmiyor; Hermes\'in tüm düzeyleri gösteriliyor. Sağlayıcının ' +
        'tanımadığı bir düzey telde en yakınına indirilir.';

    $('maxTokensHint').textContent =
      'Hermes bu değeri istek başına kabul etmiyor; Hermes\'in kendi .env dosyasına ' +
      'yazılır ve motorun yeniden başlaması gerekir.';
  }

  async function loadSettings() {
    const data = await fetch('/api/settings').then(function (r) { return r.json(); });
    SETTING_FIELDS.forEach(function (field) {
      const input = $(field);
      if (!input) return;
      const value = data[field];
      // Sırlar sunucudan boolean olarak gelir; düz metin asla dönmez.
      if (typeof value === 'boolean') input.placeholder = value ? '•••• (kayıtlı)' : 'ayarlanmadı';
      else input.value = value || '';
    });
    $('hermes_autostart').checked = !!data.hermes_autostart;

    NUMERIC_FIELDS.forEach(function (field) {
      const input = $(field);
      if (input && data[field] !== undefined && data[field] !== null) input.value = data[field];
    });

    if (!catalog) await refreshStatus();
    applyCatalog(data.reasoning_effort);
    applyPlatformToSettings();
  }

  /** Android'de çalıştırılamayacak seçenekleri gizle. */
  function applyPlatformToSettings() {
    const android = platform === 'android';
    $('hermesAutostartRow').style.display = android ? 'none' : '';
    $('hermesRepoField').style.display = android ? 'none' : '';
    const hint = $('hermesPlatformHint');
    hint.style.display = android ? '' : 'none';
    if (android) {
      hint.textContent = 'Hermes bu uygulamanın içinde değil, senin bilgisayarında çalışır. ' +
        'Adresi elle yazmak yerine, o bilgisayardaki QR kodu telefonun kamerasıyla okutabilirsin.';
    }
  }

  async function saveSettings() {
    const payload = {};
    SETTING_FIELDS.forEach(function (field) {
      const input = $(field);
      if (input && input.value.trim()) payload[field] = input.value.trim();
    });
    payload.hermes_autostart = $('hermes_autostart').checked;
    payload.reasoning_effort = $('reasoning_effort').value;

    NUMERIC_FIELDS.forEach(function (field) {
      const raw = $(field).value.trim();
      if (raw !== '') payload[field] = Number(raw);
    });

    const data = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });

    if (!data.saved) { toast(data.error || 'Kaydedilemedi.', 'error'); return; }

    if (data.hermes_restart_required) {
      toast('Kaydedildi. Token sınırı için Hermes gateway yeniden başlatılmalı.', 'warn');
    } else {
      toast('Ayarlar kaydedildi.', 'ok');
    }
    refreshStatus();
    closePanels();
  }

  // ------------------------------------------------------------------- açılış

  applyTheme();
  bind();
  renderHistory();
  refreshStatus();
  refreshProjects();
  setInterval(refreshStatus, 30000);
})();
