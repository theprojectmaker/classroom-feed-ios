// Shared building blocks, drawn the iOS way: flat white cards on a grouped grey background, hairlines that start after
// the icon, large titles, capsule buttons, a native-looking segmented control.
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { T, classPair, hair, shadow, shadowSm } from './theme';
import { DONE_STATES, STATE_LABEL, fileExt, isNew, isWork, postedDetail, shortDue, workState } from './util';

export * from './util';
export { LinearGradient };

export const Icon = ({ n, s = 22, c = T.text, style }) => <Ionicons name={n} size={s} color={c} style={style} />;

export const Card = ({ children, style }) => <View style={[st.card, style]}>{children}</View>;

const BTN = {
  primary: { bg: T.brand, fg: '#fff' }, green: { bg: T.greenFill, fg: '#fff' }, soft: { bg: T.brandSoft, fg: T.brand },
  outline: { bg: '#fff', fg: T.brand, border: T.line }, ghost: { bg: 'transparent', fg: T.brand }, danger: { bg: T.redSoft, fg: T.red }, dark: { bg: T.text, fg: '#fff' },
  gray: { bg: T.soft, fg: T.text },
};
export function Btn({ label, onPress, kind = 'primary', icon, disabled, loading, small, style, iconRight }) {
  const k = BTN[kind] || BTN.primary;
  return (
    <Pressable onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [st.btn, small && st.btnSm, { backgroundColor: k.bg }, k.border && { borderWidth: hair, borderColor: k.border }, (disabled || loading) && { opacity: 0.45 }, pressed && { opacity: 0.6 }, style]}>
      {loading ? <ActivityIndicator size="small" color={k.fg} /> : icon ? <Icon n={icon} s={small ? 16 : 19} c={k.fg} /> : null}
      <Text style={[st.btnTxt, small && { fontSize: 14.5 }, { color: k.fg }]} numberOfLines={1}>{label}</Text>
      {iconRight ? <Icon n={iconRight} s={small ? 15 : 18} c={k.fg} /> : null}
    </Pressable>
  );
}

/** A round icon button for bars (search, pin, add…). */
export const IconBtn = ({ icon, onPress, color = T.brand, bg = T.fill, size = 36, style }) => (
  <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.5 }, style]}>
    <Icon n={icon} s={size * 0.56} c={color} />
  </Pressable>
);

