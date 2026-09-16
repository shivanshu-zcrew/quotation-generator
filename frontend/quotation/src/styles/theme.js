// Design tokens shared by the quotation dashboards (Admin/Home/Ops) and
// SharedComponents. Previously redefined byte-for-byte (plus a couple of
// extra keys in SharedComponents) in four separate files — consolidated
// here as a superset so none of the existing usages lose a key.
export const T = {
  canvas: '#f6f7f8',
  surface: '#ffffff',
  ink: '#1b1d1e',
  inkSoft: '#646a6e',
  inkFaint: '#9aa0a4',
  line: '#e8eaec',
  lineSoft: '#f0f1f3',
  accent: '#2563c4',
  accentSoft: '#e6f0fb',
  accentInk: '#1d63c4',
  // vivid status hues (cool chrome, readable states)
  red: '#c1352b',
  redSoft: '#fdeceb',
  redLine: '#f8d6d2',
  green: '#0f7a52',
  greenSoft: '#e3f5ee',
  greenLine: '#c3ebda',
  blueInk: '#1d63c4',
  blueSoft: '#e6f0fb',
  blueLine: '#c9defa',
  shadow: '0 1px 2px rgba(20,22,24,0.04), 0 8px 24px -12px rgba(20,22,24,0.10)',
  radius: 16,
  radiusSm: 10,
};

export const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export const SHIMMER = `linear-gradient(90deg, ${T.lineSoft} 25%, ${T.line} 50%, ${T.lineSoft} 75%)`;
