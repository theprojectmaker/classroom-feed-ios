import React, { Component, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { AppCtx } from './src/ctx';
import { SIDEBAR, T, WIDE, classTone, shadow } from './src/theme';
import { useEngine } from './src/engine';
import { useAppFonts } from './src/fonts';
import { load, save } from './src/lib';
import { Avatar, MIcon, MoreMenu, Text, isOpen, niceCourse, teacherOf, workState } from './src/ui';
import { ClassesScreen, ConnChip } from './src/screens/Home';
import { ClassScreen } from './src/screens/Class';
import { CalendarScreen, FindScreen, TodoScreen, useClasses } from './src/screens/Lists';
import { AttachPicker, ItemScreen, Preview } from './src/screens/Item';
import { ConnectionScreen, MoreScreen, Notice, UpdateStrip, WhatsNew } from './src/screens/More';
import { AddModal } from './src/extra';
import { importZipFile } from './src/ziplib';

/**
 * Over-the-air updates: newer app code is fetched when the app opens AND every time it comes back to the front
 * (iOS keeps apps alive for days, so a launch-only check would almost never run). Right after opening it switches
 * straight to the new version; later on it shows a "tap to restart" strip instead of interrupting.
 */
function useOta() {
  const [st, setSt] = useState({ checking: false, ready: false, note: '', id: (Updates && Updates.updateId) || '' });
  const last = useRef(0), front = useRef(Date.now());
  const check = useCallback(async (manual) => {
    if (__DEV__ || Platform.OS === 'web' || !Updates.isEnabled) { if (manual) setSt((x) => ({ ...x, note: 'Updates only apply to the installed app.' })); return; }
    if (!manual && Date.now() - last.current < 60000) return;
    last.current = Date.now(); setSt((x) => ({ ...x, checking: true, note: '' }));
    try {
      const r = await Updates.checkForUpdateAsync();
      if (r.isAvailable) {
        await Updates.fetchUpdateAsync();
        if (manual || Date.now() - front.current < 8000) { await Updates.reloadAsync(); return; }
        setSt((x) => ({ ...x, checking: false, ready: true }));
      } else setSt((x) => ({ ...x, checking: false, note: manual ? 'You have the newest version.' : '' }));
    } catch { setSt((x) => ({ ...x, checking: false, note: manual ? 'The update server can’t be reached on this Wi-Fi. New versions arrive through TestFlight.' : '' })); }
  }, []);
  useEffect(() => {
    check(false);
    const sub = AppState.addEventListener('change', (a) => { if (a === 'active') { front.current = Date.now(); check(false); } });
    return () => sub.remove();
  }, [check]);
  return useMemo(() => ({ ...st, check: () => check(true), apply: () => Updates.reloadAsync().catch(() => {}) }), [st, check]);
}

/* ---------- the menu (Classroom's navigation drawer) ---------- */
function NavItem({ mi, miOn, label, on, badge, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.nav, on && s.navOn, pressed && !on && { backgroundColor: T.tonal }]}>
      <MIcon n={on ? miOn : mi} s={24} c={on ? T.brandOn : T.sub} />
      <Text style={[s.navTxt, on && { color: T.brandOn, fontWeight: '500' }]} numberOfLines={1}>{label}</Text>
      {badge > 0 && <Text style={[s.navBadge, on && { color: T.brandOn }]}>{badge > 99 ? '99+' : badge}</Text>}
    </Pressable>
  );
}

function DrawerPanel({ active, openClassName, missing, onGo, onClass, onFind }) {
  const e = useContext(AppCtx);
  const classes = useClasses(e.items);
  const teachers = useMemo(() => Object.fromEntries(classes.map((c) => [c.name, teacherOf(e.items.filter((i) => (i.course || 'Other') === c.name))])), [classes, e.items]);
  return (
    <View style={s.drawer}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 12 }}>
        <NavItem mi="home-outline" miOn="home" label="Home" on={active === 'classes'} onPress={() => onGo('classes')} />
        <NavItem mi="calendar-blank-outline" miOn="calendar-blank" label="Calendar" on={active === 'calendar'} onPress={() => onGo('calendar')} />
        <View style={s.rule} />
        <Text style={s.drawerHead}>Enrolled</Text>
        {classes.map((c) => {
          const on = openClassName === c.name, tone = classTone(c.name);
          return (
            <Pressable key={c.name} onPress={() => onClass(c.name)} style={({ pressed }) => [s.nav, on && s.navOn, pressed && !on && { backgroundColor: T.tonal }]}>
              <Avatar name={niceCourse(c.name)} size={32} color={tone.solid} />
              <View style={{ flex: 1 }}>
                <Text style={[s.navTxt, { fontSize: 14 }, on && { color: T.brandOn, fontWeight: '500' }]} numberOfLines={1}>{niceCourse(c.name)}</Text>
                {!!teachers[c.name] && <Text style={s.navSub} numberOfLines={1}>{teachers[c.name]}</Text>}
              </View>
              {c.late > 0 && <View style={s.dot} />}
            </Pressable>
          );
        })}
        <View style={s.rule} />
        <NavItem mi="clipboard-check-outline" miOn="clipboard-check" label="To-do" on={active === 'todo'} badge={missing} onPress={() => onGo('todo')} />
        <NavItem mi="magnify" miOn="magnify" label="Search" on={active === 'find'} onPress={onFind} />
        <NavItem mi="cog-outline" miOn="cog" label="Settings" on={active === 'more'} onPress={() => onGo('more')} />
      </ScrollView>
      <View style={s.drawerFoot}><ConnChip /></View>
    </View>
  );
}