const TONES = {
  gray: [T.soft, T.sub], blue: [T.brandSoft, T.brand], green: [T.greenSoft, T.green], red: [T.redSoft, T.red],
  amber: [T.amberSoft, T.amber], violet: [T.violetSoft, T.violet], white: ['#ffffff33', '#fff'],
};
export function Pill({ label, tone = 'gray', icon, style }) {
  const [bg, fg] = TONES[tone] || TONES.gray;
  return (
    <View style={[st.pill, { backgroundColor: bg }, style]}>
      {icon ? <Icon n={icon} s={12} c={fg} /> : null}
      <Text style={[st.pillTxt, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** A section heading in the page ("Pinned", "Your work"). */
export const SectionTitle = ({ title, right, style }) => (
  <View style={[st.secRow, style]}>
    <Text style={st.secTitle}>{title}</Text>
    {right}
  </View>
);
/** The small grey label above a group of rows ("THIS WEEK"). */
export const GroupLabel = ({ title, count, tone, style }) => (
  <View style={[st.groupRow, style]}>
    <Text style={[st.groupTxt, tone === 'red' && { color: T.red }]}>{title}</Text>
    {count != null && <Text style={st.groupTxt}>{count}</Text>}
  </View>
);

/** Top bar of a pushed screen: back arrow, title. With `pair` it is filled with the class's colours. */
export function Header({ title, subtitle, onBack, right, pair, backLabel }) {
  const fg = pair ? '#fff' : T.ink, tint = pair ? '#fff' : T.brand;
  const inner = (
    <View style={st.header}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={14} style={({ pressed }) => [st.back, pressed && { opacity: 0.5 }]}>
          <Icon n="chevron-back" s={25} c={tint} />
          {!!backLabel && <Text style={[st.backTxt, { color: tint }]} numberOfLines={1}>{backLabel}</Text>}
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[st.headerTitle, { color: fg }]} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={[st.headerSub, pair && { color: '#ffffffcc' }]} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
  return pair
    ? <LinearGradient colors={pair} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>{inner}</LinearGradient>
    : <View style={st.headerPlain}>{inner}</View>;
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
            <Text style={[st.segTxt, on && { fontWeight: '600' }]} numberOfLines={1}>{label}{count ? `  ${count}` : ''}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const Chip = ({ label, on, onPress, color }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [st.chip, on && { backgroundColor: color || T.text }, pressed && { opacity: 0.6 }]}>
    <Text style={[st.chipTxt, on && { color: '#fff', fontWeight: '600' }]} numberOfLines={1}>{label}</Text>
  </Pressable>
);

export const Progress = ({ value, color = T.brand, style }) => (
  <View style={[st.bar, style]}><View style={[st.barFill, { width: `${Math.max(3, Math.min(100, Math.round((value || 0) * 100)))}%`, backgroundColor: color }]} /></View>
);

const EXT_COLOR = { pdf: '#E5383B', doc: '#0A6CF0', docx: '#0A6CF0', xls: '#17914F', xlsx: '#17914F', csv: '#17914F', ppt: '#D95B14', pptx: '#D95B14', png: '#6E45DC', jpg: '#6E45DC', jpeg: '#6E45DC', heic: '#6E45DC', gif: '#6E45DC', mp4: '#D02A6C', mov: '#D02A6C', zip: '#636366', txt: '#636366' };
export const extColor = (name) => EXT_COLOR[fileExt(name)] || '#636366';
export const FileBadge = ({ name, size = 44 }) => (
  <View style={[st.fileBadge, { width: size, height: size, borderRadius: size * 0.25, backgroundColor: extColor(name) }]}>
    <Text style={[st.fileExt, { fontSize: size * 0.27 }]}>{(fileExt(name) || 'file').slice(0, 4).toUpperCase()}</Text>
  </View>
);

// The round icon Google Classroom puts in front of every post: what kind it is, in the class's colour (grey once done).
const KIND_ICON = { announcement: 'megaphone', material: 'bookmark', email: 'mail' };
export function RowIcon({ item, size = 40 }) {
  const done = isWork(item) && DONE_STATES.includes(workState(item));
  return (
    <LinearGradient colors={done ? ['#AEAEB2', '#C7C7CC'] : classPair(item.course)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.rowIcon, { width: size, height: size, borderRadius: size / 2 }]}>
      <Icon n={KIND_ICON[item.kind] || 'clipboard'} s={size * 0.47} c="#fff" />
    </LinearGradient>
  );
}

const STATE_TONE = { turnedin: 'green', graded: 'green', excused: 'gray', done: 'gray', late: 'red', open: 'blue' };
const STATE_COLOR = { turnedin: T.green, graded: T.green, excused: T.sub, done: T.sub, late: T.red, open: T.brand };
/** Where a piece of work stands. In lists (plain) it is just coloured words; elsewhere a pill. Graded work shows its grade. */
export function StatePill({ item, plain }) {
  if (!isWork(item)) return null;
  const s = workState(item);
  if (item.turnin === 'queued') return plain ? <Text style={[st.stateTxt, { color: T.brand }]}>Turning in…</Text> : <Pill label="Turning in…" tone="blue" icon="sync" />;
  if (s === 'open') return null;
  const label = s === 'graded' && item.grade ? item.grade : STATE_LABEL[s];
  if (plain) return <Text style={[st.stateTxt, { color: STATE_COLOR[s] }]} numberOfLines={1}>{label}</Text>;
  return <Pill label={label} tone={STATE_TONE[s]} icon={s === 'late' ? 'alert-circle' : s === 'graded' ? 'ribbon' : 'checkmark-circle'} />;
}

/**
 * One post in a list, the way Classroom lists it: round icon, title, then its class and when it was posted, then when
 * it is due; on the right its state or grade. Hold a row to pin it.
 */
export function WorkRow({ item, onPress, onLongPress, showCourse, last, note }) {
  const work = isWork(item), s = workState(item);
  const done = work && DONE_STATES.includes(s);
  const meta = [showCourse ? item.course : '', postedDetail(item)].filter(Boolean).join(' · ');
  const due = work && (item.dueAt || item.due) ? 'Due ' + shortDue(item) : '';
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={380} style={({ pressed }) => [st.row, pressed && { backgroundColor: T.soft }]}>
      <RowIcon item={item} />
      <View style={[st.rowBody, !last && st.rowLine]}>
        <View style={{ flex: 1 }}>
          <Text style={[st.rowTitle, done && { color: T.sub }]} numberOfLines={2}>
            {item.title}
          </Text>
          {!!meta && <Text style={st.rowSub} numberOfLines={1}>{meta}</Text>}
          {!!due && !done && <Text style={[st.rowDue, s === 'late' && { color: T.red }]} numberOfLines={1}>{due}</Text>}
          {!!note && <Text style={[st.rowSub, { color: T.red, fontWeight: '600' }]} numberOfLines={1}>{note}</Text>}
        </View>
        <View style={st.rowRight}>
          <View style={st.rowRightTop}>
            {item.starred && <Icon n="pin" s={13} c={T.amberFill} />}
            {isNew(item) && <View style={st.newDot} />}
            <StatePill item={item} plain />
          </View>
          {!!item.grade && s !== 'graded' && <Text style={[st.stateTxt, { color: T.green }]} numberOfLines={1}>{item.grade}</Text>}
        </View>
      </View>
    </Pressable>
  );
}

export const Empty = ({ icon = 'sparkles-outline', title, text, children }) => (
  <View style={st.empty}>
    <View style={st.emptyIcon}><Icon n={icon} s={28} c={T.faint} /></View>
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
  btn: { height: 50, paddingHorizontal: 18, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  btnSm: { height: 34, paddingHorizontal: 14, borderRadius: 17 },
  btnTxt: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 20 },
  pillTxt: { fontSize: 12, fontWeight: '600' },
  secRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 26, marginBottom: 10 },
  secTitle: { fontSize: 22, fontWeight: '700', color: T.ink, letterSpacing: -0.3 },
  groupRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 7, marginTop: 4 },
  groupTxt: { fontSize: 13, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 50, paddingHorizontal: 8, paddingVertical: 6 },
  headerPlain: { backgroundColor: T.bg },
  back: { flexDirection: 'row', alignItems: 'center', minWidth: 36, height: 38, marginRight: 2 },
  backTxt: { fontSize: 17, marginLeft: -2, maxWidth: 130 },
  headerTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
  headerSub: { fontSize: 12.5, color: T.sub, marginTop: 1 },
  large: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8, gap: 10 },
  largeTitle: { fontSize: 34, fontWeight: '700', color: T.ink, letterSpacing: 0.3 },
  largeSub: { fontSize: 15, color: T.sub, marginTop: 1 },
  seg: { flexDirection: 'row', backgroundColor: T.fill, borderRadius: 9, padding: 2 },
  segItem: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 30, borderRadius: 7 },
  segOn: { backgroundColor: '#fff' },
  segTxt: { fontSize: 13.5, color: T.ink, fontWeight: '500' },
  chip: { paddingHorizontal: 13, height: 32, justifyContent: 'center', borderRadius: 16, backgroundColor: '#fff', maxWidth: 240 },
  chipTxt: { fontSize: 14, color: T.text, fontWeight: '500' },
  bar: { height: 5, borderRadius: 3, backgroundColor: T.soft, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
  fileBadge: { alignItems: 'center', justifyContent: 'center' },
  fileExt: { color: '#fff', fontWeight: '800', letterSpacing: 0.3 },
  rowIcon: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingRight: 14, minHeight: 60 },
  rowLine: { borderBottomWidth: hair, borderBottomColor: T.line },
  rowTitle: { fontSize: 17, color: T.ink, lineHeight: 22, letterSpacing: -0.3 },
  rowSub: { fontSize: 13.5, color: T.sub, marginTop: 2 },
  rowDue: { fontSize: 13.5, color: T.text, marginTop: 2, fontWeight: '500' },
  rowRight: { alignItems: 'flex-end', gap: 3, maxWidth: 110, paddingLeft: 4 },
  rowRightTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  newDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: T.brand },
  stateTxt: { fontSize: 14, fontWeight: '500' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: T.redFill },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 30, gap: 6 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: T.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: T.ink, textAlign: 'center' },
  emptyTxt: { fontSize: 15, color: T.sub, textAlign: 'center', lineHeight: 20 },
});
export { shadow, shadowSm, T };
