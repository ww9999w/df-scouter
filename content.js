(() => {
  'use strict';
  if (window.top !== window) return;
  const P = globalThis.DFScouterProfile;
  const SELECTOR = ':is(.comment, .comment_list, #comment_area, #comment_group_area, #comment_best_area) a.dnf_charac_name_tag';
  const SERVER_TEXT = /^(?:서버\s*[:：]?\s*)?[\[(]?\s*(?:카인|디레지에|시로코|프레이|카시야스|힐더|안톤|바칼)(?:\s*서버)?\s*[\])]?$/u;
  const states = new WeakMap();
  // Display state only, for this page's comments. Every completed click starts a new request.
  const characters = new Map();
  const activeFrames = new Set();
  let scanTimer = null;
  let generation = 0;
  let hidden = false;
  let pagePath = location.pathname;
  const BUTTON_CSS = `
    :host{display:inline-flex;align-items:center;height:28px} *{box-sizing:border-box}
    :host::before{content:"";width:1px;height:10px;background:#d9dce2;margin-right:12px;flex:none}
    button{all:initial;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;
      gap:5px;height:28px;padding:0;border:0;background:-webkit-linear-gradient(top,#28d931,#33acea);
      -webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;
      font:400 var(--df-scouter-action-size,14px)/28px var(--df-scouter-font,"Noto Sans KR",sans-serif);cursor:pointer;
      white-space:nowrap;letter-spacing:-.3px}
    button:hover{text-decoration:underline;text-decoration-color:#33acea}
    button:focus-visible{outline:2px solid #898c92;outline-offset:2px}
    button:disabled{cursor:wait;opacity:.6}
    button[aria-busy=true]::before{content:"";width:9px;height:9px;border:1px solid #dde0e5;
      border-top-color:#6a6e76;border-radius:50%;animation:spin .8s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){button{transition:none}button::before{animation:none!important}}
  `;
  const SUMMARY_CSS = `
    :host{display:inline-flex;align-items:center;height:28px}
    :host::before{content:"";width:1px;height:10px;background:#d9dce2;margin-right:10px;flex:none}
    .summary-job{color:var(--df-scouter-server-color,#898c92);font:var(--df-scouter-server-weight,400) var(--df-scouter-server-size,14px)/28px var(--df-scouter-font,"Noto Sans KR",sans-serif);white-space:nowrap}
    .icon-metric{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;line-height:24px}
    .icon-metric{margin-left:10px}
    .icon-metric::before{content:"";width:1px;height:10px;background:#d9dce2;margin-right:6px;flex:none}
    .stat-icon{display:block;width:14px;height:14px;object-fit:contain}
    .icon-value{color:#3992ff;font:400 var(--df-scouter-name-size,14px)/28px var(--df-scouter-font,"Noto Sans KR",sans-serif);font-variant-numeric:tabular-nums}
    .unique-icons,.black-count{display:inline-flex;align-items:center;gap:4px;margin-left:10px}
    .unique-icons::before,.black-count::before{content:"";width:1px;height:10px;background:#d9dce2;margin-right:6px;flex:none}
    .unique-icons:empty{display:none}.gear-icon{width:18px;height:18px;object-fit:contain}
    .black-count{font:400 12px/28px var(--df-scouter-font,"Noto Sans KR",sans-serif);color:#6a6e76}
    .unique-icons .gear-icon{box-sizing:content-box;border:1px solid transparent;border-radius:1px;
      background:linear-gradient(#fff,#fff) padding-box,-webkit-linear-gradient(top,#28d931,#33acea) border-box}
    .unique-unknown{display:inline-flex;align-items:center;justify-content:center;font-size:12px;color:#898c92}
    .unavailable{color:#a2a6ad;font-size:11px}
  `;
  const COMPACT_PANEL_CSS = `
    :host{display:block;clear:both;width:100%}
    *{box-sizing:border-box}.card{max-width:100%;padding:4px 8px;font:400 11px/1.55 var(--df-scouter-font,"Noto Sans KR",sans-serif);
      color:#6a6e76;background:#fafbfc;border:1px solid #e3e6eb;border-radius:3px}
    .equipment-line{display:flex;align-items:center;gap:8px;white-space:nowrap;overflow-x:auto;scrollbar-width:thin;padding:1px 0 3px}
    .equipment-group,.oath-group,.black-count{display:inline-flex;align-items:center;gap:5px;flex:none}
    .oath-line{display:flex;align-items:center;gap:5px;padding:0 0 3px;white-space:nowrap;overflow-x:auto;scrollbar-width:thin}
    .label{color:#898c92}.set-name{color:#62666e}.gear-icon{width:20px;height:20px;object-fit:contain;vertical-align:middle}
    .unique-icons:empty{display:none}.average{color:#db00db;font-weight:600;font-variant-numeric:tabular-nums}
    .oath-name{font-weight:500}.oath-muted{color:#aaa}.oath-purple{color:#B36BFF}.oath-magenta{color:#FF00FF}
    .oath-orange{color:#FF7800}.oath-gradient{background-image:-webkit-linear-gradient(top,#28d931,#33acea);
      -webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}
    .points{color:#898c92;font-size:10px}.footer{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding-top:3px;border-top:1px solid #e8ebef}
    .clan{font-size:11px;color:#737880}.stamp{width:24px;height:24px;object-fit:contain;vertical-align:middle}
    .mist-badge{position:relative;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex:none}
    .mist-background{position:absolute;inset:-3px;width:30px;height:30px}.mist-value{position:relative;color:#fff;font-size:10px;font-weight:600;
      line-height:1;letter-spacing:-.6px;text-shadow:-1px 0 #285386,0 1px #285386,1px 0 #285386,0 -1px #285386}
    .time{font-size:10px;color:#989ca4;margin-left:auto}
    .note,.status{font-size:11px;color:#a16f54;white-space:normal;overflow-wrap:anywhere}.note{margin-top:3px}
    .refreshing{opacity:.65}.stale{border-color:#d9c8bd}.unavailable{color:#a2a6ad}
  `;

  const identity = el => ({ sv: el.getAttribute('data-sv') || '', key: el.getAttribute('data-key') || '' });
  const id = target => JSON.stringify([target.sv, target.key]);
  const fmt = value => Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '미확인';
  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function shadow(host, css) {
    const root = host.attachShadow({ mode: 'open' });
    const style = element('style');
    style.textContent = css;
    root.append(style);
    return root;
  }
  async function request(target, part = 'profile') {
    // These official JSON routes require the character profile as Referer.
    // Same-origin content fetch can supply it; extension-worker fetch cannot.
    if (part === 'score' || part === 'adventure') return requestDetail(target, part);
    let response;
    try { response = await chrome.runtime.sendMessage({ type: 'DF_SCOUTER_LOOKUP', ...target, part }); }
    catch { throw new Error('확장프로그램을 다시 불러온 뒤 게시글을 새로고침해 주세요.'); }
    if (!response?.ok) throw new Error(response?.error || '공식 프로필을 조회하지 못했습니다.');
    return response;
  }
  async function requestDetail(target, part) {
    const profileUrl = profileAddress(target);
    const url = part === 'score' ? `${profileUrl}/point-status` :
      profileUrl.replace('/world/character/', '/world/character/adventure/');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let reader;
    try {
      const response = await fetch(url, {
        method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error',
        referrer: profileUrl, referrerPolicy: 'same-origin',
        headers: { Accept: 'application/json, text/plain, */*' }, signal: controller.signal,
      });
      if (!response.ok) throw new Error(`공식 프로필 요청 실패 (HTTP ${response.status})`);
      if (!response.body) throw new Error('공식 응답이 비어 있습니다.');
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = ''; let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 4 * 1024 * 1024) throw new Error('공식 응답 크기 제한을 초과했습니다.');
        text += decoder.decode(chunk.value, { stream: true });
      }
      return { ok: true, text: text + decoder.decode(), url, profileUrl };
    } catch (error) {
      if (controller.signal.aborted) throw new Error('공식 추가 정보 요청 시간 초과 (12초)');
      throw error;
    } finally {
      clearTimeout(timer); controller.abort();
      if (reader) await reader.cancel().catch(() => {});
    }
  }

  function renderProfileFrame(url) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      if (parsed.origin !== 'https://df.nexon.com' || !parsed.pathname.startsWith('/world/character/')) {
        reject(new Error('올바르지 않은 프로필 주소입니다.')); return;
      }
      const frame = element('iframe');
      frame.dataset.dfScouterFrame = 'true';
      frame.title = '선택한 캐릭터의 공식 프로필 조회';
      frame.tabIndex = -1;
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed!important;left:-10000px!important;top:-10000px!important;width:1px!important;height:1px!important;visibility:hidden!important;pointer-events:none!important;';
      let finished = false;
      let loaded = false;
      let poll;
      let limit;
      const finish = (value, error) => {
        if (finished) return;
        finished = true;
        clearInterval(poll); clearTimeout(limit);
        activeFrames.delete(cancel);
        frame.onload = null; frame.onerror = null; frame.remove();
        if (error) reject(error); else resolve(value);
      };
      const cancel = () => finish(null, new Error('페이지 이동으로 조회가 중단되었습니다.'));
      activeFrames.add(cancel);
      const check = () => {
        if (!loaded || finished) return;
        try {
          const doc = frame.contentDocument;
          if (doc?.readyState !== 'complete' || doc.location.href === 'about:blank') return;
          const data = P.parse(doc);
          if (data.fame !== null && data.equipment) finish({ data, profileUrl: parsed.href });
        } catch { /* Cross-origin/login redirects are handled by the deadline. */ }
      };
      frame.onload = () => { loaded = true; };
      frame.onerror = () => finish(null, new Error('공식 프로필 화면을 열지 못했습니다.'));
      poll = setInterval(check, 400);
      limit = setTimeout(() => { check(); if (!finished) finish(null, new Error('공식 프로필 화면 확인 시간 초과 (14초)')); }, 14000);
      const freshUrl = new URL(parsed);
      freshUrl.searchParams.set('_dfscouter', Date.now().toString(36));
      frame.src = freshUrl.href;
      document.body.append(frame);
    });
  }

  async function load(target, currentGeneration) {
    const warnings = [];
    let data;
    let profileUrl;
    try {
      const response = await request(target);
      profileUrl = response.profileUrl;
      data = P.parse(P.fragment(response.text));
      if (data.fame === null || !data.equipment) throw new Error('공식 HTML의 캐릭터 정보를 확인하지 못했습니다.');
    } catch (error) {
      if (hidden || currentGeneration !== generation) throw error;
      let response;
      try { response = await renderProfileFrame(profileUrl || profileAddress(target)); }
      catch (fallbackError) { throw new Error(`${error.message} / ${fallbackError.message}`); }
      data = response.data;
      profileUrl = response.profileUrl;
    }
    if (hidden || currentGeneration !== generation) throw new Error('페이지 이동으로 조회가 중단되었습니다.');
    const results = await Promise.allSettled([request(target, 'score'), request(target, 'adventure')]);
    const score = results[0];
    if (score.status === 'fulfilled') {
      try { data.equipmentScore = P.decodeScore(P.unwrap(score.value.text)); }
      catch { warnings.push('장비점수 응답을 판독하지 못했습니다.'); }
    } else warnings.push(`장비점수: ${score.reason.message}`);
    const adventure = results[1];
    if (adventure.status === 'fulfilled') {
      try { data.adventure.stamps = P.stamps(adventure.value.text); }
      catch { warnings.push('모험단 스탬프를 확인하지 못했습니다.'); }
    } else warnings.push(`모험단 스탬프: ${adventure.reason.message}`);
    return { data, profileUrl, at: Date.now(), warnings };
  }
  function profileAddress(target) {
    const servers = { '1': 'cain', '2': 'diregie', '3': 'siroco', '4': 'prey', '5': 'casillas', '6': 'hilder', '9': 'anton', '11': 'bakal' };
    if (!Object.hasOwn(servers, target.sv)) throw new Error('알 수 없는 서버입니다.');
    return `https://df.nexon.com/world/character/${servers[target.sv]}/${encodeURIComponent(target.key)}`;
  }

  function iconMetric(label, value, file) {
    const item = element('span', 'icon-metric');
    item.title = `${label}: ${value ?? '미확인'}`;
    item.setAttribute('aria-label', item.title);
    const icon = element('img', 'stat-icon');
    icon.src = chrome.runtime.getURL(`assets/${file}`);
    icon.alt = '';
    item.append(icon, element('span', `icon-value${value === null ? ' unavailable' : ''}`, value ?? '미확인'));
    return item;
  }
  function mistMetric(level) {
    const item = element('span', 'mist-badge');
    item.title = `안개서약: ${level === null ? '미확인' : `${level}레벨`}`;
    item.setAttribute('aria-label', item.title);
    const icon = element('img', 'mist-background');
    icon.src = chrome.runtime.getURL('assets/mist-level.png');
    icon.alt = '';
    item.append(icon, element('span', 'mist-value', level === null ? '?' : String(level)));
    return item;
  }
  function oathTone(points) {
    if (!Number.isFinite(points) || points < 750) return 'oath-muted';
    if (points < 1200) return 'oath-purple';
    if (points < 1650) return 'oath-magenta';
    if (points < 2100) return 'oath-orange';
    return 'oath-gradient';
  }
  function gearIcon(file, label) {
    const image = element('img', 'gear-icon');
    image.src = chrome.runtime.getURL(`assets/${file}`);
    image.alt = label; image.title = label;
    return image;
  }
  function renderSummary(state, model) {
    const snapshot = model?.snapshot;
    state.summary.hidden = !snapshot;
    if (!snapshot) return;
    const d = snapshot.data;
    const parts = [state.summaryStyle, element('span', 'summary-job', d.job || '직업 미확인'),
      iconMetric('모험가 명성', d.fame === null ? null : fmt(d.fame), 'fame.png'),
      iconMetric('장비점수', d.equipmentScore === null ? null : fmt(d.equipmentScore), 'equipment-score.png')];
    if (d.blackAbyss?.length) {
      const black = element('span', 'black-count');
      black.title = `흑아 장비: ${d.blackAbyss.join(', ')}`;
      black.append(gearIcon('black-abyss.png', '흑아 장비'), element('span', '', `x${d.blackAbyss.length}`));
      parts.push(black);
    }
    parts.push(uniqueIcons(d.uniqueEquipment));
    state.summaryRoot.replaceChildren(...parts);
  }
  function uniqueIcons(items) {
    const unique = element('span', 'unique-icons');
    unique.setAttribute('aria-label', items === null ? '유일장비 미확인' : `유일장비 ${items.length}개`);
    if (items === null) unique.append(element('span', 'unavailable', '유일 미확인'));
    else for (const item of items) {
      const title = `${item.name} (${item.slot}) · 정밀도 ${item.precisionRange || '미확인'}`;
      let icon;
      if (item.precisionAsset && Number.isInteger(item.precisionStage) && item.precisionStage >= 0 && item.precisionStage <= 4) {
        icon = gearIcon(item.precisionAsset, title);
      } else if (item.iconUrl && P.stampUrl(item.iconUrl)) {
        icon = element('img', 'gear-icon'); icon.src = item.iconUrl; icon.alt = title;
      } else icon = element('span', 'gear-icon unique-unknown', '?');
      icon.title = title; icon.setAttribute('aria-label', title);
      unique.append(icon);
    }
    return unique;
  }
  function renderPanel(state, model) {
    const snapshot = model?.snapshot;
    if (!snapshot) { state.panel.hidden = true; return; }
    state.panel.hidden = false;
    const d = snapshot.data;
    const card = element('section', `card${model.status === 'loading' ? ' refreshing' : ''}${model.status === 'error' ? ' stale' : ''}`);
    card.setAttribute('aria-label', `${d.name || state.name} 캐릭터 정보`);
    const time = element('time', 'time', `${new Date(snapshot.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} 조회`);
    time.dateTime = new Date(snapshot.at).toISOString();
    const equipmentLine = element('div', 'equipment-line');
    const averageTitle = d.averageAmplification === null ? '11부위 장비 정보를 모두 확인하지 못했습니다.' :
      `무기·칭호 제외 11부위 증폭 합계 ${d.amplificationTotal} ÷ 11. 강화·미증폭은 0.\n${d.amplificationSlots.map(item => `${item.slot} ${item.level}`).join(', ')}`;
    const equipmentGroup = element('span', 'equipment-group');
    equipmentGroup.append(element('span', 'set-name', d.setName || '미확인'));
    const average = element('span', 'average', d.averageAmplification === null ? '증폭 미확인' : `+${fmt(d.averageAmplification)}증폭`);
    average.title = averageTitle;
    equipmentGroup.append(average);
    const oath = element('span', 'oath-group');
    oath.append(element('span', `oath-name ${oathTone(d.oathPoints)}`, d.oathName || '미확인'),
      element('span', 'points', d.oathPoints === null ? '포인트 미확인' : `${fmt(d.oathPoints)} P`));
    const oathLine = element('div', 'oath-line');
    oathLine.append(oath);
    equipmentLine.append(equipmentGroup);
    const footer = element('div', 'footer');
    footer.append(element('span', 'clan', `모험단 ${d.adventure.level === null ? '레벨 미확인' : `Lv.${d.adventure.level}`} · ${d.adventure.name || '이름 미확인'}`), mistMetric(d.mistLevel));
    if (d.adventure.stamps?.length) {
      for (const stamp of d.adventure.stamps) {
        const image = element('img', 'stamp');
        image.src = stamp.src; image.alt = stamp.title || '모험단 스탬프';
        image.title = [stamp.title, stamp.description].filter(Boolean).join(' · ');
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => image.remove(), { once: true });
        footer.append(image);
      }
    }
    footer.append(time);
    if (model.status === 'loading') footer.append(element('span', 'status', '새 정보 조회 중'));
    if (model.status === 'error') footer.append(element('span', 'status', '갱신 실패 · 이전 조회 정보'));
    card.append(equipmentLine, oathLine, footer);
    if (snapshot.warnings.length || model.error) {
      card.append(element('div', 'note', [model.error, ...snapshot.warnings].filter(Boolean).join(' / ')));
    }
    state.panelRoot.replaceChildren(state.panelStyle, card);
  }

  function render(state, model) {
    renderSummary(state, model);
    const status = model?.status || 'idle';
    state.button.disabled = status === 'loading';
    state.button.dataset.state = status;
    state.button.textContent = status === 'loading' ? '조회중' : '캐릭터조회';
    state.button.setAttribute('aria-label', `${state.name} 캐릭터조회`);
    if (status === 'loading') state.button.setAttribute('aria-busy', 'true');
    else state.button.removeAttribute('aria-busy');
    state.button.title = model?.error || '누를 때마다 공식 프로필을 새로 조회하고, 같은 캐릭터의 모든 댓글에 표시합니다.';
    if (model?.error && !model.snapshot) {
      state.panel.hidden = false;
      const error = element('div', 'card note', `조회 실패 · ${model.error}`);
      error.setAttribute('role', 'status');
      state.panelRoot.replaceChildren(state.panelStyle, error);
    } else renderPanel(state, model);
  }

  async function clicked(event, el) {
    event.preventDefault(); event.stopImmediatePropagation();
    if (!event.isTrusted || hidden) return;
    syncPage();
    const target = identity(el);
    if (!target.sv || !target.key) return;
    const key = id(target);
    const previous = characters.get(key);
    if (previous?.status === 'loading') return;
    const token = Symbol();
    const model = { status: 'loading', snapshot: previous?.snapshot || null, error: null, token };
    characters.set(key, model);
    scan();
    const requestGeneration = generation;
    try {
      const snapshot = await load(target, requestGeneration);
      if (generation !== requestGeneration || characters.get(key)?.token !== token) return;
      characters.set(key, { status: 'success', snapshot, error: null, token });
    } catch (error) {
      if (generation !== requestGeneration || characters.get(key)?.token !== token) return;
      characters.set(key, { status: 'error', snapshot: model.snapshot, error: error.message, token });
    } finally { if (!hidden) scan(); }
  }

  function anchorFor(el) {
    let anchor = el;
    for (let node = el.nextSibling, count = 0; node && count < 7; node = node.nextSibling, count++) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches('.df-scouter-control, .df-scouter-panel, .df-scouter-summary')) continue;
      const text = node.textContent.trim();
      if (!text) continue;
      if (SERVER_TEXT.test(text)) anchor = node;
      break;
    }
    return anchor;
  }
  function enhance(el) {
    const target = identity(el);
    let state = states.get(el);
    if (!target.sv || !target.key) {
      if (state) { state.control.remove(); state.panel.remove(); state.summary.remove(); states.delete(el); }
      return;
    }
    if (!state) {
      const control = element('div', 'df-scouter-control');
      const controlRoot = shadow(control, BUTTON_CSS);
      const button = element('button', 'df-scouter-button', '캐릭터조회');
      button.type = 'button';
      controlRoot.append(button);
      const panel = element('div', 'df-scouter-panel');
      const panelRoot = shadow(panel, COMPACT_PANEL_CSS);
      const summary = element('div', 'df-scouter-summary');
      const summaryRoot = shadow(summary, SUMMARY_CSS);
      summary.hidden = true;
      panel.hidden = true;
      panel.setAttribute('aria-live', 'polite');
      state = { control, button, panel, panelRoot, panelStyle: panelRoot.firstChild, summary, summaryRoot, summaryStyle: summaryRoot.firstChild, renderedModel: undefined, target: null, name: '' };
      states.set(el, state);
      button.addEventListener('click', event => clicked(event, el));
      panelRoot.addEventListener('click', event => event.stopPropagation());
    }
    const key = id(target);
    const name = el.getAttribute('data-characname') || el.textContent.trim() || '캐릭터';
    const model = characters.get(key);
    const nameStyle = getComputedStyle(el);
    state.control.style.setProperty('--df-scouter-font', nameStyle.fontFamily);
    state.panel.style.setProperty('--df-scouter-font', nameStyle.fontFamily);
    state.summary.style.setProperty('--df-scouter-font', nameStyle.fontFamily);
    state.summary.style.setProperty('--df-scouter-name-size', nameStyle.fontSize);
    const anchor = anchorFor(el);
    const serverStyle = getComputedStyle(anchor.nodeType === Node.ELEMENT_NODE ? anchor : el);
    state.summary.style.setProperty('--df-scouter-server-color', serverStyle.color);
    state.summary.style.setProperty('--df-scouter-server-size', serverStyle.fontSize);
    state.summary.style.setProperty('--df-scouter-server-weight', serverStyle.fontWeight);
    const floating = nameStyle.cssFloat === 'left' || (anchor.nodeType === Node.ELEMENT_NODE && getComputedStyle(anchor).cssFloat === 'left');
    state.summary.classList.toggle('df-scouter-float', floating);
    if (anchor.nextSibling !== state.summary) anchor.after(state.summary);
    // Keep the site's existing li order: name/header, body, date remain unchanged.
    const header = el.closest('li') || el.parentElement;
    const list = header.tagName === 'LI' && header.parentElement.tagName === 'UL' ? header.parentElement : null;
    const rows = list ? [...list.children].filter(row => row.tagName === 'LI') : [];
    const footer = rows.find(row => row !== header && row.querySelector('.cmt_blind_a, .cmt_report_a')) ||
      (rows.length > 1 ? rows[rows.length - 1] : header);
    const actions = [...footer.querySelectorAll('a,button')].filter(node =>
      node.matches('.cmt_blind_a, .cmt_report_a') || /^(?:신고|차단)$/u.test(node.textContent.trim()));
    const lastAction = actions[actions.length - 1];
    state.control.style.setProperty('--df-scouter-action-size', getComputedStyle(lastAction || el).fontSize);
    const footerAnchor = lastAction || (footer === header ? state.summary : null);
    state.control.classList.toggle('df-scouter-float', footerAnchor ? getComputedStyle(footerAnchor).cssFloat === 'left' : floating);
    if (footerAnchor) { if (footerAnchor.nextSibling !== state.control) footerAnchor.after(state.control); }
    else if (state.control.parentElement !== footer || footer.lastElementChild !== state.control) footer.append(state.control);
    if (state.panel.parentElement !== header || header.lastElementChild !== state.panel) header.append(state.panel);
    if (state.renderedModel !== model || state.target !== key || state.name !== name) {
      state.target = key; state.name = name; state.renderedModel = model;
      render(state, model);
    }
  }
  function scan() {
    scanTimer = null;
    syncPage();
    document.querySelectorAll(SELECTOR).forEach(enhance);
  }
  function syncPage() {
    if (location.pathname !== pagePath) {
      pagePath = location.pathname;
      generation++;
      characters.clear();
      for (const cancel of [...activeFrames]) cancel();
    }
  }
  function owned(node) {
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return !!el?.closest('.df-scouter-control, .df-scouter-panel, .df-scouter-summary, iframe[data-df-scouter-frame]');
  }
  const observer = new MutationObserver(records => {
    const relevant = records.some(record => {
      if (owned(record.target)) return false;
      if (record.type === 'attributes') return true;
      return [...record.addedNodes].some(node => !owned(node)) ||
        [...record.removedNodes].some(node => !owned(node) ||
          (node.nodeType === Node.ELEMENT_NODE && node.matches('.df-scouter-control, .df-scouter-panel, .df-scouter-summary')));
    });
    if (relevant && scanTimer === null) scanTimer = setTimeout(scan, 100);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-sv', 'data-key', 'data-characname', 'class'] });
  scan();
  window.addEventListener('popstate', scan);
  window.addEventListener('pagehide', () => {
    hidden = true; generation++;
    for (const cancel of [...activeFrames]) cancel();
    for (const [key, model] of characters) {
      if (model.status === 'loading') characters.set(key, { ...model, status: 'error', error: '페이지 이동으로 조회가 중단되었습니다.' });
    }
  });
  window.addEventListener('pageshow', () => { hidden = false; scan(); });
})();
