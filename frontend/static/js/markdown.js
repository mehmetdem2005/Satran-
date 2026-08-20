/**
 * Bağımlılıksız markdown işleyici.
 *
 * CDN kullanmıyoruz: uygulama Termux'ta çevrimdışı da açılmalı. Kod blokları
 * dosya adı başlıklı, kopyalanabilir ve indirilebilir "kod kartı"na dönüşür —
 * kod hiçbir zaman düz metin olarak akmaz.
 */
(function (global) {
  'use strict';

  const BLOCK_LANGS = new Set([
    'python', 'py', 'javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx', 'json',
    'html', 'css', 'scss', 'bash', 'sh', 'shell', 'zsh', 'yaml', 'yml', 'toml',
    'ini', 'sql', 'text', 'txt', 'markdown', 'md', 'java', 'kotlin', 'kt', 'go',
    'rust', 'rs', 'c', 'cpp', 'csharp', 'cs', 'php', 'ruby', 'rb', 'swift',
    'dart', 'xml', 'svg', 'diff', 'dockerfile', 'makefile', 'gdscript', 'gd',
    'vue', 'svelte', 'lua', 'r', 'julia', 'perl', 'console', 'plaintext', 'tree'
  ]);

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Çit bilgi satırından {language, path} çıkarır. */
  function parseInfo(info) {
    const raw = (info || '').trim();
    if (!raw) return { language: '', path: '' };

    const kv = raw.match(/\b(?:path|file|filename|title|src|name)\s*=\s*("[^"]+"|'[^']+'|\S+)/i);
    if (kv) {
      let value = kv[1].replace(/^["']|["']$/g, '');
      const first = raw.split(/\s+/)[0].toLowerCase();
      return { language: BLOCK_LANGS.has(first) ? first : '', path: value };
    }

    const tokens = raw.replace(/:/g, ' ').split(/\s+/).filter(Boolean);
    let language = '';
    let path = '';
    tokens.forEach(function (token) {
      const clean = token.replace(/^["']|["']$/g, '');
      if (!language && BLOCK_LANGS.has(clean.toLowerCase())) {
        language = clean.toLowerCase();
      } else if (!path && (clean.indexOf('.') > -1 || clean.indexOf('/') > -1)) {
        path = clean;
      }
    });
    return { language: language, path: path };
  }

  function inline(text) {
    let out = escapeHtml(text);
    // `kod`
    out = out.replace(/`([^`\n]+)`/g, function (_m, code) {
      return '<code class="md-inline">' + code + '</code>';
    });
    // **kalın** ve *italik*
    out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    // [metin](bağlantı) — yalnızca http(s) şemasına izin veriyoruz
    out = out.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return out;
  }

  function renderTable(rows) {
    const header = rows[0];
    const body = rows.slice(2);
    let html = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
    header.forEach(function (cell) { html += '<th>' + inline(cell) + '</th>'; });
    html += '</tr></thead><tbody>';
    body.forEach(function (row) {
      html += '<tr>';
      row.forEach(function (cell) { html += '<td>' + inline(cell) + '</td>'; });
      html += '</tr>';
    });
    return html + '</tbody></table></div>';
  }

  function splitRow(line) {
    return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim(); });
  }

  function codeCard(language, path, code) {
    const id = 'code-' + Math.random().toString(36).slice(2, 10);
    const label = path || (language ? language : 'kod');
    const badge = path
      ? '<span class="code-path" title="' + escapeHtml(path) + '">' + escapeHtml(path) + '</span>'
      : '<span class="code-lang">' + escapeHtml(label) + '</span>';
    const lines = code.split('\n').length;

    return '' +
      '<figure class="code-card" data-path="' + escapeHtml(path) + '" data-lang="' + escapeHtml(language) + '">' +
        '<figcaption class="code-head">' +
          '<span class="code-head-left">' + badge +
            '<span class="code-meta">' + lines + ' satır</span>' +
          '</span>' +
          '<span class="code-head-actions">' +
            '<button type="button" class="code-btn" data-action="copy" data-target="' + id + '">Kopyala</button>' +
            '<button type="button" class="code-btn" data-action="download" data-target="' + id + '">İndir</button>' +
          '</span>' +
        '</figcaption>' +
        '<pre class="code-body"><code id="' + id + '" class="lang-' + escapeHtml(language || 'text') + '">' +
          escapeHtml(code) +
        '</code></pre>' +
      '</figure>';
  }

  function render(markdown) {
    const source = String(markdown == null ? '' : markdown).replace(/\r\n/g, '\n');
    const lines = source.split('\n');
    const out = [];

    let i = 0;
    let listType = null;
    let paragraph = [];

    function flushParagraph() {
      if (paragraph.length) {
        out.push('<p>' + inline(paragraph.join('\n')).replace(/\n/g, '<br>') + '</p>');
        paragraph = [];
      }
    }
    function closeList() {
      if (listType) { out.push('</' + listType + '>'); listType = null; }
    }

    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^\s{0,3}(`{3,}|~{3,})\s*(.*)$/);

      if (fence) {
        flushParagraph();
        closeList();
        const marker = fence[1][0];
        const minLen = fence[1].length;
        const info = parseInfo(fence[2]);
        const body = [];
        i++;
        while (i < lines.length) {
          const closing = lines[i].match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
          if (closing && closing[1][0] === marker && closing[1].length >= minLen) { i++; break; }
          body.push(lines[i]);
          i++;
        }
        out.push(codeCard(info.language, info.path, body.join('\n')));
        continue;
      }

      // Tablo
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
        flushParagraph();
        closeList();
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        out.push(renderTable(rows));
        continue;
      }

      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
      if (heading) {
        flushParagraph();
        closeList();
        const level = Math.min(heading[1].length + 1, 6);
        out.push('<h' + level + ' class="md-h">' + inline(heading[2]) + '</h' + level + '>');
        i++;
        continue;
      }

      if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        flushParagraph();
        closeList();
        out.push('<hr class="md-hr">');
        i++;
        continue;
      }

      const bullet = line.match(/^\s{0,6}[-*+]\s+(.*)$/);
      const numbered = line.match(/^\s{0,6}(\d+)[.)]\s+(.*)$/);
      if (bullet || numbered) {
        flushParagraph();
        const wanted = bullet ? 'ul' : 'ol';
        if (listType !== wanted) { closeList(); out.push('<' + wanted + ' class="md-list">'); listType = wanted; }
        out.push('<li>' + inline(bullet ? bullet[1] : numbered[2]) + '</li>');
        i++;
        continue;
      }

      const quote = line.match(/^\s{0,3}>\s?(.*)$/);
      if (quote) {
        flushParagraph();
        closeList();
        out.push('<blockquote class="md-quote">' + inline(quote[1]) + '</blockquote>');
        i++;
        continue;
      }

      if (!line.trim()) {
        flushParagraph();
        closeList();
        i++;
        continue;
      }

      closeList();
      paragraph.push(line);
      i++;
    }

    flushParagraph();
    closeList();
    return out.join('\n');
  }

  global.Markdown = { render: render, escapeHtml: escapeHtml, parseInfo: parseInfo };
})(window);
