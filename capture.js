(() => {
  'use strict';
  if (window.top !== window || document.getElementById('df-scouter-capture')) return;
  const GROUP = '.cmt_group';
  let selecting = false;
  let busy = false;
  let highlighted = [];
  let lastBlob = null;
  let lastObjectUrl = null;
  let noticeTimer = null;
  const host = document.createElement('div');
  host.id = 'df-scouter-capture'; host.className = 'df-scouter-capture-ui';
  host.style.cssText = 'position:fixed!important;right:40px!important;bottom:120px!important;z-index:2147483645!important;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{font-family:"Noto Sans KR",sans-serif;color:#fff}*{box-sizing:border-box}
    button,a{font:400 13px/1.4 "Noto Sans KR",sans-serif;cursor:pointer}
    .capture-button{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:5px;
      width:70px;height:70px;background:#484e5f;color:#fff;border:0;padding:0;border-radius:0;
      box-shadow:0 3px 6px rgba(0,0,0,.12)}
    .capture-button:hover{background:#363d50}.capture-button[aria-pressed=true]{background:#346a88}
    .capture-button:focus-visible,.actions button:focus-visible{outline:2px solid #33acea;outline-offset:3px}
    .capture-button:disabled{opacity:.75;cursor:wait}.camera{font-size:19px;line-height:20px}
    .notice{position:absolute;right:80px;bottom:0;width:300px;padding:12px 14px;border-radius:4px;
      background:#343b4d;color:#fff;font-size:12px;line-height:1.65;box-shadow:0 3px 12px #0002}
    .actions{display:flex;gap:7px;margin-top:8px;flex-wrap:wrap}
    .actions button{background:#fff;color:#384153;border:0;border-radius:3px;padding:5px 9px;font-size:11px}
    .hint{color:#c5d0dd;font-size:11px;margin-top:4px}[hidden]{display:none!important}
    @media(max-width:600px){.capture-button{width:52px;height:56px;font-size:12px}.notice{right:60px;width:240px}}
  `;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'capture-button';
  button.setAttribute('aria-label', '댓글 캡쳐 모드'); button.setAttribute('aria-pressed', 'false');
  const camera = document.createElement('span'); camera.className = 'camera'; camera.textContent = '▣'; camera.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.textContent = '캡쳐';
  button.append(camera, label);
  const notice = document.createElement('div'); notice.className = 'notice'; notice.hidden = true;
  notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
  shadow.append(style, button, notice);
  document.body.append(host);
  const highlightStyle = document.createElement('style');
  highlightStyle.className = 'df-scouter-capture-ui';
  highlightStyle.textContent = '.df-scouter-capture-target{outline:2px solid #33acea!important;outline-offset:-2px!important;cursor:copy!important}';
  document.head.append(highlightStyle);

  function show(message, actions = [], persistent = false) {
    clearTimeout(noticeTimer);
    const text = document.createElement('div'); text.textContent = message;
    notice.replaceChildren(text); notice.hidden = false;
    if (actions.length) {
      const row = document.createElement('div'); row.className = 'actions';
      for (const [title, action] of actions) {
        const item = document.createElement('button'); item.type = 'button'; item.textContent = title;
        item.addEventListener('click', action); row.append(item);
      }
      notice.append(row);
    }
    if (!persistent) noticeTimer = setTimeout(() => { notice.hidden = true; }, 6500);
  }
  function clearHighlight() {
    for (const item of highlighted) item.classList.remove('df-scouter-capture-target');
    highlighted = [];
  }
  function rootFor(target) {
    let group = target?.closest?.(GROUP);
    if (!group || !group.closest('.comment, .comment_list, #comment_best_area, #comment_group_area')) return null;
    if (group.classList.contains('reply')) {
      let previous = group.previousElementSibling;
      while (previous?.matches('.cmt_group.reply, .comment_enter')) previous = previous.previousElementSibling;
      if (previous?.matches('.cmt_group:not(.reply)')) group = previous;
    }
    return group;
  }
  function threadFor(root) {
    const groups = [root];
    for (let next = root.nextElementSibling; next; next = next.nextElementSibling) {
      if (next.matches('.comment_enter')) continue;
      if (!next.matches('.cmt_group.reply')) break;
      groups.push(next);
    }
    return groups;
  }
  async function originalFor(root) {
    if (!root.id.startsWith('best_cmt_div_')) return root;
    const id = root.id.replace(/^best_cmt_div_/, 'nor_cmt_div_');
    let original = document.getElementById(id);
    if (original && original.getBoundingClientRect().width > 0) return original;
    const goto = root.querySelector('.gocmt');
    if (!goto) return root;
    goto.click();
    for (let index = 0; index < 80; index++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      original = document.getElementById(id);
      if (original && original.getBoundingClientRect().width > 0) return original;
    }
    throw new Error('원댓글을 불러오지 못했습니다. 일반 댓글에서 다시 선택해 주세요.');
  }
  function setSelecting(value) {
    selecting = value;
    button.setAttribute('aria-pressed', String(value));
    label.textContent = value ? '취소' : '캡쳐';
    clearHighlight();
    if (value) show('캡쳐할 댓글을 선택하세요. 답글도 함께 포함합니다.', [['취소', cancel]], true);
  }
  function cancel() {
    setSelecting(false);
    clearTimeout(noticeTimer); noticeTimer = null;
    notice.hidden = true; notice.replaceChildren();
  }
  function placeButton() {
    const top = document.getElementById('gnbTopBtn');
    const rect = top?.getBoundingClientRect();
    const visible = rect && rect.width > 0 && rect.height > 0 && getComputedStyle(top).visibility !== 'hidden';
    if (visible) {
      // Rects and fixed left/top use the same viewport coordinates. Converting
      // innerWidth to CSS right introduced a scrollbar-width horizontal offset.
      host.style.setProperty('left', `${rect.left}px`, 'important');
      host.style.setProperty('top', `${Math.max(8, rect.top - rect.height - 10)}px`, 'important');
      host.style.setProperty('right', 'auto', 'important');
      host.style.setProperty('bottom', 'auto', 'important');
      button.style.width = `${rect.width}px`; button.style.height = `${rect.height}px`;
      notice.style.right = `${rect.width + 10}px`;
    } else {
      host.style.setProperty('left', 'auto', 'important'); host.style.setProperty('top', 'auto', 'important');
      host.style.setProperty('bottom', '40px', 'important');
      host.style.setProperty('right', innerWidth < 600 ? '16px' : '40px', 'important');
      button.style.removeProperty('width'); button.style.removeProperty('height'); notice.style.removeProperty('right');
    }
  }
  let positionTimer = null;
  function queuePosition() {
    if (positionTimer !== null) return;
    positionTimer = requestAnimationFrame(() => { positionTimer = null; placeButton(); });
  }
  window.addEventListener('scroll', queuePosition, { passive: true });
  window.addEventListener('resize', queuePosition);
  placeButton();
  button.addEventListener('click', () => {
    if (busy) return;
    if (selecting) cancel(); else setSelecting(true);
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && selecting) cancel(); }, true);
  document.addEventListener('pointerover', event => {
    if (!selecting || busy || event.composedPath().includes(host)) return;
    const root = rootFor(event.target);
    if (root && highlighted[0] === root) return;
    clearHighlight();
    if (root) { highlighted = threadFor(root); highlighted.forEach(item => item.classList.add('df-scouter-capture-target')); }
  }, true);

  function cssDataUrl(url) {
    const comma = url.indexOf(',');
    if (comma < 0) return 'data:text/css;base64,';
    const meta = url.slice(0, comma); const value = url.slice(comma + 1);
    let text;
    if (/;base64/i.test(meta)) {
      try {
        let decoder;
        try { decoder = new TextDecoder(meta.match(/charset=([^;,]+)/i)?.[1] || 'utf-8'); } catch { decoder = new TextDecoder(); }
        text = decoder.decode(Uint8Array.from(atob(value), char => char.charCodeAt(0)));
      } catch { text = ''; }
    }
    else { try { text = decodeURIComponent(value); } catch { text = value; } }
    const bytes = new TextEncoder().encode(text); let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
    return `data:text/css;charset=utf-8;base64,${btoa(binary)}`;
  }
  async function resource(url, cache, missing, type) {
    if (url.startsWith('data:')) return type === 'stylesheet' ? cssDataUrl(url) : url;
    const key = `${type}:${url}`;
    if (cache.has(key)) return cache.get(key);
    const pending = (async () => {
      try {
        if (url.startsWith('blob:')) {
          const response = await fetch(url);
          const data = await blobData(await response.blob());
          return type === 'stylesheet' ? cssDataUrl(data) : data;
        }
        const response = await chrome.runtime.sendMessage({ type: 'DF_SCOUTER_CAPTURE_RESOURCE', url });
        if (!response?.ok) throw new Error(response?.error || '리소스 요청 실패');
        if (type === 'stylesheet') {
          if (!/^data:text\/css[;,]/i.test(response.dataUrl)) throw new Error('스타일시트 형식 불일치');
          return cssDataUrl(response.dataUrl);
        }
        return response.dataUrl;
      } catch {
        missing.add(url);
        // A stylesheet must never receive binary image fallback: the renderer's
        // UTF-8 decoder throws URIError on GIF/PNG bytes supplied as CSS.
        if (type === 'stylesheet') return 'data:text/css;base64,';
        if (type === 'font') return 'data:application/octet-stream;base64,';
        // Do not fall through to arbitrary page-origin XHRs after a rejected URL.
        return 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
      }
    })();
    cache.set(key, pending);
    return pending;
  }
  function blobData(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  async function renderThread(selected) {
    const root = await originalFor(selected);
    const groups = threadFor(root);
    const restored = [];
    try {
      for (const group of groups) {
        if (getComputedStyle(group).display === 'none') {
          restored.push([group, group.style.cssText]); group.style.setProperty('display', 'flex', 'important');
        }
      }
      clearHighlight();
      if (document.fonts?.ready) await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 2000))]);
      const rects = groups.map(group => group.getBoundingClientRect());
      const left = Math.min(...rects.map(rect => rect.left));
      const width = Math.ceil(Math.max(...rects.map(rect => rect.right)) - left);
      const gaps = rects.map((rect, index) => index ? Math.max(0, Math.min(60, rect.top - rects[index - 1].bottom)) : 0);
      const heights = groups.map((group, index) => Math.ceil(Math.max(rects[index].height, group.scrollHeight)));
      const height = heights.reduce((sum, value, index) => sum + value + gaps[index], 0);
      if (width < 1 || height < 1) throw new Error('선택한 댓글의 크기를 확인하지 못했습니다.');
      const scale = Math.min(2, 30000 / width, 30000 / height, Math.sqrt(48000000 / (width * height)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('캡쳐 이미지를 만들 수 없습니다.');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      const cache = new Map(); const missing = new Set();
      let y = 0;
      for (let index = 0; index < groups.length; index++) {
        y += gaps[index];
        const part = await domtoimage.toCanvas(groups[index], {
          width: Math.ceil(rects[index].width), height: heights[index], bgcolor: '#fff', pixelRatio: scale,
          copyDefaultStyles: false, httpTimeout: 12000, loadExternalStyleSheet: true, ignoreCSSRuleErrors: true,
          logger: {},
          filter: node => !node.matches?.('.df-scouter-capture-ui, .comment_enter, script, noscript'),
          style: { outline: 'none', margin: '0', transform: 'none' },
          adjustClonedNode: (source, clone) => {
            if (clone.style) clone.style.outline = 'none';
          },
          requestInterceptor: (url, info) => info.status === undefined ? resource(url, cache, missing, info.type) : undefined,
          onImageError: info => { if (info.url) missing.add(info.url); },
        });
        context.drawImage(part, Math.round((rects[index].left - left) * scale), Math.round(y * scale));
        part.width = 1; part.height = 1;
        y += heights[index];
      }
      const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG 생성 실패')), 'image/png'));
      canvas.width = 1; canvas.height = 1;
      return { blob, replyCount: groups.length - 1, missing: missing.size, reduced: scale < 1 };
    } finally {
      for (const [group, css] of restored) group.style.cssText = css;
    }
  }
  function save() {
    if (!lastBlob) return;
    if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
    lastObjectUrl = URL.createObjectURL(lastBlob);
    const link = document.createElement('a'); link.href = lastObjectUrl;
    link.download = `던파-댓글-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    link.click();
  }
  async function copyAgain() {
    if (!lastBlob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': lastBlob })]);
      show('클립보드에 복사했습니다.', [['PNG 저장', save]]);
    } catch { show('복사가 허용되지 않았습니다. PNG로 저장할 수 있습니다.', [['다시 복사', copyAgain], ['PNG 저장', save]], true); }
  }
  async function capture(root) {
    busy = true; selecting = false;
    button.disabled = true; button.setAttribute('aria-pressed', 'false'); label.textContent = '캡쳐중';
    show('댓글과 답글을 이미지로 만들고 있습니다…', [], true);
    const result = renderThread(root).then(value => { lastBlob = value.blob; return value; });
    let copy;
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem !== 'function') throw new Error('클립보드 이미지 복사 미지원');
      copy = navigator.clipboard.write([new ClipboardItem({ 'image/png': result.then(value => value.blob) })])
        .then(() => true, () => false);
    } catch { copy = Promise.resolve(false); }
    try {
      const data = await result;
      const copied = await copy;
      const extra = `${data.missing ? ' 일부 이미지·글꼴은 불러오지 못했습니다.' : ''}${data.reduced ? ' 긴 댓글에 맞춰 크기를 줄였습니다.' : ''}`;
      show(`${copied ? '클립보드에 복사했습니다.' : '이미지가 준비되었습니다. 다시 복사를 눌러주세요.'} 답글 ${data.replyCount}개 포함.${extra}`,
        copied ? [['PNG 저장', save]] : [['다시 복사', copyAgain], ['PNG 저장', save]], !copied);
    } catch (error) {
      await copy;
      show(`캡쳐 실패: ${error.message || '이미지를 만들지 못했습니다.'}`, [['다시 선택', () => setSelecting(true)]], true);
    } finally {
      busy = false; button.disabled = false; label.textContent = '캡쳐'; clearHighlight();
    }
  }
  document.addEventListener('click', event => {
    if (!selecting || busy || !event.isTrusted || event.composedPath().includes(host)) return;
    const root = rootFor(event.target);
    if (!root) return;
    event.preventDefault(); event.stopImmediatePropagation();
    capture(root);
  }, true);
  window.addEventListener('pagehide', () => { selecting = false; clearHighlight(); if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl); });
})();
