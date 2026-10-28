'use strict';

const ORIGIN = 'https://df.nexon.com';
const SERVERS = Object.freeze({
  '1': 'cain', '2': 'diregie', '3': 'siroco', '4': 'prey',
  '5': 'casillas', '6': 'hilder', '9': 'anton', '11': 'bakal',
});
const FETCH_TIMEOUT = 12000;
const MAX_BYTES = 4 * 1024 * 1024;
const CAPTURE_HOSTS = new Set(['df.nexon.com', 'resource.df.nexon.com', 'bbscdn.df.nexon.com',
  'avatar.df.nexon.com', 'img-api.neople.co.kr', 'fonts.googleapis.com', 'fonts.gstatic.com']);

async function captureResource(message) {
  const url = new URL(message.url);
  const extension = new URL(chrome.runtime.getURL('/'));
  const localAsset = url.protocol === 'chrome-extension:' && url.host === extension.host && /^\/assets\/[a-z0-9-]+\.png$/i.test(url.pathname);
  if (!localAsset && (url.protocol !== 'https:' || !CAPTURE_HOSTS.has(url.hostname) ||
      url.username || url.password || url.port)) throw new Error('캡쳐에 허용되지 않은 리소스 주소입니다.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let reader;
  try {
    const response = await fetch(url.href, { credentials: 'omit', redirect: 'error', signal: controller.signal });
    if (!response.ok || !response.body) throw new Error('캡쳐 리소스를 불러오지 못했습니다.');
    const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/^(?:image\/(?:png|jpeg|gif|webp|svg\+xml|avif|bmp|x-icon)|font\/[a-z0-9-]+|text\/css|application\/(?:octet-stream|font-woff|font-sfnt|vnd\.ms-fontobject))$/.test(mime)) {
      throw new Error('캡쳐에 사용할 수 없는 리소스 형식입니다.');
    }
    reader = response.body.getReader();
    const chunks = []; let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 8 * 1024 * 1024) throw new Error('캡쳐 리소스가 너무 큽니다.');
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let binary = '';
    for (let index = 0; index < bytes.length; index += 16384) binary += String.fromCharCode(...bytes.subarray(index, index + 16384));
    return { ok: true, dataUrl: `data:${mime};base64,${btoa(binary)}`, size };
  } finally {
    clearTimeout(timer); controller.abort();
    if (reader) await reader.cancel().catch(() => {});
  }
}

// Migration only. Profile results are never written to or read from storage.
chrome.storage.local.remove('dfScouterClickCacheV1').catch(() => {});

function targetOf(message) {
  const sv = String(message.sv);
  const key = message.key;
  if (!Object.hasOwn(SERVERS, sv) || typeof key !== 'string' || !key.length ||
      key.length > 512 || /[\s\u0000-\u001f\u007f]/u.test(key)) {
    throw new Error('캐릭터의 서버 또는 식별 정보를 확인할 수 없습니다.');
  }
  return { server: SERVERS[sv], key: encodeURIComponent(key) };
}

async function download(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  let reader;
  try {
    const response = await fetch(url, {
      method: 'GET', credentials: 'include', redirect: 'error', cache: 'no-store',
      headers: { Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`공식 프로필 요청 실패 (HTTP ${response.status})`);
    if (!response.body) throw new Error('공식 프로필 응답이 비어 있습니다.');
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('공식 프로필 응답 크기 제한을 초과했습니다.');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    if (controller.signal.aborted) throw new Error('공식 프로필 요청 시간 초과 (12초)');
    throw error;
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) await reader.cancel().catch(() => {});
  }
}

async function handle(message, sender) {
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 ||
      !sender.url || new URL(sender.url).origin !== ORIGIN) {
    throw new Error('허용되지 않은 요청입니다.');
  }
  if (message.type === 'DF_SCOUTER_CAPTURE_RESOURCE') return captureResource(message);
  const target = targetOf(message);
  const profileUrl = `${ORIGIN}/world/character/${target.server}/${target.key}`;
  const part = message.part || 'profile';
  if (part !== 'profile') throw new Error('허용되지 않은 프로필 항목입니다.');
  const url = profileUrl;
  const text = await download(url);
  return { ok: true, source: 'official', text, url, profileUrl };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!['DF_SCOUTER_LOOKUP', 'DF_SCOUTER_CAPTURE_RESOURCE'].includes(message?.type)) return;
  handle(message, sender).then(respond).catch(error => {
    respond({ ok: false, error: error.message || '공식 프로필을 확인하지 못했습니다.' });
  });
  return true;
});
