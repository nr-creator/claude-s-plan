// Перенесення налаштувань між пристроями: посилання/QR з просторами й токенами.
// Дані пакуються, стискаються і (якщо задано PIN) шифруються AES-GCM ключем із PIN через PBKDF2.
// Усе після «#» в адресі браузер нікуди не надсилає, тому код не потрапляє на сервер.
import * as store from './store.js';
import { t } from './i18n.js';
import { utf8, fromUtf8, b64url, fromB64url } from './util.js';
import { h, $, modal, toast, esc } from './ui.js';
import { qrSvg } from './qr.js';

const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
async function keyFrom(pin, salt) {
  const base = await crypto.subtle.importKey('raw', utf8(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function pack(pin) {
  const payload = { v: 1, spaces: store.spaces.filter(s => s.remote).map(({ id, name, kind, color, remote, login }) => ({ id, name, kind, color, remote, login })), lang: store.settings.lang };
  const z = await pipe(utf8(JSON.stringify(payload)), new CompressionStream('deflate-raw'));
  if (!pin) return b64url(new Uint8Array([0, ...z]));
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(pin, salt), z));
  return b64url(new Uint8Array([1, ...salt, ...iv, ...ct]));
}
export async function unpack(code, pin) {
  const b = fromB64url(code);
  let z;
  if (b[0] === 0) z = b.slice(1);
  else { const salt = b.slice(1, 17), iv = b.slice(17, 29), ct = b.slice(29); z = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await keyFrom(pin || '', salt), ct)); }
  return JSON.parse(fromUtf8(await pipe(z, new DecompressionStream('deflate-raw'))));
}
export const isEncrypted = code => fromB64url(code)[0] === 1;

export function showTransfer(ctx) {
  const body = h(`<div class="form"><p class="help">${esc(t('tr.desc'))}</p>
    <label>${t('tr.pin')}<input inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="off" class="tr-pin"></label>
    <div class="row-end"><button class="btn primary" data-make>${t('tr.make')}</button></div>
    <div class="qr-box" hidden></div></div>`);
  modal(t('tr.title'), body);
  $('[data-make]', body).onclick = async () => {
    const pin = $('.tr-pin', body).value.trim();
    if (pin && pin.length < 4) { $('.tr-pin', body).focus(); return; }
    const code = await pack(pin);
    const url = location.origin + location.pathname + '#setup=' + code;
    const box = $('.qr-box', body); box.hidden = false;
    box.innerHTML = `${qrSvg(url, url.length > 1200 ? 'L' : 'M')}<button class="btn" data-copy>${t('tr.copy')}</button>`;
    $('[data-copy]', box).onclick = async () => { try { await navigator.clipboard.writeText(url); toast(t('tr.copied')); } catch { prompt('', url); } };
  };
}

export async function importSetup(code, ctx) {
  let pin = null;
  if (isEncrypted(code)) {
    pin = await new Promise(res => {
      const body = h(`<form class="form"><label>${t('tr.in.pin')}<input inputmode="numeric" class="tr-pin" autofocus></label><p class="form-msg err" hidden>${t('tr.in.bad')}</p><div class="row-end"><button class="btn primary">${t('misc.ok')}</button></div></form>`);
      const m = modal(t('tr.in.title'), body, { onClose: () => res(null) });
      body.onsubmit = async e => {
        e.preventDefault(); const p = $('.tr-pin', body).value.trim();
        try { await unpack(code, p); res(p); m.close(); } catch { $('.form-msg', body).hidden = false; }
      };
    });
    if (pin === null) return;
  }
  let data; try { data = await unpack(code, pin); } catch { toast(t('tr.in.bad')); return; }
  const incoming = data.spaces || [];
  const ok = await new Promise(res => {
    const body = h(`<div><p>${esc(t('tr.in.desc', { n: incoming.length }))}</p><ul>${incoming.map(s => `<li>${esc(s.name || (s.kind === 'shared' ? t('space.shared') : t('space.mine')))} — ${esc(s.remote.owner + '/' + s.remote.repo)}</li>`).join('')}</ul><div class="row-end"><button class="btn" data-n>${t('misc.cancel')}</button><button class="btn primary" data-y>${t('tr.in.apply')}</button></div></div>`);
    const m = modal(t('tr.in.title'), body, { onClose: () => res(false) });
    $('[data-n]', body).onclick = () => m.close();
    $('[data-y]', body).onclick = () => { res(true); m.close(); };
  });
  if (!ok) return;
  let list = store.spaces.slice();
  for (const s of incoming) {
    const same = list.find(x => x.remote && x.remote.owner === s.remote.owner && x.remote.repo === s.remote.repo);
    if (same) { Object.assign(same, { remote: s.remote, login: s.login }); continue; }
    // Локальний простір без GitHub на цьому пристрої стає особистим простором з іншого пристрою
    const bare = s.kind === 'personal' && list.find(x => !x.remote && x.kind === 'personal');
    if (bare) { Object.assign(bare, { name: s.name, color: s.color, remote: s.remote, login: s.login }); continue; }
    list.push({ ...s, id: list.some(x => x.id === s.id) ? s.id + '-' + Math.random().toString(36).slice(2, 5) : s.id });
  }
  if (data.lang && data.lang !== store.settings.lang) ctx.setLang(data.lang);
  store.saveSpaces(list);
  localStorage.setItem('plan.welcomed', '1');
  toast(t('tr.in.done'));
}
