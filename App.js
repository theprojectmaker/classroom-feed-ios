import React, { Component, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { AppCtx } from './src/ctx';
import { BAR_BREAK, RAIL, SIDEBAR, T, WIDE, setClassMeta } from './src/theme';
import { useEngine } from './src/engine';
import { useAppFonts } from './src/fonts';
import { load, save } from './src/lib';
import { AppBar, Avatar, IconBtn, MoreMenu, Text, isOpen, niceCourse, workState } from './src/ui';
import { classLine } from './src/classes';
import { ModalDrawer, Sidebar, useModalDrawer } from './src/nav';
import { ClassesScreen, ConnChip } from './src/screens/Home';
import { ClassScreen } from './src/screens/Class';
import { CalendarScreen, FindScreen, TodoScreen } from './src/screens/Lists';
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
  const [sideOpen, setSideOpen] = useState(true);         // big screen: the sidebar is open (300 wide) or shrunk to a rail of icons (76); remembered
  const [enrolledOpen, setEnrolledOpen] = useState(true); // the "Enrolled" list in the sidebar is unfolded; remembered
  const restored = useRef(false);
  useEffect(() => { Promise.all([load('sideOpen', true), load('enrolledOpen', true)]).then(([a, b]) => { setSideOpen(a !== false); setEnrolledOpen(b !== false); restored.current = true; }); }, []);
  useEffect(() => { if (restored.current) { save('sideOpen', sideOpen); save('enrolledOpen', enrolledOpen); } }, [sideOpen, enrolledOpen]);
  const popW = Math.min(304, width - 56);
  const dr = useModalDrawer(popW, !wide);              // below 1040 px the menu is a pop-over: slides over a dimmed page, drag it shut, swipe in from the left edge
  const drRef = useRef(dr); drRef.current = dr;
  useEffect(() => { if (wide) drRef.current.close(); }, [wide]); // turned to landscape with the pop-over open: it gives way to the sidebar
  const [menu, setMenu] = useState(null);                // a row's three-dot menu

  const openItem = useCallback((id) => setStack((x) => [...x.filter((p) => !(p.t === 'item' && p.id === id)), { t: 'item', id }]), []);
  const engine = useEngine({ onOpenItem: (id) => setStack([{ t: 'item', id }]) }); // tapping a notification opens that post
  const eng = useRef(engine); eng.current = engine;
  const ota = useOta();
  const goTab = useCallback((k, seg) => { setStack([]); setTab(k); drRef.current.close(); if (seg) setTodoSeg(seg); }, []);
  const pop = useCallback(() => setStack((x) => x.slice(0, -1)), []);

  const ctx = useMemo(() => ({
    ...engine, ota, wide, sideW: wide ? (sideOpen ? SIDEBAR : RAIL) : 0, tab, todoSeg, setTodoSeg, goTab, pop, openItem,
    openClass: (name, tab) => { drRef.current.close(); setStack([{ t: 'class', name, tab }]); }, // like a link in Classroom: the class page replaces whatever was open
    openConnection: () => setStack((x) => (x.some((p) => p.t === 'conn') ? x : [...x, { t: 'conn' }])),
    openFind: () => { drRef.current.close(); setStack([{ t: 'find' }]); },
    openPreview: (file, list) => setPreview({ file, list: list && list.length ? list : [file] }),
    openAdd: () => setAdding(true),
    openDrawer: () => (wide ? setSideOpen((o) => !o) : drRef.current.open()),
    openMenu: (items) => setMenu(items),
  }), [engine, ota, wide, sideOpen, tab, todoSeg, goTab, pop, openItem]);

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
  setClassMeta(engine.remote && engine.remote.classes); // Classroom's own class order, sections and badge colours — set before anything below draws
  if (!engine.ready) return <View style={{ flex: 1, backgroundColor: T.bg }} />;

  const screen = top && top.t === 'class' ? <ClassScreen key={top.name + (top.tab || '')} name={top.name} tab={top.tab} />
    : top && top.t === 'item' ? <ItemScreen key={top.id} id={top.id} />
      : top && top.t === 'conn' ? <ConnectionScreen />
        : top && top.t === 'find' ? <FindScreen />
          : tab === 'todo' ? <TodoScreen /> : tab === 'calendar' ? <CalendarScreen /> : tab === 'more' ? <MoreScreen /> : <ClassesScreen />;

  // The class you are in (a class page, or an assignment of it) stays marked in the menu and gives the top bar its crumb.
  const curClass = top && top.t === 'class' ? top.name : top && top.t === 'item' ? ((engine.items.find((i) => i.id === top.id) || {}).course || 'Other') : '';
  const active = top ? (curClass ? 'class:' + curClass : top.t === 'find' ? 'find' : '') : tab;
  const menuProps = { active, missing, enrolledOpen, onToggleEnrolled: () => setEnrolledOpen((o) => !o), onGo: goTab, onClass: (n) => ctx.openClass(n), onFind: () => ctx.openFind() };

  // One top bar for the whole app, above the sidebar and the page — as in Classroom. Big/medium screens: ☰, the logo and a
  // "Classroom › class" breadcrumb; phones: a back arrow with the class name and its section.
  const goHome = () => goTab('classes');
  const phone = width < BAR_BREAK;
  const rightSide = (
    <View style={s.barRight}>
      <ConnChip compact={!wide} />
      {(!phone || (!top && tab === 'classes')) && <IconBtn mi="plus" onPress={ctx.openAdd} color={T.sub} />}
      {!phone && <Pressable onPress={() => goTab('more')} hitSlop={6} accessibilityRole="button" accessibilityLabel="Settings"><Avatar name={engine.cfg.name || 'S'} size={32} /></Pressable>}
    </View>
  );
  const line = curClass ? classLine(engine.remote, engine.items, curClass) : '';
  let bar;
  if (curClass) {
    bar = width >= BAR_BREAK
      ? { brand: true, onMenu: ctx.openDrawer, onBrand: goHome, crumb: niceCourse(curClass), crumbSub: line, onCrumb: top.t === 'item' ? () => ctx.openClass(curClass) : undefined, right: rightSide }
      : { onBack: pop, title: niceCourse(curClass), subtitle: line };
  } else if (top && (top.t === 'find' || top.t === 'conn')) {
    const name = top.t === 'find' ? 'Search' : 'Connection';
    bar = width >= BAR_BREAK ? { brand: true, onMenu: ctx.openDrawer, onBrand: goHome, crumb: name, right: rightSide } : { onBack: pop, title: name };
  } else bar = { brand: true, compactBrand: phone, onMenu: ctx.openDrawer, onBrand: tab === 'classes' ? undefined : goHome, crumb: tab === 'todo' ? 'To-do' : tab === 'calendar' ? 'Calendar' : tab === 'more' ? 'Settings' : '', right: rightSide };

  return (
    <AppCtx.Provider value={ctx}>
      <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
        <UpdateStrip />
        <AppBar {...bar} />
        <View style={s.body} {...(wide ? null : dr.edgeHandlers)}>
          {wide && <Sidebar open={sideOpen} onExpand={() => setSideOpen(true)} {...menuProps} />}
          <View style={[s.content, wide && s.contentWide]}>{screen}</View>
        </View>
        <Notice text={engine.notice} bottom={26 + insets.bottom} />
        {!wide && <ModalDrawer drawer={dr} width={popW} {...menuProps} />}
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
  body: { flex: 1, flexDirection: 'row' },
  content: { flex: 1, minWidth: 0 },
  contentWide: { borderTopLeftRadius: 28, overflow: 'hidden' }, // beside the sidebar the page has a rounded corner, as in Classroom
  barRight: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },
  crash: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: T.bg },
  crashTitle: { fontSize: 20, color: T.ink, textAlign: 'center' },
  crashTxt: { fontSize: 13, color: T.sub, textAlign: 'center', marginTop: 10 },
  crashBtn: { marginTop: 20, backgroundColor: T.brand, paddingHorizontal: 24, height: 40, borderRadius: 20, justifyContent: 'center' },
  crashBtnTxt: { color: '#fff', fontWeight: '500', fontSize: 14 },
});
