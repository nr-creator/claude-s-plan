// Налаштування: вигляд, простори і GitHub, перенесення, імпорт/експорт, дані.
import * as store from '../store.js';
import * as sync from '../sync.js';
import { t, relTime, getLang } from '../i18n.js';
import { esc, icon, h, $, $$, modal, confirmBox, toast, cvar, spaceLabel, COLORS, spaceIcon, spaceColor, popover, SPACE_ICONS } from '../ui.js';
import { GhError } from '../github.js';

export const VERSION = '1.3.0';

export function render(el, st, ctx) {
  const S = store.settings;
  const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(S[key]) === String(v) ? 'on' : ''}" data-set="${key}" data-val="${v}">${esc(l)}</button>`).join('')}</div>`;
  const stat = sync.status();
  const cnt = store.entries({ all: true }).length;
  let html = `<div class="settings">
    <section class="card"><h3>${t('set.look')}</h3>
      <div class="set-row"><span>${t('set.lang')}</span>${seg('lang', [['uk', 'Українська'], ['en', 'English']])}</div>
      <label class="set-row chk"><span>${t('set.notify')}</span><span class="switch"><input type="checkbox" data-set-chk="notify" ${S.notify ? 'checked' : ''}><i></i></span></label>
      <div class="set-list"><button class="set-link" data-go="#/appearance">${icon('sun')}<span>${t('set.lookLink')}</span>${icon('right')}</button></div>
    </section>
    ${qaSection(S, seg)}
    <section class="card"><h3>${t('set.spaces')}</h3>
      <div class="spaces">${store.spaces.map(s => spaceCard(s, stat[s.id] || {})).join('')}</div>
      <button class="btn" data-sp-add>${icon('plus')}${t('set.addSpace')}</button>
      <p class="help">${esc(t('space.help'))}</p>
    </section>
    <section class="card"><h3>${t('set.data')}</h3>
      <div class="set-list">
        <button class="set-link" data-go="transfer">${icon('qr')}<span>${t('set.transfer')}</span>${icon('right')}</button>
        <button class="set-link" data-go="import">${icon('download')}<span>${t('set.import')}</span>${icon('right')}</button>
        <button class="set-link" data-go="export">${icon('upload')}<span>${t('set.export')}</span>${icon('right')}</button>
        <button class="set-link" data-go="#/trash">${icon('trash')}<span>${t('nav.trash')}</span>${icon('right')}</button>
        <button class="set-link" data-go="#/conflicts">${icon('alert')}<span>${t('conf.title')}</span>${icon('right')}</button>
        ${ctx.canInstall() ? `<button class="set-link" data-go="install">${icon('download')}<span>${t('set.install')}</span>${icon('right')}</button>` : ''}
      </div>
      <p class="help" data-persist>${t('set.storage', { n: cnt })}</p>
    </section>
    <section class="card"><h3>${t('set.about')}</h3><p class="help">${t('set.version', { v: VERSION })}</p></section>
  </div>`;
  el.innerHTML = html;
  if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(p => { const x = $('[data-persist]', el); if (x) x.textContent += ' · ' + (p ? t('set.persist') : t('set.persistNo')); });

  el.onclick = async e => {
    const s = e.target.closest('[data-set]');
    if (s) { const k = s.dataset.set; let v = s.dataset.val; if (k === 'weekStart') v = +v; ctx.setSetting(k, v); return; }
    if (e.target.closest('[data-sp-add]')) { spaceForm(null, ctx); return; }
    const ed = e.target.closest('[data-sp-edit]'); if (ed) { spaceForm(store.space(ed.dataset.spEdit), ctx); return; }
    const vis = e.target.closest('[data-sp-vis]'); if (vis) { store.toggleSpaceVisible(vis.dataset.spVis); ctx.rerender(); return; }
    const sy = e.target.closest('[data-sp-sync]'); if (sy) { sync.syncAll(); return; }
    const qc = e.target.closest('[data-qsp-color]'); if (qc) { spaceColorPop(qc, qc.closest('[data-qsp]').dataset.qsp, ctx); return; }
    const qi = e.target.closest('[data-qsp-icon]'); if (qi) { spaceIconPop(qi, qi.closest('[data-qsp]').dataset.qsp, ctx); return; }
    const g = e.target.closest('[data-go]'); if (g) {
      const v = g.dataset.go;
      if (v.startsWith('#')) ctx.go(v);
      else if (v === 'transfer') ctx.transfer();
      else if (v === 'import') ctx.importIcs();
      else if (v === 'export') ctx.exportIcs();
      else if (v === 'install') ctx.install();
    }
  };
  el.onchange = e => {
    const sel = e.target.closest('[data-set-sel]'); if (sel) ctx.setSetting(sel.dataset.setSel, +sel.value);
    const chk = e.target.closest('[data-set-chk]'); if (chk) ctx.setSetting(chk.dataset.setChk, chk.checked);
    const sh = e.target.closest('[data-qsp-show]'); if (sh) {
      const id = sh.closest('[data-qsp]').dataset.qsp;
      const hid = new Set(store.settings.qaHidden || []);
      sh.checked ? hid.delete(id) : hid.add(id);
      // Хоча б один простір лишається в рядку
      if (store.spaces.every(s => hid.has(s.id))) { hid.delete(id); sh.checked = true; }
      ctx.setSetting('qaHidden', [...hid]);
    }
  };
}

