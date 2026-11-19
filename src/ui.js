// Shared building blocks: icons, cards, buttons, pills, headers, list rows.
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { T, classPair, hair, shadow, shadowSm } from './theme';
import { STATE_LABEL, fileExt, hasUpdate, isNew, isWork, postedLabel, shortDue, snippetOf, workState } from './util';

export * from './util';
export { LinearGradient };

export const Icon = ({ n, s = 22, c = T.text, style }) => <Ionicons name={n} size={s} color={c} style={style} />;

export const Card = ({ children, style, flat }) => <View style={[st.card, !flat && shadowSm, style]}>{children}</View>;

const BTN = {
  primary: { bg: T.brand, fg: '#fff' }, green: { bg: T.green, fg: '#fff' }, soft: { bg: T.brandSoft, fg: T.brand },
  outline: { bg: '#fff', fg: T.text, border: T.line }, ghost: { bg: 'transparent', fg: T.brand }, danger: { bg: T.redSoft, fg: T.red }, dark: { bg: T.ink, fg: '#fff' },
};
export function Btn({ label, onPress, kind = 'primary', icon, disabled, loading, small, style, iconRight }) {
  const k = BTN[kind] || BTN.primary;
  return (
    <Pressable onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [st.btn, small && st.btnSm, { backgroundColor: k.bg }, k.border && { borderWidth: 1, borderColor: k.border }, (disabled || loading) && { opacity: 0.5 }, pressed && { opacity: 0.8 }, style]}>
      {loading ? <ActivityIndicator size="small" color={k.fg} /> : icon ? <Icon n={icon} s={small ? 16 : 19} c={k.fg} /> : null}
      <Text style={[st.btnTxt, small && { fontSize: 13.5 }, { color: k.fg }]} numberOfLines={1}>{label}</Text>
      {iconRight ? <Icon n={iconRight} s={small ? 15 : 18} c={k.fg} /> : null}
    </Pressable>
  );
}

