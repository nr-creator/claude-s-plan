// Вигляд застосунку. Усі параметри — звичайні значення в налаштуваннях;
// apply() перетворює їх на CSS-змінні на <html>, тож зміна видна миттєво, без перезавантаження.

export const ACCENTS = [
  ['blue', '#3b82f6'], ['indigo', '#6366f1'], ['violet', '#8b5cf6'], ['pink', '#ec4899'], ['red', '#ef4444'],
  ['orange', '#f97316'], ['amber', '#f59e0b'], ['green', '#22c55e'], ['emerald', '#10b981'], ['teal', '#14b8a6'],
  ['sky', '#0ea5e9'], ['graphite', '#71717a'],
];

// Нейтральні палітри: фон, поверхні, текст, лінії. Відтінок фону: нейтральний, холодний, теплий.
const NEUTRAL = {
  light: {
    neutral: { bg: '#f7f7f8', s1: '#ffffff', s2: '#f1f1f3', s3: '#e7e7ea', ink: '#18181b', ink2: '#3f3f46', muted: '#71717a', line: '#e6e6ea', line2: '#d4d4d8' },
    cool: { bg: '#f5f7fa', s1: '#ffffff', s2: '#eef2f6', s3: '#e3e8ef', ink: '#0f172a', ink2: '#334155', muted: '#64748b', line: '#e2e8f0', line2: '#cbd5e1' },
    warm: { bg: '#f8f7f4', s1: '#fffefc', s2: '#f2f0ec', s3: '#e7e4df', ink: '#1c1917', ink2: '#44403c', muted: '#78716c', line: '#e7e5e2', line2: '#d6d3d1' },
  },
  dark: {
    neutral: { bg: '#0f0f11', s1: '#17171a', s2: '#1f1f23', s3: '#29292e', ink: '#ededf0', ink2: '#c6c6cd', muted: '#8b8b95', line: '#26262b', line2: '#34343b' },
    cool: { bg: '#0b0f19', s1: '#111726', s2: '#182033', s3: '#212a40', ink: '#e6eaf2', ink2: '#bac3d5', muted: '#8691a8', line: '#1e2639', line2: '#2b3550' },
    warm: { bg: '#12100e', s1: '#1a1816', s2: '#23201d', s3: '#2d2925', ink: '#efebe7', ink2: '#cdc5bd', muted: '#978e85', line: '#28241f', line2: '#36312b' },
  },
};
const OLED = { bg: '#000000', s1: '#0b0b0c', s2: '#151517', s3: '#1f1f22' };

export const DEFAULTS = {
  preset: 'standard', mode: 'auto', black: false, contrast: false, accent: '#3b82f6', tint: 'neutral',
  density: 'comfortable', radius: 'soft', font: 'system', scale: 100, eventStyle: 'tinted', hourHeight: 52,
  showWeekends: true, weekNumbers: false, sideMini: true, sideSubjects: true, sideSpaces: true, sideCollapsed: false,
  quickAdd: 'top', motion: true, subjectColors: 'vivid',
};

// Пресети: стартова точка, яку далі можна підкрутити
export const PRESETS = {
  standard: { mode: 'auto', black: false, contrast: false, accent: '#3b82f6', tint: 'neutral', density: 'comfortable', radius: 'soft', font: 'system', eventStyle: 'tinted' },
  minimal: { mode: 'light', black: false, contrast: false, accent: '#18181b', tint: 'neutral', density: 'compact', radius: 'sharp', font: 'system', eventStyle: 'outline' },
  midnight: { mode: 'dark', black: false, contrast: false, accent: '#8b5cf6', tint: 'cool', density: 'comfortable', radius: 'soft', font: 'system', eventStyle: 'tinted' },
  warm: { mode: 'light', black: false, contrast: false, accent: '#f97316', tint: 'warm', density: 'spacious', radius: 'round', font: 'rounded', eventStyle: 'tinted' },
  oled: { mode: 'dark', black: true, contrast: false, accent: '#0ea5e9', tint: 'neutral', density: 'comfortable', radius: 'soft', font: 'system', eventStyle: 'solid' },
  contrast: { mode: 'auto', black: false, contrast: true, accent: '#2563eb', tint: 'neutral', density: 'comfortable', radius: 'soft', font: 'system', eventStyle: 'solid' },
};

