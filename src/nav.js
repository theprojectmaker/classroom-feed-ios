// The side menu, built the way Google Classroom builds its own (measured on the real pages):
//  - a big screen (>= 1040 px) gets a permanent SIDEBAR under the top bar: 300 wide, shrinking to a 76 wide rail of icons when ☰ is
//    pressed (the labels fade out, the round class badges stay as a quick class switcher);
//  - a smaller screen gets a POP-OVER (304 wide) that slides in over a dimmed page, can be dragged shut, and can be pulled out by
//    swiping in from the left edge.
// Rows are 48 high pills; the open one is light blue (#C2E7FF) with dark blue text; every class has a 24 point round badge in the
// colours Classroom gives it, its name and (smaller) its section.
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppCtx } from './ctx';
import { RAIL, SIDEBAR, T, classTone, shadow } from './theme';
import { MIcon, Text } from './ui';
import { classSection, useClassList } from './classes';

const EASE = Easing.bezier(0.2, 0, 0, 1); // Material's "emphasized decelerate"
const letterOf = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';

/* ---------- one row ---------- */
function Row({ icon, iconOn, label, sub, on, badge, onPress, circle, op }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={sub ? `${label}, ${sub}` : label} accessibilityState={{ selected: !!on }}
      style={({ pressed, hovered }) => [st.row, on && st.rowOn, !on && (pressed || hovered) && st.rowHover]}>
      {circle
        ? <View style={[st.circle, { backgroundColor: circle.bg }]}><Text style={[st.circleTxt, { color: circle.fg }]}>{circle.letter}</Text></View>
        : <MIcon n={on ? iconOn || icon : icon} s={24} c={on ? T.brandContainerOn : T.sub} />}
      <Animated.View style={[st.labels, { opacity: op }]}>
        <Text style={[st.label, on && st.labelOn]} numberOfLines={1}>{label}</Text>
        {!!sub && <Text style={[st.sub, on && { color: T.brandContainerOn }]} numberOfLines={1}>{sub}</Text>}
      </Animated.View>
      {badge > 0 && <Animated.View style={{ opacity: op }}><Text style={[st.badge, on && { color: T.brandContainerOn }]}>{badge > 99 ? '99+' : badge}</Text></Animated.View>}
    </Pressable>
  );
}