// Швидке додавання: як поводяться кнопки і як виглядає кожен простір
function qaSection(S, seg) {
  const multi = store.spaces.length > 1;
  const hid = new Set(S.qaHidden || []);
  const style = s => { const c = spaceColor(s); return `--c:${c};--on:${c === 'var(--accent)' ? 'var(--on-accent)' : 'var(--surface)'}`; };
  const rows = store.spaces.map(s => `<div class="qa-sp" data-qsp="${s.id}">
      <span class="qa-go" style="${style(s)}">${icon(spaceIcon(s))}</span>
      <b>${esc(spaceLabel(s))}</b>
      <button type="button" class="btn sm" data-qsp-color style="--c:${spaceColor(s)}"><i class="dot"></i>${t('qa.color')}</button>
      <button type="button" class="btn sm" data-qsp-icon>${icon(spaceIcon(s))}${t('qa.icon')}</button>
      ${multi ? `<label class="switch" title="${esc(t('space.show'))}"><input type="checkbox" data-qsp-show ${hid.has(s.id) ? '' : 'checked'}><i></i></label>` : ''}
    </div>`).join('');
  return `<section class="card"><h3>${t('set.qa')}</h3>
      ${multi ? `<div class="set-row"><span>${t('qa.mode')}<small>${esc(t('qa.modeHint'))}</small></span>${seg('qaMode', [['buttons', t('qa.mode.buttons')], ['menu', t('qa.mode.menu')]])}</div>` : ''}
      <label class="set-row chk"><span>${t('qa.labels')}<small>${esc(t('qa.labelsHint'))}</small></span><span class="switch"><input type="checkbox" data-set-chk="qaLabels" ${S.qaLabels ? 'checked' : ''}><i></i></span></label>
      <div class="set-row qa-sp-h"><span>${t('qa.spaces')}</span></div>
      <div class="qa-sp-list">${rows}</div>
      <p class="help">${esc(t('qa.spacesHint'))}</p>
    </section>`;
}
const patchSpace = (id, patch) => store.saveSpaces(store.spaces.map(x => x.id === id ? { ...x, ...patch } : x));
function spaceColorPop(btn, id, ctx) {
  const s = store.space(id); const cur = !s.color || s.color === 'ink' ? 'accent' : s.color;
  const box = h(`<div class="color-pop"><div class="swatches">${['accent', ...COLORS].map(c => `<button type="button" class="sw ${cur === c ? 'on' : ''}" data-col="${c}" style="--c:${cvar(c)}" title="${c === 'accent' ? esc(t('qa.accent')) : c}" aria-label="${c === 'accent' ? esc(t('qa.accent')) : c}"></button>`).join('')}</div></div>`);
  const p = popover(btn, box);
  box.addEventListener('click', e => { const b = e.target.closest('[data-col]'); if (!b) return; p.close(); patchSpace(id, { color: b.dataset.col }); ctx.rerender(); });
}
function spaceIconPop(btn, id, ctx) {
  const s = store.space(id); const cur = spaceIcon(s);
  const box = h(`<div class="icon-pop">${SPACE_ICONS.map(n => `<button type="button" class="icon-btn ${cur === n ? 'on' : ''}" data-ic="${n}" aria-label="${n}">${icon(n)}</button>`).join('')}</div>`);
  const p = popover(btn, box);
  box.addEventListener('click', e => { const b = e.target.closest('[data-ic]'); if (!b) return; p.close(); patchSpace(id, { icon: b.dataset.ic }); ctx.rerender(); });
}