/** On a phone the menu slides over the page from the left; the page behind is dimmed. */
function PhoneDrawer({ open, onClose, width, children }) {
  const x = useRef(new Animated.Value(open ? 0 : -width)).current;
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) { setShown(true); Animated.timing(x, { toValue: 0, duration: 220, useNativeDriver: true }).start(); }
    else Animated.timing(x, { toValue: -width, duration: 180, useNativeDriver: true }).start(() => setShown(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: '#00000052' }]} onPress={onClose} />
      <Animated.View style={[s.phoneDrawer, { width, transform: [{ translateX: x }] }, shadow]}>{children}</Animated.View>
    </View>
  );
}

function Main() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const [tab, setTab] = useState('classes');
  const [stack, setStack] = useState([]);
  const [todoSeg, setTodoSeg] = useState('todo');
  const [preview, setPreview] = useState(null);
  const [adding, setAdding] = useState(false);
  const [incoming, setIncoming] = useState(null);
  const [drawer, setDrawer] = useState(false);    // phone: the menu is sliding over the page
  const [menuOpen, setMenuOpen] = useState(false); // big screen: closed to begin with, like Classroom; the choice is remembered
  const menuLoaded = useRef(false);
  useEffect(() => { load('menuOpen', false).then((v) => { setMenuOpen(!!v); menuLoaded.current = true; }); }, []);
  useEffect(() => { if (menuLoaded.current) save('menuOpen', menuOpen); }, [menuOpen]);
  const [menu, setMenu] = useState(null);         // a row's three-dot menu

  const openItem = useCallback((id) => setStack((x) => [...x.filter((p) => !(p.t === 'item' && p.id === id)), { t: 'item', id }]), []);
  const engine = useEngine({ onOpenItem: (id) => setStack([{ t: 'item', id }]) }); // tapping a notification opens that post
  const eng = useRef(engine); eng.current = engine;
  const ota = useOta();
  const goTab = useCallback((k, seg) => { setStack([]); setTab(k); setDrawer(false); if (seg) setTodoSeg(seg); }, []);
  const pop = useCallback(() => setStack((x) => x.slice(0, -1)), []);

  const ctx = useMemo(() => ({
    ...engine, ota, wide, tab, todoSeg, setTodoSeg, goTab, pop, openItem,
    openClass: (name, tab) => { setDrawer(false); setStack((x) => [...x.filter((p) => p.t !== 'class'), { t: 'class', name, tab }]); },
    openConnection: () => setStack((x) => (x.some((p) => p.t === 'conn') ? x : [...x, { t: 'conn' }])),
    openFind: () => { setDrawer(false); setStack((x) => (x.some((p) => p.t === 'find') ? x : [...x, { t: 'find' }])); },
    openPreview: (file, list) => setPreview({ file, list: list && list.length ? list : [file] }),
    openAdd: () => setAdding(true),
    openDrawer: () => (wide ? setMenuOpen((o) => !o) : setDrawer(true)),
    openMenu: (items) => setMenu(items),
  }), [engine, ota, wide, tab, todoSeg, goTab, pop, openItem]);

  // A file shared into the app from another app (your notes app, Files…): ask which assignment it is for.
  // (A Homework zip from the older Messages route still opens too, quietly.)
  useEffect(() => {
    const handle = (u) => {
      if (!u || !/^file:/i.test(u)) return;
      let name = u.split('/').pop().split('?')[0];
      try { name = decodeURIComponent(name); } catch { /* keep the raw name */ }
      if (/\.zip$/i.test(name)) {
        importZipFile(u).then((got) => { eng.current.applyIncoming(got, false); eng.current.notify(`Imported ${got.length} item${got.length === 1 ? '' : 's'}.`); })
          .catch(() => eng.current.notify('Could not read that zip.'));
      } else setIncoming({ uri: u, name });
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', (ev) => handle(ev.url));
    return () => sub.remove();
  }, []);

  const top = stack[stack.length - 1];
  const missing = useMemo(() => engine.items.filter((i) => isOpen(i) && workState(i) === 'late').length, [engine.items]);
  if (!engine.ready) return <View style={{ flex: 1, backgroundColor: T.bg }} />;

  const screen = top && top.t === 'class' ? <ClassScreen key={top.name + (top.tab || '')} name={top.name} tab={top.tab} />
    : top && top.t === 'item' ? <ItemScreen key={top.id} id={top.id} />
      : top && top.t === 'conn' ? <ConnectionScreen />
        : top && top.t === 'find' ? <FindScreen />
          : tab === 'todo' ? <TodoScreen /> : tab === 'calendar' ? <CalendarScreen /> : tab === 'more' ? <MoreScreen /> : <ClassesScreen />;

  const active = top ? (top.t === 'class' ? 'class' : top.t === 'find' ? 'find' : '') : tab;
  const panel = (
    <DrawerPanel active={active} openClassName={top && top.t === 'class' ? top.name : ''} missing={missing}
      onGo={goTab} onClass={(n) => ctx.openClass(n)} onFind={() => ctx.openFind()} />
  );

  return (
    <AppCtx.Provider value={ctx}>
      <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: insets.top }}>
        <UpdateStrip />
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {wide && menuOpen && <View style={{ width: SIDEBAR }}>{panel}</View>}
          <View style={{ flex: 1 }}>{screen}</View>
        </View>
        <Notice text={engine.notice} bottom={26 + insets.bottom} />
        {!wide && <PhoneDrawer open={drawer} onClose={() => setDrawer(false)} width={Math.min(320, width - 56)}>{panel}</PhoneDrawer>}
        {engine.fresh.length > 0 && (
          <WhatsNew fresh={engine.fresh} onClose={() => engine.setFresh([])}
            onOpen={(it) => { engine.setFresh([]); setTab('classes'); setStack([{ t: 'class', name: it.course || 'Other' }, { t: 'item', id: it.id }]); }} />
        )}
        {preview && <Preview key={preview.file.id} file={preview.file} list={preview.list} onSwitch={(f) => setPreview({ ...preview, file: f })} onClose={() => setPreview(null)} />}
        {adding && <AddModal classes={[...new Set(engine.items.map((i) => i.course || 'Other'))].sort()} onClose={() => setAdding(false)}
          onSave={(d) => { const it = engine.addItem(d); setAdding(false); setStack([{ t: 'item', id: it.id }]); engine.notify(`Added “${it.title}”`); }} />}
        {incoming && <AttachPicker incoming={incoming} items={engine.items} onClose={() => setIncoming(null)}
          onPick={(it) => { engine.addWork(it, { uri: incoming.uri, name: incoming.name }); setIncoming(null); setStack([{ t: 'item', id: it.id }]); }} />}
        <MoreMenu items={menu} onClose={() => setMenu(null)} />
      </View>
    </AppCtx.Provider>
  );
}

