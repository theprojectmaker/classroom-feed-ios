// Shared building blocks, drawn the way Google Classroom draws them (Material 3 with Google Sans): a light app bar, underlined
// tabs, white panels with hairline borders, tonal circles for the kind of a post, outlined/filled pill buttons.
import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from './fonts';
import { T, avatarColor, classTone, shadow, shadowSm } from './theme';
import { DONE_STATES, STATE_LABEL, fileExt, isWork, postedDetail, shortDue, workState } from './util';

export * from './util';
export { LinearGradient, Text };

export const Icon = ({ n, s = 22, c = T.text, style }) => <Ionicons name={n} size={s} color={c} style={style} />;
/** Material icons (the family Classroom uses). */
export const MIcon = ({ n, s = 24, c = T.sub, style }) => <MaterialCommunityIcons name={n} size={s} color={c} style={style} />;

export const Card = ({ children, style, filled }) => <View style={[st.card, filled && st.cardFilled, style]}>{children}</View>;

/* ---------- buttons ---------- */
const BTN = {
  filled: { bg: T.brand, fg: '#fff' }, tonal: { bg: T.brandSoft, fg: T.brandOn }, outlined: { bg: 'transparent', fg: T.brand, border: '#747775' },
  text: { bg: 'transparent', fg: T.brand }, gray: { bg: T.tonal2, fg: T.ink }, danger: { bg: T.red, fg: '#fff' }, green: { bg: T.green, fg: '#fff' },
};
const KIND = { primary: 'filled', soft: 'tonal', outline: 'outlined', ghost: 'text', dark: 'gray' };
/** Pill button: filled (blue), tonal, outlined (blue text on a grey outline), text. The older kind names still work. */
export function Btn({ label, onPress, kind = 'primary', icon, mi, disabled, loading, small, style, iconRight }) {
  const k = BTN[KIND[kind] || kind] || BTN.filled;
  const fg = k.fg;
  return (
    <Pressable onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [st.btn, small && st.btnSm, { backgroundColor: k.bg }, k.border && { borderWidth: 1, borderColor: k.border }, (disabled || loading) && { opacity: 0.45 }, pressed && { opacity: 0.75 }, style]}>
      {loading ? <ActivityIndicator size="small" color={fg} /> : mi ? <MIcon n={mi} s={small ? 16 : 18} c={fg} /> : icon ? <Icon n={icon} s={small ? 16 : 18} c={fg} /> : null}
      <Text style={[st.btnTxt, small && { fontSize: 13 }, { color: fg }]} numberOfLines={1}>{label}</Text>
      {iconRight ? <Icon n={iconRight} s={small ? 15 : 17} c={fg} /> : null}
    </Pressable>
  );
}

/** A round icon button for bars (menu, back, more…). 48 points to touch, like Material. */
export const IconBtn = ({ icon, mi, onPress, color = T.sub, size = 24, style, bg }) => (
  <Pressable onPress={onPress} hitSlop={4} style={({ pressed }) => [st.iconBtn, bg && { backgroundColor: bg }, pressed && { backgroundColor: T.fill }, style]}>
    {mi ? <MIcon n={mi} s={size} c={color} /> : <Icon n={icon} s={size} c={color} />}
  </Pressable>
);

