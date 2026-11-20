// Look and feel in one place — Google Classroom's current (Material 3, "Google") look, measured from the real pages:
// page background #F8FAFD, white panels, post cards #F0F4F9, "Your work" panels #E9EEF6, text #1F1F1F / #444746 / #747775,
// links and primary buttons #0B57D0, "missing" red #B3261E, "done" green #146C2E, hairlines #DADCE0, Google Sans type.
import { Platform, StyleSheet } from 'react-native';
import { niceCourse } from './util';

export const T = {
  bg: '#F8FAFD', card: '#FFFFFF', tonal: '#F0F4F9', tonal2: '#E9EEF6',
  ink: '#1F1F1F', text: '#1F1F1F', sub: '#444746', faint: '#747775', disabled: '#1F1F1F61',
  line: '#DADCE0', hair: '#E3E3E3', soft: '#F0F4F9', fill: '#1F1F1F14',
  brand: '#0B57D0', brandDark: '#0842A0', brandSoft: '#D3E3FD', brandOn: '#001D35', brandContainer: '#C2E7FF', brandContainerOn: '#004A77',
  green: '#146C2E', greenSoft: '#C4EED0', greenFill: '#1E8E3E',
  red: '#B3261E', redSoft: '#F9DEDC', redFill: '#B3261E',
  amber: '#8B5000', amberSoft: '#FFDCBE', amberFill: '#E8710A',
  violet: '#5629A4', violetSoft: '#EEDCFE',
  radius: 16, radiusSm: 8, pad: 16,
};

// Backwards-compatible names used by older helpers.
export const C = { blue: T.brand, blueDark: T.brandDark, bg: T.bg, card: T.card, line: T.line, text: T.text, sub: T.sub, green: T.green, red: T.red, amber: T.amber };

export const shadow = Platform.select({
  web: { boxShadow: '0 1px 3px rgba(60, 64, 67, 0.3), 0 4px 8px 3px rgba(60, 64, 67, 0.15)' },
  default: { shadowColor: '#3C4043', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6 },
});
export const shadowSm = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)' },
  default: { shadowColor: '#3C4043', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
});

// Every class gets a colour like Classroom's class themes: a tonal background, a dark text/icon colour on it, and a strong
// colour for avatars. Picked by a stable hash of the class name. (bg/fg pairs are the ones Classroom itself uses.)
const TONES = [
  { bg: '#D0E4FF', fg: '#0B57D0', solid: '#1A73E8' }, // blue
  { bg: '#FFD8EF', fg: '#B60D6E', solid: '#D01884' }, // pink
  { bg: '#EEDCFE', fg: '#5629A4', solid: '#8E4EC6' }, // purple
  { bg: '#BEEFBB', fg: '#146C2E', solid: '#1E8E3E' }, // green
  { bg: '#C6EEF0', fg: '#00696D', solid: '#12A4AF' }, // teal
  { bg: '#FFDCC2', fg: '#A04100', solid: '#E8710A' }, // orange
  { bg: '#FFE9A0', fg: '#7A5900', solid: '#F9AB00' }, // yellow
  { bg: '#E3E3E3', fg: '#1B1B1C', solid: '#5F6368' }, // grey
];
const hash = (name = '') => { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return h; };

// What Classroom itself says about the classes — its own order, each section line and the two colours of its round badge — read off
// its side menu by the PC and carried here in the state record. Set once per render by the app shell; until it arrives (or for a
// class it does not list) the colour comes from a hash of the name and the order is alphabetical.
let CLS = { byName: new Map(), byId: new Map(), list: [] };
export function setClassMeta(list) {
  const byName = new Map(), byId = new Map(), out = [];
  (Array.isArray(list) ? list : []).forEach((c, k) => {
    if (!c || !c.name) return;
    const m = { id: c.id || '', name: niceCourse(c.name), sec: c.sec || '', bg: c.bg || '', fg: c.fg || '', k };
    byName.set(m.name, m); if (m.id) byId.set(m.id, m); out.push(m);
  });
  CLS = { byName, byId, list: out };
}
export const classMeta = (name) => CLS.byName.get(niceCourse(name)) || null;
export const classMetaList = () => CLS.list;
export const classTone = (name) => {
  const m = classMeta(name);
  if (m && m.bg && m.fg) return { bg: m.bg, fg: m.fg, solid: m.fg };
  return TONES[hash(name) % TONES.length];
};
export const classPair = (name) => { const t = classTone(name); return [t.solid, t.fg]; }; // older call sites
export const courseColor = (name) => classTone(name).solid;

// Account-style avatar colours (a person's initial on a coloured circle).
const AVATARS = ['#E8710A', '#455A64', '#1E8E3E', '#A142F4', '#12B5CB', '#D93025', '#1A73E8', '#B80672'];
export const avatarColor = (name) => AVATARS[hash(String(name || '')) % AVATARS.length];

export const hair = StyleSheet.hairlineWidth;
// Classroom's own breakpoints (measured on the real site): from ~1040 px up the menu is a permanent sidebar (300 wide, open to begin
// with, shrinking to a 76 wide icon rail when you press ☰); below that it is a pop-over (304 wide) over a dimmed page.
export const WIDE = 1040;   // iPad in landscape and up
export const SIDEBAR = 300; // the open sidebar
export const RAIL = 76;     // the sidebar shrunk to icons
export const BAR_BREAK = 700; // from here up the top bar carries the Classroom logo and the "Classroom › class" breadcrumb