/** If a screen ever fails to draw, show what happened and a way out instead of a blank app. */
class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <View style={s.crash}>
        <Text style={s.crashTitle}>Something went wrong on this screen</Text>
        <Text selectable style={s.crashTxt}>{String((this.state.err && this.state.err.message) || this.state.err).slice(0, 400)}</Text>
        <Pressable onPress={() => this.setState({ err: null })} style={s.crashBtn}><Text style={s.crashBtnTxt}>Try again</Text></Pressable>
        <Pressable onPress={() => Updates.reloadAsync().catch(() => this.setState({ err: null }))}><Text style={{ color: T.brand, fontWeight: '500', marginTop: 14 }}>Restart the app</Text></Pressable>
      </View>
    );
  }
}

/** Waits (a moment) for the Google Sans fonts; if they fail the app simply carries on with the system font. */
function Root() {
  const ready = useAppFonts();
  if (!ready) return <View style={{ flex: 1, backgroundColor: T.bg }} />;
  return <Boundary><Main /></Boundary>;
}

export default function App() {
  return (<SafeAreaProvider><StatusBar style="dark" /><Root /></SafeAreaProvider>);
}

const s = StyleSheet.create({
  drawer: { flex: 1, backgroundColor: T.bg, borderRightWidth: 1, borderRightColor: T.line },
  phoneDrawer: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: T.bg, borderTopRightRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden', paddingTop: 24 },
  drawerFoot: { paddingVertical: 12, paddingHorizontal: 20, alignItems: 'flex-start' },
  drawerHead: { fontSize: 14, fontWeight: '500', color: T.sub, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  rule: { height: 1, backgroundColor: T.line, marginVertical: 8, marginHorizontal: 4 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 52, borderRadius: 28 },
  navOn: { backgroundColor: T.brandSoft },
  navTxt: { flex: 1, fontSize: 15, color: T.ink },
  navSub: { fontSize: 12, color: T.sub, marginTop: 1 },
  navBadge: { fontSize: 14, fontWeight: '500', color: T.sub },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: T.red },
  crash: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: T.bg },
  crashTitle: { fontSize: 20, color: T.ink, textAlign: 'center' },
  crashTxt: { fontSize: 13, color: T.sub, textAlign: 'center', marginTop: 10 },
  crashBtn: { marginTop: 20, backgroundColor: T.brand, paddingHorizontal: 24, height: 40, borderRadius: 20, justifyContent: 'center' },
  crashBtnTxt: { color: '#fff', fontWeight: '500', fontSize: 14 },
});