/* ---------- labels ---------- */
const TONES = {
  gray: [T.tonal, T.sub], blue: [T.brandSoft, T.brandOn], green: [T.greenSoft, T.green], red: [T.redSoft, T.red],
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

export const SectionTitle = ({ title, right, style }) => (
  <View style={[st.secRow, style]}>
    <Text style={st.secTitle}>{title}</Text>
    {right}
  </View>
);

/** A heading in a list ("This week", a topic): 22 point Google Sans, the count in blue, a chevron when it can fold away. */
export function GroupHead({ title, count, open = true, onToggle, size = 22, style }) {
  return (
    <Pressable onPress={onToggle} disabled={!onToggle} style={[st.gh, style]}>
      <Text style={[st.ghTitle, { fontSize: size, lineHeight: size + 8 }]} numberOfLines={2}>{title}</Text>
      {count != null && <Text style={st.ghCount}>{count}</Text>}
      {onToggle ? <MIcon n={open ? 'chevron-up' : 'chevron-down'} s={24} c={T.sub} /> : null}
    </Pressable>
  );
}
export const GroupLabel = GroupHead; // the older name

/* ---------- bars ---------- */
/**
 * Classroom's top bar: menu (or back arrow), then either the Classroom wordmark (with a "› page" after it) or a title with a
 * smaller line under it (a class's name and section).
 */
export function AppBar({ title, subtitle, onMenu, onBack, brand, compactBrand, crumb, crumbSub, onBrand, onCrumb, right, style }) {
  const bare = compactBrand && !!crumb; // a phone shows just the page's name after the menu button (the logo and "Classroom ›" are for Home and wider screens)
  return (
    <View style={[st.appbar, style]}>
      {onBack ? <IconBtn mi="arrow-left" onPress={onBack} color={T.ink} /> : onMenu ? <IconBtn mi="menu" onPress={onMenu} color={T.ink} /> : <View style={{ width: 12 }} />}
      {brand ? (
        <View style={st.brandRow}>
          {!bare && (
            <Pressable onPress={onBrand} disabled={!onBrand} style={st.brandHit}>
              <LinearGradient colors={['#3D8BFF', '#173FB8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.mark}><Icon n="checkmark-done" s={17} c="#fff" /></LinearGradient>
              <Text style={st.brandTxt}>Classroom</Text>
            </Pressable>
          )}
          {!!crumb && (<>
            {!bare && <MIcon n="chevron-right" s={22} c={T.sub} />}
            <Pressable onPress={onCrumb} disabled={!onCrumb} style={{ flexShrink: 1 }}>
              <Text style={[st.crumbTxt, !!crumbSub && st.crumbTxtSm]} numberOfLines={1}>{crumb}</Text>
              {!!crumbSub && <Text style={st.barSub} numberOfLines={1}>{crumbSub}</Text>}
            </Pressable>
          </>)}
        </View>
      ) : (
        <View style={{ flex: 1, paddingLeft: 4 }}>
          <Text style={st.barTitle} numberOfLines={1}>{title}</Text>
          {!!subtitle && <Text style={st.barSub} numberOfLines={1}>{subtitle}</Text>}
        </View>
      )}
      {right}
    </View>
  );
}
/** The older header API (More, the file preview…) now draws an app bar. */
export const Header = ({ title, subtitle, onBack, right }) => <AppBar title={title} subtitle={subtitle} onBack={onBack} right={right} />;

export const LargeTitle = ({ title, subtitle, right }) => (
  <View style={st.large}>
    <View style={{ flex: 1 }}>
      <Text style={st.largeTitle} numberOfLines={1}>{title}</Text>
      {!!subtitle && <Text style={st.largeSub} numberOfLines={1}>{subtitle}</Text>}
    </View>
    {right}
  </View>
);

/** Classroom's tabs: text, the current one in blue with a thick line under it, a hairline along the bottom. */
export function Tabs({ options, value, onChange, style, fill = true, center }) {
  return (
    <View style={[st.tabs, center && { justifyContent: 'center' }, style]}>
      {options.map((o) => {
        const [key, label, count] = Array.isArray(o) ? o : [o, o];
        const on = value === key;
        return (
          <Pressable key={key} onPress={() => onChange(key)} style={({ pressed }) => [st.tab, !fill && st.tabAuto, pressed && { backgroundColor: T.tonal }]}>
            <Text style={[st.tabTxt, on && { color: T.brand }]} numberOfLines={1}>{label}{count ? `  ${count}` : ''}</Text>
            {on && <View style={st.tabBar} />}
          </Pressable>
        );
      })}
    </View>
  );
}
export const Seg = Tabs; // the older name

export const Chip = ({ label, on, onPress }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [st.chip, on && st.chipOn, pressed && { opacity: 0.7 }]}>
    {on && <MIcon n="check" s={16} c={T.brandOn} />}
    <Text style={[st.chipTxt, on && { color: T.brandOn }]} numberOfLines={1}>{label}</Text>
  </Pressable>
);

/** An outlined select box that opens a list: the "Topic filter" and "All classes" of Classroom. options = [[key, label], …]. */
export function Dropdown({ label, value, options, onChange, style }) {
  const [open, setOpen] = React.useState(false);
  const cur = options.find(([k]) => k === value);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[st.dd, open && { borderColor: T.brand, borderWidth: 2 }, style]}>
        {!!label && <Text style={[st.ddLabel, open && { color: T.brand }]}>{label}</Text>}
        <Text style={st.ddValue} numberOfLines={1}>{cur ? cur[1] : ''}</Text>
        <MIcon n="menu-down" s={26} c={T.sub} style={st.ddArrow} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={st.scrim} onPress={() => setOpen(false)}>
          <View style={st.menuCard}>
            <ScrollView style={{ maxHeight: 440 }}>
              {options.map(([k, l]) => (
                <Pressable key={k} onPress={() => { setOpen(false); onChange(k); }} style={({ pressed }) => [st.menuItem, k === value && { backgroundColor: T.brandSoft }, pressed && { backgroundColor: T.tonal }]}>
                  <Text style={[st.menuTxt, k === value && { color: T.brandOn, fontWeight: '500' }]} numberOfLines={2}>{l}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/** The small menu a row's three dots open: [{ label, mi, onPress }]. Render it when `items` is set. */
export function MoreMenu({ items, onClose }) {
  if (!items || !items.length) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.scrim} onPress={onClose}>
        <View style={[st.menuCard, { minWidth: 240, paddingVertical: 8 }]}>
          {items.map((it) => (
            <Pressable key={it.label} onPress={() => { onClose(); it.onPress && it.onPress(); }} style={({ pressed }) => [st.menuItem, { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 14 }, pressed && { backgroundColor: T.tonal }]}>
              {it.mi ? <MIcon n={it.mi} s={22} c={T.sub} /> : null}
              <Text style={st.menuTxt}>{it.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

/** The first letter of a name ("2026 Dr. Berzins" -> "D"), falling back to its first character. */
const initialOf = (name) => { const s = String(name || '?').trim(); const m = s.match(/[A-Za-zÀ-ɏ֐-׿]/); return (m ? m[0] : s.charAt(0) || '?').toUpperCase(); };
export const Avatar = ({ name, size = 40, color }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color || avatarColor(name), alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: '#fff', fontSize: Math.round(size * 0.45), fontWeight: '500' }}>{initialOf(name)}</Text>
  </View>
);

export const Progress = ({ value, color = T.brand, style }) => (
  <View style={[st.bar, style]}><View style={[st.barFill, { width: `${Math.max(3, Math.min(100, Math.round((value || 0) * 100)))}%`, backgroundColor: color }]} /></View>
);

const EXT_COLOR = { pdf: '#D93025', doc: '#1A73E8', docx: '#1A73E8', xls: '#1E8E3E', xlsx: '#1E8E3E', csv: '#1E8E3E', ppt: '#E8710A', pptx: '#E8710A', png: '#8E4EC6', jpg: '#8E4EC6', jpeg: '#8E4EC6', heic: '#8E4EC6', gif: '#8E4EC6', mp4: '#D01884', mov: '#D01884', zip: '#5F6368', txt: '#5F6368' };
export const extColor = (name) => EXT_COLOR[fileExt(name)] || '#5F6368';
export const FileBadge = ({ name, size = 44 }) => (
  <View style={[st.fileBadge, { width: size, height: size, borderRadius: 8, backgroundColor: extColor(name) }]}>
    <Text style={[st.fileExt, { fontSize: Math.round(size * 0.27) }]}>{(fileExt(name) || 'file').slice(0, 4).toUpperCase()}</Text>
  </View>
);

/* ---------- the round icon in front of a post ---------- */
const KIND_MI = { announcement: 'bullhorn-outline', material: 'book-outline', email: 'email-outline' };
/** What kind of post it is, on a tonal circle in the class's colour (tone) — or a grey outlined circle (outline), as in Classwork. */
export function RowIcon({ item, size = 40, outline }) {
  const tone = classTone(item.course);
  const done = isWork(item) && DONE_STATES.includes(workState(item));
  const mi = KIND_MI[item.kind] || 'clipboard-text-outline';
  if (outline) return <View style={[st.ringIcon, { width: size, height: size, borderRadius: size / 2 }]}><MIcon n={mi} s={size * 0.52} c="#5F6368" /></View>;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: done ? '#E3E3E3' : tone.bg, alignItems: 'center', justifyContent: 'center' }}>
      <MIcon n={mi} s={size * 0.52} c={done ? '#444746' : tone.fg} />
    </View>
  );
}

const STATE_COLOR = { turnedin: T.green, graded: T.green, excused: T.sub, done: T.sub, late: T.red, open: T.brand };
/** Where a piece of work stands: coloured words in lists (plain) or a small label. Graded work shows its grade. */
export function StatePill({ item, plain }) {
  if (!isWork(item)) return null;
  const s = workState(item);
  if (item.turnin === 'queued') return plain ? <Text style={[st.stateTxt, { color: T.brand }]}>Turning in…</Text> : <Pill label="Turning in…" tone="blue" icon="sync" />;
  if (s === 'open') return null;
  const label = s === 'graded' && item.grade ? item.grade : STATE_LABEL[s];
  if (plain) return <Text style={[st.stateTxt, { color: STATE_COLOR[s] }]} numberOfLines={1}>{label}</Text>;
  return <Pill label={label} tone={s === 'late' ? 'red' : s === 'open' ? 'blue' : s === 'done' || s === 'excused' ? 'gray' : 'green'} />;
}

/**
 * One post in a list. mode 'todo': tonal icon, title, class + when it was posted, due time on the right (red when missing).
 * mode 'classwork': grey outlined icon, title, "Due …" or "Posted …" on the right, three dots. Hold a row to pin it.
 */
export function WorkRow({ item, onPress, onLongPress, onMore, showCourse, last, note, mode = 'todo' }) {
  const work = isWork(item), s = workState(item);
  const done = work && DONE_STATES.includes(s);
  const due = work && (item.dueAt || item.due) ? shortDue(item) : '';
  const posted = postedDetail(item);
  const course = niceCourseLabel(item.course);
  // Classroom prints a due time in green while it is close (today or tomorrow), red once it is missing, grey otherwise.
  const soon = work && !done && s !== 'late' && !!item.dueAt && item.dueAt > Date.now() && item.dueAt - Date.now() < 36 * 3600 * 1000;
  if (mode === 'classwork') {
    const right = work && due && !done ? 'Due ' + due : posted;
    return (
      <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={380} style={({ pressed }) => [st.row, pressed && { backgroundColor: T.tonal }]}>
        <RowIcon item={item} outline />
        <View style={[st.rowBody, !last && st.rowLine]}>
          <View style={{ flex: 1 }}>
            <Text style={[st.rowTitle, { fontSize: 16 }, done && { color: T.sub }]} numberOfLines={2}>{item.title}</Text>
            {!!note && <Text style={[st.rowSub, { color: T.red }]} numberOfLines={1}>{note}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end', maxWidth: 150 }}>
            <Text style={[st.rowRight, s === 'late' && { color: T.red }, soon && { color: T.green, fontWeight: '500' }]} numberOfLines={2}>{right}</Text>
            {work && s !== 'open' ? <StatePill item={item} plain /> : null}
          </View>
          {onMore ? <IconBtn mi="dots-vertical" onPress={onMore} size={22} style={{ marginRight: -8 }} /> : null}
        </View>
      </Pressable>
    );
  }
  const sub = [showCourse ? course : '', posted].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={380} style={({ pressed }) => [st.row, pressed && { backgroundColor: T.tonal }]}>
      <RowIcon item={item} />
      <View style={[st.rowBody, !last && st.rowLine]}>
        <View style={{ flex: 1 }}>
          <Text style={[st.rowTitle, done && { color: T.sub }]} numberOfLines={2}>{item.title}</Text>
          {!!sub && <Text style={st.rowSub} numberOfLines={1}>{sub}</Text>}
          {!!note && <Text style={[st.rowSub, { color: T.red }]} numberOfLines={1}>{note}</Text>}
        </View>
        <View style={{ alignItems: 'flex-end', maxWidth: 130 }}>
          <View style={st.rowTop}>
            {item.starred && <MIcon n="pin" s={14} c={T.amberFill} />}
            {!done && due ? <Text style={[st.rowRight, s === 'late' && { color: T.red }, soon && { color: T.green, fontWeight: '500' }]} numberOfLines={2}>{due}</Text> : null}
          </View>
          {work && (done || s === 'late') ? <StatePill item={item} plain /> : null}
          {!!item.grade && s !== 'graded' ? <Text style={[st.stateTxt, { color: T.green }]} numberOfLines={1}>{item.grade}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}
const niceCourseLabel = (c) => String(c || '').replace(/\s*20\d{2}-\d{2}.*$/, '').trim() || String(c || '');

export const Empty = ({ icon = 'sparkles-outline', title, text, children }) => (
  <View style={st.empty}>
    <View style={st.emptyIcon}><Icon n={icon} s={28} c={T.faint} /></View>
    {!!title && <Text style={st.emptyTitle}>{title}</Text>}
    {!!text && <Text style={st.emptyTxt}>{text}</Text>}
    {children}
  </View>
);

/** The width of a page for choosing its layout: the first measure at once, later ones once the width has settled for a moment. */
export function useLayoutWidth(initial) {
  const [w, setW] = React.useState(initial);
  const timer = React.useRef(null), first = React.useRef(true);
  const onLayout = React.useCallback((ev) => {
    const x = ev.nativeEvent.layout.width;
    if (first.current) { first.current = false; setW(x); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setW(x), 110);
  }, []);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  return [w, onLayout];
}

/** Re-renders on a timer so "2 min ago" style labels stay true. */
export function useNow(ms = 15000) {
  const [n, setN] = React.useState(Date.now());
  React.useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}

export const Line = ({ style }) => <View style={[{ height: 1, backgroundColor: T.line }, style]} />;

export const st = StyleSheet.create({
  card: { backgroundColor: T.card, borderRadius: T.radius, borderWidth: 1, borderColor: T.line, overflow: 'hidden' },
  cardFilled: { backgroundColor: T.tonal, borderWidth: 0 },
  btn: { height: 40, paddingHorizontal: 24, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  btnSm: { height: 32, paddingHorizontal: 16, borderRadius: 16 },
  btnTxt: { fontSize: 14, fontWeight: '500' },
  iconBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pillTxt: { fontSize: 12, fontWeight: '500' },
  secRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 8 },
  secTitle: { fontSize: 22, fontWeight: '400', color: T.ink },
  gh: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  ghTitle: { flex: 1, fontWeight: '400', color: T.ink },
  ghCount: { fontSize: 14, fontWeight: '500', color: T.brand },
  appbar: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingRight: 8, paddingLeft: 4, backgroundColor: T.bg },
  brandRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 },
  brandHit: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  crumbTxtSm: { fontSize: 16, fontWeight: '500', lineHeight: 20 },
  mark: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  brandTxt: { fontSize: 22, fontWeight: '400', color: T.sub },
  crumbTxt: { flexShrink: 1, fontSize: 22, fontWeight: '400', color: T.sub },
  barTitle: { fontSize: 16, fontWeight: '500', color: T.ink, lineHeight: 20 },
  barSub: { fontSize: 12, color: T.sub, marginTop: 1, lineHeight: 16 },
  large: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8, gap: 10 },
  largeTitle: { fontSize: 28, fontWeight: '400', color: T.ink },
  largeSub: { fontSize: 14, color: T.sub, marginTop: 2 },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: T.line },
  tab: { flexGrow: 1, flexBasis: 0, maxWidth: 220, minWidth: 72, height: 48, alignItems: 'center', justifyContent: 'center' },
  tabAuto: { flexGrow: 0, flexBasis: 'auto', minWidth: 72, paddingHorizontal: 24 },
  tabTxt: { fontSize: 14, fontWeight: '500', color: T.sub },
  tabBar: { position: 'absolute', left: 8, right: 8, bottom: 0, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: T.brand },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#747775', backgroundColor: '#fff', maxWidth: 240 },
  chipOn: { backgroundColor: T.brandSoft, borderColor: T.brandSoft },
  chipTxt: { fontSize: 14, fontWeight: '500', color: T.sub },
  dd: { height: 56, borderRadius: 4, borderWidth: 1, borderColor: '#747775', backgroundColor: '#fff', paddingHorizontal: 16, justifyContent: 'center' },
  ddLabel: { position: 'absolute', top: -9, left: 10, paddingHorizontal: 4, backgroundColor: '#fff', fontSize: 12, color: T.sub },
  ddValue: { fontSize: 16, color: T.ink, paddingRight: 32 },
  ddArrow: { position: 'absolute', right: 12, top: 15 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', justifyContent: 'center', padding: 24 },
  menuCard: { backgroundColor: '#fff', borderRadius: 12, alignSelf: 'center', width: '100%', maxWidth: 360, paddingVertical: 8, overflow: 'hidden' },
  menuItem: { minHeight: 48, paddingHorizontal: 20, justifyContent: 'center' },
  menuTxt: { fontSize: 16, color: T.ink },
  bar: { height: 6, borderRadius: 3, backgroundColor: T.tonal, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  fileBadge: { alignItems: 'center', justifyContent: 'center' },
  fileExt: { color: '#fff', fontWeight: '700' },
  ringIcon: { borderWidth: 2, borderColor: '#747775', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 64 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: T.line },
  rowTitle: { fontSize: 14, color: T.ink, lineHeight: 20, fontWeight: '500' },
  rowSub: { fontSize: 12, color: T.sub, marginTop: 2, lineHeight: 16 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowRight: { fontSize: 14, color: T.sub, textAlign: 'right' },
  stateTxt: { fontSize: 13, fontWeight: '500', textAlign: 'right' },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 30, gap: 6 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: T.tonal, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: T.ink, textAlign: 'center' },
  emptyTxt: { fontSize: 14, color: T.sub, textAlign: 'center', lineHeight: 20 },
});
export { shadow, shadowSm, T };