const TONES = {
  gray: [T.soft, T.sub], blue: [T.brandSoft, T.brand], green: [T.greenSoft, T.green], red: [T.redSoft, T.red],
  amber: [T.amberSoft, T.amber], violet: [T.violetSoft, T.violet], white: ['#ffffff33', '#fff'],
};
export function Pill({ label, tone = 'gray', icon, style }) {
  const [bg, fg] = TONES[tone] || TONES.gray;
  return (
    <View style={[st.pill, { backgroundColor: bg }, style]}>
      {icon ? <Icon n={icon} s={13} c={fg} /> : null}
      <Text style={[st.pillTxt, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export const SectionTitle = ({ title, right, style }) => (
  <View style={[st.secRow, style]}>
    <Text style={st.secTitle}>{title}</Text>
    {right}
  </View>
);

/** Top bar of a pushed screen. With `pair` it is filled with the class's colours. */
export function Header({ title, subtitle, onBack, right, pair }) {
  const fg = pair ? '#fff' : T.ink;
  const inner = (
    <View style={st.header}>
      {onBack ? <Pressable onPress={onBack} hitSlop={14} style={st.back}><Icon n="chevron-back" s={26} c={fg} /></Pressable> : null}
      <View style={{ flex: 1 }}>
        <Text style={[st.headerTitle, { color: fg }]} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={[st.headerSub, pair && { color: '#ffffffcc' }]} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
  return pair
    ? <LinearGradient colors={pair} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>{inner}</LinearGradient>
    : <View style={{ backgroundColor: T.bg }}>{inner}</View>;
}

/** Big title at the top of a main tab. */
export const LargeTitle = ({ title, subtitle, right }) => (
  <View style={st.large}>
    <View style={{ flex: 1 }}>
      <Text style={st.largeTitle} numberOfLines={1}>{title}</Text>
      {!!subtitle && <Text style={st.largeSub} numberOfLines={1}>{subtitle}</Text>}
    </View>
    {right}
  </View>
);

export function Seg({ options, value, onChange, style }) {
  return (
    <View style={[st.seg, style]}>
      {options.map((o) => {
        const [key, label, count] = Array.isArray(o) ? o : [o, o];
        const on = value === key;
        return (
          <Pressable key={key} onPress={() => onChange(key)} style={[st.segItem, on && st.segOn, on && shadowSm]}>
            <Text style={[st.segTxt, on && { color: T.ink, fontWeight: '700' }]} numberOfLines={1}>{label}{count ? `  ${count}` : ''}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const Chip = ({ label, on, onPress, color }) => (
  <Pressable onPress={onPress} style={[st.chip, on && { backgroundColor: color || T.ink, borderColor: color || T.ink }]}>
    <Text style={[st.chipTxt, on && { color: '#fff', fontWeight: '700' }]} numberOfLines={1}>{label}</Text>
  </Pressable>
);

export const Progress = ({ value, color = T.brand, style }) => (
  <View style={[st.bar, style]}><View style={[st.barFill, { width: `${Math.max(3, Math.min(100, Math.round((value || 0) * 100)))}%`, backgroundColor: color }]} /></View>
);

const EXT_COLOR = { pdf: '#DC2F3E', doc: '#1F5FEE', docx: '#1F5FEE', xls: '#0C9A66', xlsx: '#0C9A66', csv: '#0C9A66', ppt: '#D9541E', pptx: '#D9541E', png: '#6D3FE0', jpg: '#6D3FE0', jpeg: '#6D3FE0', heic: '#6D3FE0', gif: '#6D3FE0', mp4: '#D02670', mov: '#D02670', zip: '#5A6577', txt: '#5A6577' };
export const extColor = (name) => EXT_COLOR[fileExt(name)] || '#5A6577';
export const FileBadge = ({ name, size = 44 }) => (
  <View style={[st.fileBadge, { width: size, height: size, borderRadius: size * 0.27, backgroundColor: extColor(name) }]}>
    <Text style={[st.fileExt, { fontSize: size * 0.27 }]}>{(fileExt(name) || 'file').slice(0, 4).toUpperCase()}</Text>
  </View>
);

const KIND_ICON = { announcement: 'megaphone', material: 'book', email: 'mail' };
export function RowIcon({ item, size = 42 }) {
  const done = isWork(item) && ['turnedin', 'graded', 'done'].includes(workState(item));
  return (
    <LinearGradient colors={done ? ['#A8B1C2', '#C2C9D6'] : classPair(item.course)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.rowIcon, { width: size, height: size, borderRadius: size * 0.3 }]}>
      <Icon n={KIND_ICON[item.kind] || 'document-text'} s={size * 0.48} c="#fff" />
    </LinearGradient>
  );
}

const STATE_TONE = { turnedin: 'green', graded: 'green', done: 'gray', late: 'red', open: 'blue' };
export function StatePill({ item }) {
  if (!isWork(item)) return null;
  const s = workState(item);
  if (item.turnin === 'queued') return <Pill label="Turning in…" tone="blue" icon="sync" />;
  if (s === 'open') return null;
  return <Pill label={s === 'graded' && item.grade ? item.grade : STATE_LABEL[s]} tone={STATE_TONE[s]} icon={s === 'late' ? 'alert-circle' : 'checkmark-circle'} />;
}

/** One post in a list: class-coloured icon, title, a line of facts, a snippet, state on the right. */
export function WorkRow({ item, onPress, showCourse, last, note }) {
  const nf = (item.files || []).filter((f) => f.origin !== 'upload').length;
  const facts = [showCourse ? item.course : '', isWork(item) ? (item.dueAt || item.due ? 'Due ' + shortDue(item) : 'No due date') : postedLabel(item), nf ? `${nf} file${nf === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  const snippet = snippetOf(item);
  const s = workState(item);
  const dim = isWork(item) && ['turnedin', 'graded', 'done'].includes(s);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.row, !last && st.rowLine, pressed && { backgroundColor: T.soft }]}>
      <RowIcon item={item} />
      <View style={{ flex: 1 }}>
        <Text style={[st.rowTitle, dim && { color: T.sub }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[st.rowSub, isWork(item) && s === 'late' && { color: T.red }]} numberOfLines={1}>{facts}</Text>
        {!!(note || snippet) && <Text style={[st.rowSnip, !!note && { color: T.red, fontWeight: '600' }]} numberOfLines={1}>{note || snippet}</Text>}
      </View>
      <View style={st.rowRight}>
        {isNew(item) && <Pill label="NEW" tone="blue" />}
        {hasUpdate(item) && <View style={st.dot} />}
        {item.starred && <Icon n="star" s={15} c="#E5A20B" />}
        <StatePill item={item} />
      </View>
    </Pressable>
  );
}

export const Empty = ({ icon = 'sparkles-outline', title, text, children }) => (
  <View style={st.empty}>
    <View style={st.emptyIcon}><Icon n={icon} s={30} c={T.brand} /></View>
    {!!title && <Text style={st.emptyTitle}>{title}</Text>}
    {!!text && <Text style={st.emptyTxt}>{text}</Text>}
    {children}
  </View>
);

/** Re-renders on a timer so "2 min ago" style labels stay true. */
export function useNow(ms = 15000) {
  const [n, setN] = React.useState(Date.now());
  React.useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}

export const Line = ({ style }) => <View style={[{ height: hair, backgroundColor: T.line }, style]} />;

export const st = StyleSheet.create({
  card: { backgroundColor: T.card, borderRadius: T.radius, overflow: 'hidden' },
  btn: { height: 48, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  btnSm: { height: 38, paddingHorizontal: 14, borderRadius: 11 },
  btnTxt: { fontSize: 15.5, fontWeight: '700' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  pillTxt: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.2 },
  secRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 22, marginBottom: 10 },
  secTitle: { fontSize: 12.5, fontWeight: '800', color: T.faint, textTransform: 'uppercase', letterSpacing: 0.9 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: 2 },
  headerTitle: { fontSize: 18.5, fontWeight: '700' },
  headerSub: { fontSize: 12.5, color: T.sub, marginTop: 1 },
  large: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, gap: 12 },
  largeTitle: { fontSize: 31, fontWeight: '800', color: T.ink, letterSpacing: -0.6 },
  largeSub: { fontSize: 13.5, color: T.sub, marginTop: 2 },
  seg: { flexDirection: 'row', backgroundColor: '#E4E8F0', borderRadius: 12, padding: 3 },
  segItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 9.5 },
  segOn: { backgroundColor: '#fff' },
  segTxt: { fontSize: 13.5, color: T.sub, fontWeight: '600' },
  chip: { paddingHorizontal: 14, height: 34, justifyContent: 'center', borderRadius: 17, borderWidth: 1, borderColor: T.line, backgroundColor: '#fff', maxWidth: 240 },
  chipTxt: { fontSize: 13, color: T.sub, fontWeight: '600' },
  bar: { height: 6, borderRadius: 3, backgroundColor: T.soft, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  fileBadge: { alignItems: 'center', justifyContent: 'center' },
  fileExt: { color: '#fff', fontWeight: '800', letterSpacing: 0.3 },
  rowIcon: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 13 },
  rowLine: { borderBottomWidth: hair, borderBottomColor: T.line },
  rowTitle: { fontSize: 15.5, color: T.ink, fontWeight: '600', lineHeight: 20 },
  rowSub: { fontSize: 12.5, color: T.sub, marginTop: 3 },
  rowSnip: { fontSize: 12.5, color: T.faint, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 5, maxWidth: 130 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: T.red },
  empty: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 30, gap: 8 },
  emptyIcon: { width: 62, height: 62, borderRadius: 31, backgroundColor: T.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: T.ink, textAlign: 'center' },
  emptyTxt: { fontSize: 14, color: T.sub, textAlign: 'center', lineHeight: 20 },
});
export { shadow, shadowSm, T };
