// Look and feel in one place: colours, class colour pairs, shadows, sizes.
import { Platform, StyleSheet } from 'react-native';

export const T = {
  bg: '#F2F4F9', card: '#FFFFFF', ink: '#0F172A', text: '#1E293B', sub: '#5A6577', faint: '#8B95A7',
  line: '#E2E7F0', soft: '#EEF1F7',
  brand: '#1F5FEE', brandDark: '#1746B8', brandSoft: '#E7EEFE',
  green: '#0C9A66', greenSoft: '#E1F6EC', red: '#DC2F3E', redSoft: '#FDEBED', amber: '#C96A04', amberSoft: '#FEF2DA',
  violet: '#6D3FE0', violetSoft: '#EFE9FD',
  radius: 18, radiusSm: 12, pad: 16,
};

// Backwards-compatible names used by older helpers.
export const C = { blue: T.brand, blueDark: T.brandDark, bg: T.bg, card: T.card, line: T.line, text: T.text, sub: T.sub, green: T.green, red: T.red, amber: T.amber };

export const shadow = Platform.select({
  web: { boxShadow: '0 6px 18px rgba(15, 30, 80, 0.07)' },
  default: { shadowColor: '#0B1B4A', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
});
export const shadowSm = Platform.select({
  web: { boxShadow: '0 2px 8px rgba(15, 30, 80, 0.06)' },
  default: { shadowColor: '#0B1B4A', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
});

// Every class gets a colour pair (a gradient), picked by a stable hash of its name.
const PAIRS = [
  ['#1F5FEE', '#4F8BFF'], ['#0C9A66', '#2BC48A'], ['#D9541E', '#F2913A'], ['#6D3FE0', '#9B77F5'],
  ['#D02670', '#EE5FA0'], ['#0B7FA8', '#27B4D9'], ['#A85A08', '#D98A1F'], ['#3F4BD8', '#7480F2'],
];
const hash = (name = '') => { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return h; };
export const classPair = (name) => PAIRS[hash(name) % PAIRS.length];
export const courseColor = (name) => classPair(name)[0];

export const hair = StyleSheet.hairlineWidth;
export const WIDE = 900; // from this width up: sidebar layout (iPad landscape, big iPad portrait)
