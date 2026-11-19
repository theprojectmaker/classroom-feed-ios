// Look and feel in one place: an iOS palette (grouped grey background, white cards, system tint, hairlines),
// class colour pairs, shadows, sizes.
import { Platform, StyleSheet } from 'react-native';

export const T = {
  bg: '#F2F2F7', card: '#FFFFFF', ink: '#000000', text: '#1C1C1E', sub: '#636366', faint: '#8E8E93',
  line: '#C6C6C8', soft: '#EFEFF4', fill: '#7676801F',
  brand: '#007AFF', brandDark: '#0062CC', brandSoft: '#E5F1FF',
  // Text-safe shades (readable on white) with their soft backgrounds; the *Fill ones are for dots, badges and icons.
  green: '#248A3D', greenSoft: '#E3F6E8', greenFill: '#34C759',
  red: '#D70015', redSoft: '#FFEBEA', redFill: '#FF3B30',
  amber: '#B25000', amberSoft: '#FFF1DC', amberFill: '#FF9500',
  violet: '#5E5CE6', violetSoft: '#ECEBFD',
  radius: 14, radiusSm: 10, pad: 16,
};

// Backwards-compatible names used by older helpers.
export const C = { blue: T.brand, blueDark: T.brandDark, bg: T.bg, card: T.card, line: T.line, text: T.text, sub: T.sub, green: T.green, red: T.red, amber: T.amber };

export const shadow = Platform.select({
  web: { boxShadow: '0 8px 24px rgba(0, 0, 0, 0.10)' },
  default: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
});
export const shadowSm = Platform.select({
  web: { boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)' },
  default: { shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
});

// Every class gets a colour pair (a gradient), picked by a stable hash of its name.
const PAIRS = [
  ['#0A6CF0', '#4B9BFF'], ['#17914F', '#34C27B'], ['#D95B14', '#FF9442'], ['#6E45DC', '#9F84F6'],
  ['#D02A6C', '#F0669B'], ['#0A7F9E', '#2BB5D6'], ['#A2610A', '#D8932A'], ['#3D49D2', '#7682F2'],
];
const hash = (name = '') => { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return h; };
export const classPair = (name) => PAIRS[hash(name) % PAIRS.length];
export const courseColor = (name) => classPair(name)[0];

export const hair = StyleSheet.hairlineWidth;
export const WIDE = 900;    // from this width up: sidebar layout (iPad landscape, big iPad portrait)
export const SIDEBAR = 280; // width of that sidebar