function spaceCard(s, st) {
  const r = s.remote;
  const hidden = store.hiddenSpaces.has(s.id);
  let line;
  if (!r) line = `<span class="muted">${t('space.local')}</span>`;
  else if (st.status === 'error') line = `<span class="err">${icon('alert')}${esc(errText(st.error))}</span>`;
  else if (st.status === 'syncing') line = `<span class="muted">${t('sync.syncing')}</span>`;
  else line = `<span class="muted">${esc(t('space.connected', { r: r.owner + '/' + r.repo }))}${s.login ? ' · ' + esc(s.login) : ''} · ${st.lastSync ? esc(t('sync.last', { t: relTime(st.lastSync) })) : esc(t('sync.never'))}${st.pending ? ' · ' + esc(t('sync.pending', { n: st.pending })) : ''}</span>`;
  return `<div class="space-card" style="--c:${spaceColor(s)}">
    <i class="space-sw"></i>
    <div class="space-main"><b>${icon(spaceIcon(s))}${esc(spaceLabel(s))}</b>${line}</div>
    <div class="space-act">
      ${r ? `<button class="icon-btn" data-sp-sync title="${t('sync.now')}">${icon('sync')}</button>` : ''}
      ${store.spaces.length > 1 ? `<button class="btn-text sm" data-sp-vis="${s.id}">${hidden ? t('space.show') : t('space.hide')}</button>` : ''}
      <button class="btn sm" data-sp-edit="${s.id}">${r ? t('space.edit') : t('first.connect')}</button>
    </div></div>`;
}

export function errText(err) {
  if (!err) return '';
  if (err.code === '401') return t('sync.err.401');
  if (err.code === '403') return t('sync.err.403');
  if (err.code === '404') return t('sync.err.404');
  if (err.code === 'rate') return t('sync.err.rate');
  if (err.code === 'net') return t('sync.err.net');
  return t('sync.err.other', { m: err.message || err.code });
}

