// Кошик, журнал конфліктів, історія версій.
import * as store from '../store.js';
import * as sync from '../sync.js';
import { t, relTime, locale } from '../i18n.js';
import { esc, icon, h, $, modal, confirmBox, toast, shortDate } from '../ui.js';
import { plainText } from '../md.js';
import { nowISO } from '../util.js';

export function renderTrash(el, st, ctx) {
  const list = store.trash();
  el.innerHTML = `<div class="trash card"><div class="card-h"><h3>${t('trash.title')}</h3>${list.length ? `<button class="btn-text danger" data-empty>${t('trash.emptyAll')}</button>` : ''}</div>
    <p class="help">${t('trash.note')}</p>
    ${list.length ? list.map(e => `<div class="row static"><span class="row-main"><span class="row-title">${esc(e.title || t('entry.untitled'))}</span><span class="row-meta"><span>${esc(relTime(e.deletedAt))}</span><span>${esc(plainText(e.body || '', true).slice(0, 80))}</span></span></span>
      <button class="btn sm" data-restore="${esc(e.space + '|' + e.id)}">${t('trash.restore')}</button><button class="icon-btn" data-forever="${esc(e.space + '|' + e.id)}" title="${t('trash.forever')}">${icon('trash')}</button></div>`).join('') : `<p class="empty-t">${t('trash.empty')}</p>`}</div>`;
  el.onclick = async e => {
    const r = e.target.closest('[data-restore]'); if (r) { const [s, id] = r.dataset.restore.split('|'); await store.restoreEntry(s, id); return; }
    const f = e.target.closest('[data-forever]'); if (f) { const [s, id] = f.dataset.forever.split('|'); await store.purgeEntry(s, id); return; }
    if (e.target.closest('[data-empty]') && await confirmBox(t('trash.confirmAll'), t('trash.emptyAll'), true)) await store.emptyTrash();
  };
}

export async function renderConflicts(el, st, ctx) {
  const list = await sync.getConflicts();
  const fname = f => ({ '*': t('entry.title'), body: t('nav.notes'), title: t('entry.title'), date: t('entry.date'), time: t('entry.time'), deleted: t('entry.delete'), 'deleted-remote': t('entry.delete') }[f] || f);
  el.innerHTML = `<div class="card"><h3>${t('conf.title')}</h3>
    ${list.length ? list.map(c => `<div class="conf">
      <div class="conf-h"><b>${esc(c.title || t('entry.untitled'))}</b><span class="muted">${esc(relTime(c.at))}</span></div>
      <p>${esc(t('conf.desc', { t: c.title || t('entry.untitled'), w: c.winner === 'local' ? t('conf.local') : t('conf.remote') }))}</p>
      <p class="muted">${esc(t('conf.fields', { f: c.fields.map(fname).join(', ') }))}</p>
      ${c.other ? `<details><summary>${t('misc.show')}</summary><pre class="conf-pre">${esc((c.other.title ? c.other.title + '\n\n' : '') + (c.other.body || ''))}</pre></details>` : ''}
      <div class="row-end">${c.other ? `<button class="btn sm" data-crestore="${c.id}">${t('conf.restore')}</button>` : ''}<button class="btn-text sm" data-cdismiss="${c.id}">${t('conf.dismiss')}</button></div>
    </div>`).join('') : `<p class="empty-t">${t('conf.empty')}</p>`}</div>`;
  el.onclick = async e => {
    const d = e.target.closest('[data-cdismiss]'); if (d) { await sync.dismissConflict(d.dataset.cdismiss); ctx.rerender(); return; }
    const r = e.target.closest('[data-crestore]'); if (r) {
      const c = list.find(x => x.id === r.dataset.crestore); if (!c || !c.other) return;
      const { updatedAt, updatedBy, ...data } = c.other;
      if (c.kind === 'subject') await store.updateSubject(c.space, c.recId, data);
      else if (store.entry(c.space, c.recId)) await store.updateEntry(c.space, c.recId, data);
      else await store.createEntry({ ...data }, c.space);
      await sync.dismissConflict(c.id); toast(t('conf.restored')); ctx.rerender();
    }
  };
}

export async function showHistory(e, ctx) {
  const body = h(`<div class="hist"><p class="muted">${t('hist.loading')}</p></div>`);
  const m = modal(t('hist.title'), body, { wide: true });
  const sp = store.space(e.space);
  if (!sp || !sp.remote) { body.innerHTML = `<p class="empty-t">${t('hist.empty')}</p>`; return; }
  if (!navigator.onLine) { body.innerHTML = `<p class="empty-t">${t('hist.offline')}</p>`; return; }
  const path = `entries/${e.id}.md`;
  let list;
  try { list = await sync.history(e.space, path); } catch (err) { body.innerHTML = `<p class="empty-t">${esc(err.message)}</p>`; return; }
  if (!list || !list.length) { body.innerHTML = `<p class="empty-t">${t('hist.empty')}</p>`; return; }
  body.innerHTML = `<div class="hist-grid"><div class="hist-list">${list.map((c, i) => `<button class="hist-i ${i === 0 ? 'on' : ''}" data-sha="${c.sha}"><b>${esc(new Date(c.date).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</b><span>${esc(c.author || '')}${i === 0 ? ' · ' + t('hist.current') : ''}</span></button>`).join('')}</div><div class="hist-view"></div></div>`;
  const view = $('.hist-view', body);
  const show = async sha => {
    view.innerHTML = `<p class="muted">${t('hist.loading')}</p>`;
    try {
      const v = await sync.versionAt(e.space, path, sha);
      const isCur = sha === list[0].sha;
      view.innerHTML = `<h4>${esc(v.title || t('entry.untitled'))}</h4><pre class="conf-pre">${esc(v.body || '')}</pre>${isCur ? '' : `<button class="btn primary" data-restore-v>${t('hist.restore')}</button>`}`;
      const b = $('[data-restore-v]', view);
      if (b) b.onclick = async () => {
        const { id, createdAt, createdBy, updatedAt, updatedBy, ...rest } = v;
        const cur = store.entry(e.space, e.id) || {};
        const clear = Object.fromEntries(Object.keys(cur).filter(k => !(k in rest) && !['id', 'space', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'].includes(k)).map(k => [k, null]));
        await store.updateEntry(e.space, e.id, { ...clear, ...rest, deletedAt: null });
        m.close(); toast(t('hist.restored', { d: new Date(list.find(x => x.sha === sha).date).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }));
        ctx.reopen && ctx.reopen();
      };
    } catch (err) { view.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  };
  body.addEventListener('click', ev => { const b = ev.target.closest('[data-sha]'); if (!b) return; body.querySelectorAll('.hist-i').forEach(x => x.classList.toggle('on', x === b)); show(b.dataset.sha); });
  show(list[0].sha);
}
