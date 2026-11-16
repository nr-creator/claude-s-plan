// «Вигляд»: пресети і тонке налаштування. Кожна зміна застосовується до всього застосунку одразу.
import * as store from '../store.js';
import { t } from '../i18n.js';
import { ACCENTS, PRESETS, DEFAULTS, tokens } from '../theme.js';
import { esc, icon, $$, confirmBox } from '../ui.js';

const PRESET_KEYS = Object.keys(PRESETS.standard);

export function render(el, st, ctx) {
  const L = store.settings.look, S = store.settings;
  const seg = (key, opts, src = 'look') => `<div class="seg" role="radiogroup">${opts.map(([v, l, ic]) => `<button role="radio" aria-checked="${String((src === 'look' ? L : S)[key]) === String(v)}" class="${String((src === 'look' ? L : S)[key]) === String(v) ? 'on' : ''}" data-${src}="${key}" data-val="${esc(String(v))}">${ic ? icon(ic) : ''}${esc(l)}</button>`).join('')}</div>`;
  const sw = (key, src = 'look') => `<label class="switch"><input type="checkbox" data-${src}-chk="${key}" ${(src === 'look' ? L : S)[key] ? 'checked' : ''}><i></i></label>`;
  const row = (label, hint, control) => `<div class="look-row"><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span>${control}</div>`;
  const range = (key, min, max, step, unit) => `<div class="range"><input type="range" min="${min}" max="${max}" step="${step}" value="${L[key]}" data-look-range="${key}" aria-label="${esc(key)}"><output>${L[key]}${unit}</output></div>`;
  const preview = k => {
    const tk = tokens({ ...L, ...PRESETS[k] });
    return `<span class="pv" style="--pv-bg:${tk['--bg']};--pv-s1:${tk['--surface']};--pv-line:${tk['--line']};--pv-ink:${tk['--ink']};--pv-acc:${tk['--accent']};--pv-r:${tk['--r-sm']}"><span class="pv-side"><i></i><i></i><i></i><i></i></span><span class="pv-main"><b></b><i></i><i></i></span></span>`;
  };
  const isCustomAccent = !ACCENTS.some(([, hex]) => hex.toLowerCase() === (L.accent || '').toLowerCase());

  el.innerHTML = `<div class="look">
    <section class="card look-sec"><h3>${t('look.presets')}</h3>
      <div class="presets">${Object.keys(PRESETS).map(k => `<button class="preset ${L.preset === k ? 'on' : ''}" data-preset="${k}">${preview(k)}<span>${esc(t('look.preset.' + k))}</span></button>`).join('')}</div>
      <p class="help">${esc(t('look.presetsHelp'))}</p>
    </section>

    <section class="card look-sec"><h3>${t('look.colors')}</h3>
      <div class="look-grid">
        ${row(t('look.mode'), '', seg('mode', [['auto', t('set.theme.auto')], ['light', t('set.theme.light'), 'sun'], ['dark', t('set.theme.dark'), 'moon']]))}
        ${row(t('look.tint'), t('look.tintHint'), seg('tint', [['neutral', t('look.tint.neutral')], ['cool', t('look.tint.cool')], ['warm', t('look.tint.warm')]]))}
        ${row(t('look.black'), t('look.blackHint'), sw('black'))}
        ${row(t('look.contrast'), t('look.contrastHint'), sw('contrast'))}
        ${row(t('look.subjects'), '', seg('subjectColors', [['vivid', t('look.subjects.vivid')], ['soft', t('look.subjects.soft')]]))}
      </div>
      <div class="look-row accent-row"><span>${t('look.accent')}<small>${esc(t('look.accentHint'))}</small></span>
        <div class="swatches">${ACCENTS.map(([n, hex]) => `<button class="sw ${hex.toLowerCase() === (L.accent || '').toLowerCase() ? 'on' : ''}" style="--c:${hex}" data-accent="${hex}" aria-label="${esc(t('look.accent.' + n))}" title="${esc(t('look.accent.' + n))}"></button>`).join('')}
          <label class="sw-custom ${isCustomAccent ? 'on' : ''}" title="${esc(t('look.accentCustom'))}">${icon('plus')}<input type="color" value="${esc(L.accent)}" data-accent-pick aria-label="${esc(t('look.accentCustom'))}"></label></div>
      </div>
    </section>

    <section class="card look-sec"><h3>${t('look.sizeShape')}</h3>
      <div class="look-grid">
        ${row(t('look.scale'), t('look.scaleHint'), range('scale', 85, 125, 5, '%'))}
        ${row(t('look.density'), '', seg('density', [['compact', t('look.density.compact')], ['comfortable', t('look.density.comfortable')], ['spacious', t('look.density.spacious')]]))}
        ${row(t('look.radius'), '', seg('radius', [['sharp', t('look.radius.sharp')], ['soft', t('look.radius.soft')], ['round', t('look.radius.round')]]))}
        ${row(t('look.font'), t('look.fontHint'), `<select data-look-sel="font">${['system', 'inter', 'rounded', 'serif', 'mono'].map(f => `<option value="${f}" ${L.font === f ? 'selected' : ''}>${esc(t('look.font.' + f))}</option>`).join('')}</select>`)}
        ${row(t('set.noteFont'), '', seg('noteFont', [['sans', t('set.font.sans')], ['serif', t('set.font.serif')], ['mono', t('set.font.mono')]], 'set'))}
        ${row(t('set.noteWidth'), '', seg('noteWidth', [['normal', t('set.width.normal')], ['wide', t('set.width.wide')]], 'set'))}
      </div>
    </section>

    <section class="card look-sec"><h3>${t('nav.calendar')}</h3>
      <div class="look-grid">
        ${row(t('look.colorBy'), t('look.colorByHint'), seg('eventColorBy', [['subject', t('look.colorBy.subject')], ['space', t('look.colorBy.space')]]))}
        ${row(t('look.events'), '', seg('eventStyle', [['tinted', t('look.events.tinted')], ['solid', t('look.events.solid')], ['outline', t('look.events.outline')]]))}
        ${row(t('look.hour'), t('look.hourHint'), range('hourHeight', 32, 96, 4, 'px'))}
        ${row(t('look.weekends'), '', sw('showWeekends'))}
        ${row(t('look.weekNumbers'), '', sw('weekNumbers'))}
        ${row(t('set.weekStart'), '', seg('weekStart', [[1, t('dow.short.1')], [7, t('dow.short.7')]], 'set'))}
        ${row(t('set.startHour'), '', `<select data-set-sel="startHour">${Array.from({ length: 13 }, (_, i) => i + 5).map(hh => `<option value="${hh}" ${S.startHour === hh ? 'selected' : ''}>${String(hh).padStart(2, '0')}:00</option>`).join('')}</select>`)}
      </div>
    </section>

    <section class="card look-sec"><h3>${t('look.layout')}</h3>
      <div class="look-grid">
        ${row(t('look.start'), '', seg('view', [['agenda', t('nav.today')], ['cal', t('nav.calendar')], ['notes', t('nav.notes')]], 'set'))}
        ${row(t('look.quickAdd'), t('look.quickAddHint'), seg('quickAdd', [['top', t('look.quickAdd.top')], ['key', t('look.quickAdd.key')]]))}
        ${row(t('look.sideCollapsed'), 'Ctrl+\\', sw('sideCollapsed'))}
        ${row(t('look.sideMini'), '', sw('sideMini'))}
        ${row(t('look.sideSubjects'), '', sw('sideSubjects'))}
        ${row(t('look.sideSpaces'), '', sw('sideSpaces'))}
        ${row(t('look.motion'), '', sw('motion'))}
      </div>
    </section>
    <div class="row-end"><button class="btn-text danger" data-look-reset>${icon('undo')}${t('look.reset')}</button></div>
  </div>`;

  // Будь-яка ручна зміна поля пресета робить тему «своєю»
  const setLook = patch => {
    const next = { ...store.settings.look, ...patch };
    if (!('preset' in patch)) {
      const p = PRESETS[next.preset];
      if (p && PRESET_KEYS.some(k => String(p[k]) !== String(next[k]))) patch.preset = 'custom';
    }
    ctx.setLook(patch);
  };
  el.onclick = async e => {
    const p = e.target.closest('[data-preset]'); if (p) { ctx.setLook({ ...PRESETS[p.dataset.preset], preset: p.dataset.preset }); return; }
    const a = e.target.closest('[data-accent]'); if (a) { setLook({ accent: a.dataset.accent }); return; }
    const b = e.target.closest('[data-look]'); if (b) { let v = b.dataset.val; setLook({ [b.dataset.look]: v }); return; }
    const s = e.target.closest('[data-set]'); if (s) { let v = s.dataset.val; if (s.dataset.set === 'weekStart') v = +v; ctx.setSetting(s.dataset.set, v); return; }
    if (e.target.closest('[data-look-reset]') && await confirmBox(t('look.resetConfirm'), t('look.reset'), true)) ctx.setLook({ ...DEFAULTS });
  };
  el.onchange = e => {
    const c = e.target.closest('[data-look-chk]'); if (c) { setLook({ [c.dataset.lookChk]: c.checked }); return; }
    const sel = e.target.closest('[data-look-sel]'); if (sel) { setLook({ [sel.dataset.lookSel]: sel.value }); return; }
    const ss = e.target.closest('[data-set-sel]'); if (ss) { ctx.setSetting(ss.dataset.setSel, +ss.value); return; }
    const pick = e.target.closest('[data-accent-pick]'); if (pick) { setLook({ accent: pick.value }); }
  };
  // Повзунки й піпетка: живий попередній перегляд під час руху
  el.oninput = e => {
    const r = e.target.closest('[data-look-range]');
    if (r) { r.nextElementSibling.textContent = r.value + (r.dataset.lookRange === 'scale' ? '%' : 'px'); ctx.previewLook({ [r.dataset.lookRange]: +r.value }); return; }
    const pick = e.target.closest('[data-accent-pick]'); if (pick) ctx.previewLook({ accent: pick.value });
  };
  $$('[data-look-range]', el).forEach(r => r.addEventListener('change', () => setLook({ [r.dataset.lookRange]: +r.value })));
}