// Форма простору: назва, тип, репозиторій, токен. Перевіряє доступ перед збереженням.
export function spaceForm(s, ctx) {
  const isNew = !s;
  const r = (s && s.remote) || {};
  s = s || { id: 'sp-' + Math.random().toString(36).slice(2, 8), name: '', kind: store.spaces.some(x => x.kind === 'personal') ? 'shared' : 'personal', color: 'teal', remote: null };
  const body = h(`<form class="form">
    <div class="form-2"><label>${t('space.name')}<input name="name" value="${esc(s.name || '')}" placeholder="${esc(s.kind === 'shared' ? t('space.shared') : t('space.mine'))}"></label>
    <div class="field"><span>${t('space.kind')}</span><div class="seg"><button type="button" data-kind="personal" class="${s.kind === 'personal' ? 'on' : ''}">${icon('lock')}${t('space.kind.personal')}</button><button type="button" data-kind="shared" class="${s.kind === 'shared' ? 'on' : ''}">${icon('users')}${t('space.kind.shared')}</button></div></div></div>
    <div class="field"><span>${t('space.color')}</span><div class="swatches">${['accent', ...COLORS].map(c => `<button type="button" class="sw ${c === (!s.color || s.color === 'ink' ? 'accent' : s.color) ? 'on' : ''}" data-c="${c}" style="--c:${cvar(c)}" aria-label="${c === 'accent' ? esc(t('qa.accent')) : c}"></button>`).join('')}</div></div>
    <label>${t('space.repo')}<input name="repo" value="${esc(r.owner ? r.owner + '/' + r.repo : '')}" placeholder="${esc(t('space.repoPh'))}" autocomplete="off" spellcheck="false" autocapitalize="off"></label>
    <label>${t('space.token')}<div class="pw"><input name="token" type="password" value="${esc(r.token || '')}" placeholder="${esc(t('space.tokenPh'))}" autocomplete="off" spellcheck="false"><button type="button" class="icon-btn sm" data-showpw aria-label="${t('misc.show')}">${icon('search')}</button></div></label>
    <p class="help">${esc(t('space.help'))}</p>
    <p class="form-msg" aria-live="polite"></p>
    <div class="row-end">
      ${!isNew ? `<button type="button" class="btn-text danger" data-remove>${t('space.remove')}</button><span class="grow"></span>` : ''}
      ${!isNew && s.remote ? `<button type="button" class="btn" data-disconnect>${t('space.disconnect')}</button>` : ''}
      <button type="button" class="btn" data-cancel>${t('misc.cancel')}</button>
      <button class="btn primary">${t('space.check')}</button>
    </div></form>`);
  let kind = s.kind, color = s.color || 'teal';
  const m = modal(isNew ? t('set.addSpace') : spaceLabel(s), body, { wide: true });
  const msg = $('.form-msg', body);
  body.addEventListener('click', async e => {
    const k = e.target.closest('[data-kind]'); if (k) { kind = k.dataset.kind; $$('[data-kind]', body).forEach(x => x.classList.toggle('on', x === k)); }
    const c = e.target.closest('[data-c]'); if (c) { color = c.dataset.c; $$('.sw', body).forEach(x => x.classList.toggle('on', x === c)); }
    if (e.target.closest('[data-showpw]')) { const i = $('[name=token]', body); i.type = i.type === 'password' ? 'text' : 'password'; }
    if (e.target.closest('[data-cancel]')) m.close();
    if (e.target.closest('[data-disconnect]')) { store.saveSpaces(store.spaces.map(x => x.id === s.id ? { ...x, remote: null, login: null } : x)); await sync.resetSpaceMeta(s.id); m.close(); ctx.rerender(); }
    if (e.target.closest('[data-remove]')) {
      if (!(await confirmBox(t('space.removeConfirm', { s: spaceLabel(s) }), t('misc.delete'), true))) return;
      const keys = [...store.allRecs()].filter(x => x.space === s.id).map(x => x.key);
      await store.removeRecs(keys);
      await sync.resetSpaceMeta(s.id);
      let rest = store.spaces.filter(x => x.id !== s.id);
      if (!rest.length) rest = [{ id: 'local', name: '', kind: 'personal', color: 'ink', remote: null }];
      store.saveSpaces(rest); m.close(); ctx.rerender();
    }
  });
  body.onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(body);
    const name = f.get('name').trim();
    const repoStr = f.get('repo').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    const token = f.get('token').trim();
    const base = { ...s, name, kind, color };
    if (!repoStr && !token) { save({ ...base, remote: null }); return; }
    const [owner, repo] = repoStr.split('/');
    if (!owner || !repo || !token) { msg.className = 'form-msg err'; msg.textContent = t('sync.err.404'); return; }
    msg.className = 'form-msg'; msg.textContent = t('space.checking');
    try {
      const res = await sync.check({ owner, repo, token });
      msg.className = 'form-msg ok'; msg.textContent = t('space.ok', { u: res.login, r: res.fullName });
      const changedRepo = !s.remote || s.remote.owner !== owner || s.remote.repo !== repo;
      if (changedRepo) await sync.resetSpaceMeta(s.id);
      setTimeout(() => save({ ...base, login: res.login, remote: { owner, repo, token, branch: res.branch } }), 700);
    } catch (err) {
      msg.className = 'form-msg err';
      msg.textContent = errText(err instanceof GhError ? { code: err.code, message: err.message } : { code: 'other', message: err.message });
    }
  };
  function save(ns) {
    const list = isNew ? [...store.spaces, ns] : store.spaces.map(x => x.id === s.id ? ns : x);
    store.saveSpaces(list); m.close(); ctx.rerender();
  }
}