/** "Enrolled": in the sidebar a row with the graduation cap and a chevron that folds the list; in the pop-over a plain heading. */
function Head({ label, open, onPress, plain, op }) {
  if (plain) return <View style={st.plainHead}><Text style={st.plainHeadTxt}>{label}</Text></View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${open ? 'folds the list' : 'shows the list'}`} style={({ pressed, hovered }) => [st.row, (pressed || hovered) && st.rowHover]}>
      <MIcon n="school-outline" s={24} c={T.sub} />
      <Animated.View style={[st.labels, { opacity: op }]}><Text style={st.label} numberOfLines={1}>{label}</Text></Animated.View>
      <Animated.View style={{ opacity: op }}><MIcon n={open ? 'chevron-up' : 'chevron-down'} s={24} c={T.sub} /></Animated.View>
    </Pressable>
  );
}

/* ---------- the list itself (shared by the sidebar and the pop-over) ---------- */
function MenuList({ w, op, plain, rail, active, missing, enrolledOpen, onToggleEnrolled, onGo, onClass, onFind, onExpand, top = 0 }) {
  const e = useContext(AppCtx);
  const insets = useSafeAreaInsets();
  const classes = useClassList(e.items);
  const scroller = useRef(null), ys = useRef({}), view = useRef({ y: 0, h: 0 });
  const inner = useMemo(() => (typeof w === 'number' ? w - 24 : Animated.subtract(w, 24)), [w]);
  const open = plain || enrolledOpen;

  // the class you are in is brought into view when the list is longer than the screen
  useEffect(() => {
    if (!active || !String(active).startsWith('class:')) return;
    const y = ys.current[String(active).slice(6)];
    if (y == null || !scroller.current) return;
    const { y: sy, h } = view.current;
    if (y < sy + 24 || y + 56 > sy + h - 24) scroller.current.scrollTo({ y: Math.max(0, y - Math.max(60, (h - 56) / 2)), animated: true });
  }, [active, classes.length]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={scroller} showsVerticalScrollIndicator={false} scrollEventThrottle={64}
        onScroll={(ev) => { view.current.y = ev.nativeEvent.contentOffset.y; }} onLayout={(ev) => { view.current.h = ev.nativeEvent.layout.height; }}
        contentContainerStyle={{ paddingTop: 12 + top, paddingBottom: 8 }}>
        <Animated.View style={{ width: inner, marginHorizontal: 12 }}>
          <Row icon="home-outline" iconOn="home" label="Home" on={active === 'classes'} onPress={() => onGo('classes')} op={op} />
          <Row icon="calendar-blank-outline" iconOn="calendar-blank" label="Calendar" on={active === 'calendar'} onPress={() => onGo('calendar')} op={op} />
          <Head label="Enrolled" open={enrolledOpen} plain={plain} op={op} onPress={() => (rail ? onExpand() : onToggleEnrolled())} />
          {open && <Row icon="text-box-check-outline" label="To-do" on={active === 'todo'} badge={missing} onPress={() => onGo('todo')} op={op} />}
          {open && classes.map((c) => {
            const tone = classTone(c.name);
            return (
              <View key={c.name} onLayout={(ev) => { ys.current[c.name] = ev.nativeEvent.layout.y; }}>
                <Row circle={{ bg: tone.bg, fg: tone.fg, letter: letterOf(c.name) }} label={c.name} sub={classSection(c.name)} on={active === 'class:' + c.name} onPress={() => onClass(c.name)} op={op} />
              </View>
            );
          })}
        </Animated.View>
      </ScrollView>
      {/* always in reach, however long the class list is */}
      <Animated.View style={{ width: inner, marginHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: T.hair, paddingBottom: 12 + Math.max(0, insets.bottom - 8) }}>
        <Row icon="magnify" label="Search" on={active === 'find'} onPress={onFind} op={op} />
        <Row icon="cog-outline" iconOn="cog" label="Settings" on={active === 'more'} onPress={() => onGo('more')} op={op} />
      </Animated.View>
    </View>
  );
}

/* ---------- the permanent sidebar (big screens) ---------- */
export function Sidebar({ open, ...menu }) {
  const w = useRef(new Animated.Value(open ? SIDEBAR : RAIL)).current;
  const op = useMemo(() => w.interpolate({ inputRange: [RAIL, RAIL + 70, SIDEBAR], outputRange: [0, 0, 1], extrapolate: 'clamp' }), [w]);
  useEffect(() => { Animated.timing(w, { toValue: open ? SIDEBAR : RAIL, duration: 240, easing: EASE, useNativeDriver: false }).start(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Animated.View style={[st.side, { width: w }]}><MenuList w={w} op={op} rail={!open} {...menu} /></Animated.View>;
}

/* ---------- the pop-over (smaller screens) ---------- */
/**
 * State and gestures of the pop-over. `p` goes 0 (shut) … 1 (open); dragging it follows the finger, letting go finishes the move.
 * edgeHandlers: put on the page — a swipe in from the left edge pulls the menu out. drawerHandlers: on the pop-over — drag left to close.
 */
export function useModalDrawer(width, enabled = true) {
  const p = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(false);
  const isOpen = useRef(false);
  const W = useRef(width); W.current = width;
  const go = useCallback((to) => {
    isOpen.current = to === 1;
    if (to === 1) setShown(true);
    Animated.timing(p, { toValue: to, duration: to ? 260 : 200, easing: EASE, useNativeDriver: false }).start(({ finished }) => { if (finished && to === 0) setShown(false); });
  }, [p]);
  const startX = useRef(1e9); // where the finger came down (the gesture's own x0 is only set once the gesture has been claimed)
  const edge = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: (ev) => { startX.current = ev.nativeEvent.pageX; return false; },
    onMoveShouldSetPanResponderCapture: (_, g) => enabled && !isOpen.current && startX.current < 24 && g.dx > 10 && g.dx > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: () => { p.stopAnimation(); setShown(true); },
    onPanResponderMove: (_, g) => p.setValue(Math.max(0, Math.min(1, g.dx / W.current))),
    onPanResponderRelease: (_, g) => go(g.dx > W.current * 0.3 || g.vx > 0.45 ? 1 : 0),
    onPanResponderTerminate: () => go(0),
  }), [enabled, go, p]);
  const drawer = useMemo(() => PanResponder.create({
    // "Capture": a row you started touching is already the responder, so only the capturing variant can take the gesture over (and cancel the tap)
    onMoveShouldSetPanResponderCapture: (_, g) => isOpen.current && g.dx < -8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
    onPanResponderGrant: () => { p.stopAnimation(); },
    onPanResponderMove: (_, g) => p.setValue(Math.max(0, Math.min(1, 1 + g.dx / W.current))),
    onPanResponderRelease: (_, g) => go(g.dx < -W.current * 0.28 || g.vx < -0.45 ? 0 : 1),
    onPanResponderTerminate: () => go(isOpen.current ? 1 : 0),
  }), [go, p]);
  return useMemo(() => ({ p, shown, open: () => go(1), close: () => go(0), edgeHandlers: edge.panHandlers, drawerHandlers: drawer.panHandlers }), [p, shown, go, edge, drawer]);
}

export function ModalDrawer({ drawer, width, ...menu }) {
  const insets = useSafeAreaInsets();
  if (!drawer.shown) return null;
  const { p } = drawer;
  return (
    <View style={StyleSheet.absoluteFill} {...drawer.drawerHandlers}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0, 0.32] }) }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={drawer.close} accessibilityRole="button" accessibilityLabel="Close the menu" />
      </Animated.View>
      <Animated.View accessibilityViewIsModal style={[st.modal, shadow, { width, transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }) }] }]}>
        <MenuList w={width} op={1} plain top={Math.max(0, insets.top)} {...menu} />
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  side: { backgroundColor: T.bg, overflow: 'hidden' },
  modal: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: T.bg, borderTopRightRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden' },
  row: { height: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 12, gap: 20, overflow: 'hidden' },
  rowOn: { backgroundColor: T.brandContainer },
  rowHover: { backgroundColor: '#1F1F1F14' },
  circle: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  circleTxt: { fontSize: 14, fontWeight: '500', lineHeight: 18 },
  labels: { flex: 1, minWidth: 0, justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '500', color: T.sub, lineHeight: 20 },
  labelOn: { color: T.brandContainerOn },
  sub: { fontSize: 12, color: T.sub, lineHeight: 16, marginTop: -1 },
  badge: { fontSize: 14, fontWeight: '500', color: T.sub },
  plainHead: { height: 52, justifyContent: 'flex-end', paddingBottom: 6, paddingLeft: 16 },
  plainHeadTxt: { fontSize: 14, fontWeight: '700', color: T.sub },
});
