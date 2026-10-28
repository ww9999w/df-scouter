(() => {
  'use strict';
  const SLOTS = ['무기', '상의', '머리어깨', '하의', '벨트', '신발', '목걸이', '팔찌', '반지', '보조장비', '마법석', '귀걸이', '칭호'];
  const UNIQUE_NAMES = new Set(['우아한 기품의 향수', '영롱한 날씨의 큐브', '만병을 잉태한 역병의 심장', '광휘를 머금은 눈동자']);
  const UNIQUE_ICONS = Object.freeze({
    '우아한 기품의 향수': { prefix: 'o_', asset: 'perfume' },
    '영롱한 날씨의 큐브': { prefix: 'only-cube-', asset: 'cube' },
    '만병을 잉태한 역병의 심장': { prefix: 'only-disease-', asset: 'heart' },
    '광휘를 머금은 눈동자': { prefix: 'only-michaela-', asset: 'eye' },
  });
  const PRECISION_CODES = ['0', '1', '2', '3', '100'];
  const PRECISION_RANGES = ['0~24%', '25~49%', '50~74%', '75~99%', '100%'];
  const clean = value => String(value ?? '').replace(/\s+/gu, ' ').trim();
  function number(value) {
    const text = clean(value);
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return null;
    const result = Number(text.replace(/,/g, ''));
    return Number.isSafeInteger(result) && result >= 0 && result <= 1e12 ? result : null;
  }
  function fragment(html) {
    const template = document.createElement('template');
    // Downloaded markup is inspected here only; it is never inserted into the page.
    template.innerHTML = html;
    return template.content;
  }
  function fame(doc) {
    const card = doc.querySelector('#detailCardCaptureArea dd.fame');
    const field = card || doc.querySelector('dd.fame');
    if (!field) return null;
    const span = field.querySelector(':scope > p:not(.equi):not(.buff) > span');
    let value;
    if (span) value = clean(span.textContent);
    else {
      const copy = field.cloneNode(true);
      copy.querySelectorAll('.equi, .buff, #equipment-point, canvas').forEach(node => node.remove());
      value = clean(copy.textContent).replace(/^(?:모험가\s*명성|명성)\s*/u, '').replace(/\s*점$/u, '').trim();
    }
    return value === '-' ? 0 : number(value);
  }
  function equipment(doc) {
    const area = doc.querySelector('#equipmentArea');
    if (!area) return null;
    const items = [];
    for (const row of area.querySelectorAll(':scope > ul')) {
      const cell = row.querySelector(':scope > li.equipment_layer');
      const icon = cell?.querySelector('.ico_blank');
      const slotClass = [...(icon?.classList || [])].find(name => /^equi\d{2}$/.test(name));
      const slotIndex = slotClass ? Number(slotClass.slice(4)) - 1 : -1;
      if (slotIndex < 0 || slotIndex >= SLOTS.length) continue;
      const nameEl = cell.querySelector('.itemmore .original') || cell.querySelector('.itemmore [class*="item_c"]');
      const upgradeText = clean(row.lastElementChild?.textContent);
      const match = upgradeText.match(/^\+?(\d+)\s*(강화|증폭)$/u);
      const name = clean(nameEl?.textContent);
      const precision = uniquePrecision(name, icon);
      items.push({
        slot: SLOTS[slotIndex], slotIndex, name, id: cell.getAttribute('data-id'),
        kind: match ? match[2] : (/^(?:-|없음|미강화|0)$/u.test(upgradeText) ? '없음' : null),
        level: match ? number(match[1]) : (/^(?:-|없음|미강화|0)$/u.test(upgradeText) ? 0 : null),
        classes: [...(nameEl?.classList || [])],
        blackAbyss: /^흑아\s*[:：]/u.test(name),
        unique: UNIQUE_NAMES.has(name),
        ...precision,
      });
    }
    return items;
  }
  function parse(doc) {
    const items = equipment(doc);
    const averageSlots = items?.filter(item => item.slotIndex >= 1 && item.slotIndex <= 11) || [];
    const fullEquipment = items?.length === 13 && new Set(items.map(item => item.slotIndex)).size === 13 &&
      items.every(item => item.name.length > 0);
    const averageComplete = averageSlots.length === 11 && new Set(averageSlots.map(item => item.slotIndex)).size === 11 &&
      averageSlots.every(item => item.kind !== null && item.level !== null);
    const total = averageSlots.reduce((sum, item) => sum + (item.kind === '증폭' ? item.level : 0), 0);
    const set = doc.querySelector('#equipmentArea .more_equi.openly_set');
    const oath = doc.querySelector('#equipmentArea .more_equi.openly_pledge');
    const oathMatch = clean(oath?.textContent).match(/서약\s*포인트\s*[:：]\s*([\d,]+)/u);
    return {
      name: clean(doc.querySelector('#detailCardCaptureArea dd.name')?.textContent) || null,
      job: job(doc),
      fame: fame(doc),
      equipment: items,
      weapon: items?.find(item => item.slotIndex === 0) || null,
      averageAmplification: averageComplete ? total / 11 : null,
      amplificationTotal: averageComplete ? total : null,
      amplificationSlots: averageSlots.map(item => ({ slot: item.slot, level: item.kind === null ? null : item.kind === '증폭' ? item.level : 0 })),
      setName: clean(set?.querySelector('a')?.textContent) || null,
      oathName: clean(oath?.querySelector('a')?.textContent) || null,
      oathPoints: oathMatch ? number(oathMatch[1]) : null,
      blackAbyss: fullEquipment ? items.filter(item => item.blackAbyss).map(item => item.slot) : null,
      uniqueEquipment: fullEquipment ? items.filter(item => item.unique).map(item => ({
        slot: item.slot, name: item.name, iconUrl: item.iconUrl,
        precisionStage: item.precisionStage, precisionRange: item.precisionRange, precisionAsset: item.precisionAsset,
      })) : null,
      mistLevel: number(doc.querySelector('#mistAssimilation_level')?.textContent),
      equipmentScore: null,
      scoreType: (doc.querySelector('#detailCardCaptureArea dd.fame #equipment-point') ||
        doc.querySelector('dd.fame #equipment-point'))?.classList.contains('buff') ? 'buff' : 'equipment',
      adventure: adventure(doc),
    };
  }
  function uniquePrecision(name, icon) {
    const result = { iconUrl: null, precisionStage: null, precisionRange: null, precisionAsset: null };
    if (!Object.hasOwn(UNIQUE_ICONS, name) || !icon) return result;
    const config = UNIQUE_ICONS[name];
    // Prefer the displayed item icon over a hidden hover/fusion alternative.
    const images = [...icon.querySelectorAll('img')].sort((a, b) => Number(a.classList.contains('toggleimg-hide')) - Number(b.classList.contains('toggleimg-hide')));
    for (const image of images) {
      for (const attribute of ['src', 'data-src', 'data-original', 'data-sf-original-src']) {
        const raw = image.getAttribute(attribute);
        if (!raw) continue;
        let url;
        try { url = new URL(raw, 'https://df.nexon.com'); } catch { continue; }
        if (url.protocol !== 'https:' || url.hostname !== 'resource.df.nexon.com' || url.username || url.password || url.port) continue;
        const path = '/ui/img/web/equipment/';
        if (!url.pathname.startsWith(path)) continue;
        const file = url.pathname.slice(path.length);
        if (!file.startsWith(config.prefix) || !file.endsWith('.png') || file.includes('/')) continue;
        const code = file.slice(config.prefix.length, -4);
        result.iconUrl = url.href;
        const stage = PRECISION_CODES.indexOf(code);
        if (stage < 0) return result;
        return { iconUrl: url.href, precisionStage: stage, precisionRange: PRECISION_RANGES[stage], precisionAsset: `${config.asset}-${stage}.png` };
      }
    }
    return result;
  }
  function adventure(doc) {
    const group = clean(doc.querySelector('#adventureInfoArea .chargroup')?.textContent).replace(/^모험단\s*/u, '');
    const match = group.match(/^Lv\.?\s*(\d+)\s*(.*)$/iu);
    return {
      name: match?.[2] || clean(doc.querySelector('#openAdventureInfoArea')?.textContent) || null,
      level: match ? number(match[1]) : null,
      stamps: null,
    };
  }
  function job(doc) {
    const field = doc.querySelector('#detailCardCaptureArea dd.job');
    if (field?.querySelector('i')) {
      let text = '';
      for (const node of field.childNodes) {
        if (node.nodeType === 1 && node.tagName === 'I') break;
        text += node.textContent;
      }
      return clean(text) || null;
    }
    return clean(doc.querySelector('#repJob')?.textContent) || null;
  }
  function unwrap(text) {
    const data = typeof text === 'string' ? JSON.parse(text) : text;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('공식 응답 형식이 올바르지 않습니다.');
    if (data.success === false) throw new Error('공식 프로필 서버가 조회 실패를 반환했습니다.');
    const body = data.body ?? data;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('공식 응답 본문이 비어 있습니다.');
    return body;
  }
  function stampUrl(raw) {
    try {
      const url = new URL(raw, 'https://df.nexon.com');
      return url.protocol === 'https:' && (url.hostname === 'df.nexon.com' || url.hostname.endsWith('.df.nexon.com')) ? url.href : null;
    } catch { return null; }
  }
  function stamps(text) {
    const body = unwrap(text);
    if (!Array.isArray(body.stampList)) throw new Error('공식 스탬프 목록을 확인하지 못했습니다.');
    // Match the official profile renderer: use the server's list and order.
    return body.stampList.map(item => {
      const src = stampUrl(item?.imageUrl);
      if (!src) throw new Error('공식 스탬프 이미지 주소를 확인하지 못했습니다.');
      return { src, title: clean(item.title), description: clean(item.description) };
    });
  }
  function decodeScore(payload) {
    // Public official canvas renderer, nameIndex.js (2026-10-28).
    // This is byte decoding of its response, never evaluation of downloaded code.
    if (!payload?.k || typeof payload.k.key !== 'string' || typeof payload.k.salt !== 'string' ||
        typeof payload.t !== 'boolean') throw new Error('장비점수 응답 형식이 변경되었습니다.');
    const encoded = payload.t ? payload.b : payload.a;
    if (typeof encoded !== 'string' || encoded.length > 4096 || payload.k.key.length > 1024 || payload.k.salt.length > 1024) {
      throw new Error('장비점수 응답 형식이 변경되었습니다.');
    }
    const key = atob(payload.k.key) + String.fromCharCode(94, 105, 48, 89, 125, 105, 88, 96, 45, 120, 42, 89);
    const saltLength = atob(payload.k.salt).length + 12;
    const keyBytes = new TextEncoder().encode(key);
    const bytes = Uint8Array.from(atob(encoded), (char, index) => char.charCodeAt(0) ^ keyBytes[index % keyBytes.length]);
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (decoded.length <= saltLength * 2) throw new Error('장비점수 응답이 비어 있습니다.');
    const result = number(decoded.substring(saltLength, decoded.length - saltLength));
    if (result === null) throw new Error('장비점수 응답을 판독하지 못했습니다.');
    return result;
  }
  globalThis.DFScouterProfile = Object.freeze({ parse, fragment, number, clean, stamps, stampUrl, unwrap, decodeScore, slots: SLOTS });
})();