const FONTS = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Ubuntu, Cantarell, "Helvetica Neue", Arial, sans-serif',
  inter: '"Inter Variable", Inter, "Inter Display", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  rounded: '"SF Pro Rounded", "Nunito", "Varela Round", "Quicksand", "Comfortaa", ui-rounded, system-ui, sans-serif',
  serif: '"Iowan Old Style", Charter, "Noto Serif", "Source Serif Pro", Georgia, Cambria, serif',
  mono: 'ui-monospace, "JetBrains Mono", "Cascadia Code", "Noto Sans Mono", "DejaVu Sans Mono", Consolas, monospace',
};
const DENSITY = {
  compact: { row: '34px', pad: '14px', gap: '6px', ctl: '30px', rail: '232px' },
  comfortable: { row: '42px', pad: '20px', gap: '10px', ctl: '34px', rail: '252px' },
  spacious: { row: '50px', pad: '28px', gap: '14px', ctl: '38px', rail: '272px' },
};
const RADIUS = { sharp: [2, 4, 6], soft: [6, 9, 12], round: [10, 14, 20] };

const hexRgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return [59, 130, 246]; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrastRatio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const toHex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');

export const isDark = a => a.mode === 'dark' || (a.mode === 'auto' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);

export function tokens(a) {
  a = { ...DEFAULTS, ...a };
  const dark = isDark(a);
  const n = { ...NEUTRAL[dark ? 'dark' : 'light'][a.tint] || NEUTRAL.light.neutral };
  if (dark && a.black) Object.assign(n, OLED);
  if (a.contrast) {
    if (dark) Object.assign(n, { ink: '#ffffff', ink2: '#e4e4e7', muted: '#b4b4bc', line: '#3f3f46', line2: '#52525b' });
    else Object.assign(n, { ink: '#000000', ink2: '#18181b', muted: '#3f3f46', line: '#c4c4cc', line2: '#a1a1aa' });
  }
  // Акцент: якщо колір майже зливається з фоном (чорний акцент на темній темі), підсвітлюємо його
  let acc = hexRgb(a.accent);
  const bg = hexRgb(n.s1);
  let guard = 0;
  while (contrastRatio(acc, bg) < 2.6 && guard++ < 12) acc = mix(acc, dark ? [255, 255, 255] : [0, 0, 0], 0.12);
  const onAccent = contrastRatio(acc, [255, 255, 255]) >= 2.9 ? '#ffffff' : '#111111';
  // Колір акценту для тексту і посилань: має читатися на поверхні
  let accText = acc; guard = 0;
  while (contrastRatio(accText, bg) < 4.2 && guard++ < 12) accText = mix(accText, dark ? [255, 255, 255] : [0, 0, 0], 0.1);
  const d = DENSITY[a.density] || DENSITY.comfortable;
  const r = RADIUS[a.radius] || RADIUS.soft;
  return {
    '--bg': n.bg, '--surface': n.s1, '--surface-2': n.s2, '--surface-3': n.s3,
    '--ink': n.ink, '--ink-2': n.ink2, '--muted': n.muted, '--line': n.line, '--line-2': n.line2,
    '--accent': toHex(acc), '--accent-text': toHex(accText), '--on-accent': onAccent,
    '--font': FONTS[a.font] || FONTS.system,
    '--row': d.row, '--pad': d.pad, '--gap': d.gap, '--ctl': d.ctl, '--rail': d.rail,
    '--r-sm': r[0] + 'px', '--r': r[1] + 'px', '--r-lg': r[2] + 'px',
    '--hh': (a.hourHeight || 52) + 'px',
    'font-size': (a.scale || 100) + '%',
    'color-scheme': dark ? 'dark' : 'light',
  };
}

export function apply(a) {
  a = { ...DEFAULTS, ...a };
  const el = document.documentElement;
  const tk = tokens(a);
  for (const [k, v] of Object.entries(tk)) el.style.setProperty(k, v);
  el.dataset.theme = isDark(a) ? 'dark' : 'light';
  el.dataset.events = a.eventStyle;
  el.dataset.density = a.density;
  el.dataset.subjects = a.subjectColors;
  el.classList.toggle('no-motion', !a.motion);
  el.classList.toggle('hc', !!a.contrast);
  el.classList.toggle('oled', isDark(a) && !!a.black);
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = tk['--bg'];
}
