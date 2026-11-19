import React, { Component, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { AppCtx } from './src/ctx';
import { SIDEBAR, T, WIDE, classPair, hair } from './src/theme';
import { useEngine } from './src/engine';
import { Icon, LinearGradient, isOpen, niceCourse, workState } from './src/ui';
import { ClassesScreen, ConnChip } from './src/screens/Home';
import { ClassScreen } from './src/screens/Class';
import { CalendarScreen, FindScreen, TodoScreen, useClasses } from './src/screens/Lists';
import { AttachPicker, ItemScreen, Preview } from './src/screens/Item';
import { ConnectionScreen, MoreScreen, Notice, UpdateStrip, WhatsNew } from './src/screens/More';
import { AddModal } from './src/extra';
import { importZipFile } from './src/ziplib';

// The same places Google Classroom has — your classes, the to-do list, the calendar — plus this app's settings.
const TABS = [['classes', 'Classes', 'school'], ['todo', 'To-do', 'checkbox'], ['calendar', 'Calendar', 'calendar'], ['more', 'Settings', 'settings']];

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
    } catch { setSt((x) => ({ ...x, checking: false, note: manual ? 'The update server can’t be reached on this Wi-Fi. It updates by itself on normal internet.' : '' })); }
  }, []);
  useEffect(() => {
    check(false);
    const sub = AppState.addEventListener('change', (a) => { if (a === 'active') { front.current = Date.now(); check(false); } });
    return () => sub.remove();
  }, [check]);
  return useMemo(() => ({ ...st, check: () => check(true), apply: () => Updates.reloadAsync().catch(() => {}) }), [st, check]);
}

function Sidebar({ active, missing, openClassName }) {
  const e = useContext(AppCtx);
  const classes = useClasses(e.items);
  return (
    <View style={s.side}>
      <View style={s.brand}>
        <LinearGradient colors={['#3D8BFF', '#173FB8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.mark}><Icon n="checkmark-done" s={20} c="#fff" /></LinearGradient>
        <Text style={s.brandTxt}>Classroom Feed</Text>
      </View>
      {[...TABS.slice(0, 3), ['find', 'Search', 'search'], TABS[3]].map(([k, label, icon]) => {
        const on = active === k;
        return (
          <Pressable key={k} onPress={() => (k === 'find' ? e.openFind() : e.goTab(k))} style={({ pressed }) => [s.sideItem, on && s.sideOn, pressed && !on && { backgroundColor: T.soft }]}>
            <Icon n={on || k === 'find' ? icon : icon + '-outline'} s={21} c={on ? T.brand : T.sub} />
            <Text style={[s.sideTxt, on && { color: T.brand, fontWeight: '600' }]}>{label}</Text>
            {k === 'todo' && missing > 0 && <View style={s.badge}><Text style={s.badgeTxt}>{missing > 99 ? '99+' : missing}</Text></View>}
          </Pressable>
        );
      })}
      <Text style={s.sideHead}>Enrolled</Text>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {classes.map((c) => (
          <Pressable key={c.name} onPress={() => { e.goTab('classes'); e.openClass(c.name); }} style={({ pressed }) => [s.sideClass, openClassName === c.name && s.sideOn, pressed && { backgroundColor: T.soft }]}>
            <View style={[s.sideDot, { backgroundColor: classPair(c.name)[0] }]} />
            <Text style={s.sideClassTxt} numberOfLines={1}>{c.name}</Text>
            {c.todo > 0 && <Text style={[s.sideCount, c.late > 0 && { color: T.red }]}>{c.todo}</Text>}
          </Pressable>
        ))}
      </ScrollView>
      <View style={s.sideFoot}><ConnChip /></View>
    </View>
  );
}

function TabBar({ tab, missing, bottom }) {
  const e = useContext(AppCtx);
  return (
    <View style={[s.nav, { paddingBottom: Math.max(bottom, 8) }]}>
      {TABS.map(([k, label, icon]) => {
        const on = tab === k;
        return (
          <Pressable key={k} style={s.navItem} onPress={() => e.goTab(k)}>
            <View style={s.navPill}>
              <Icon n={on ? icon : icon + '-outline'} s={25} c={on ? T.brand : T.faint} />
              {k === 'todo' && missing > 0 && <View style={s.navBadge}><Text style={s.badgeTxt}>{missing > 9 ? '9+' : missing}</Text></View>}
            </View>
            <Text style={[s.navTxt, on && { color: T.brand }]}>{label}</Text>
          </Pressable>
        );
      })}
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

  const openItem = useCallback((id) => setStack((x) => [...x.filter((p) => !(p.t === 'item' && p.id === id)), { t: 'item', id }]), []);
  const engine = useEngine({ onOpenItem: (id) => setStack([{ t: 'item', id }]) }); // tapping a notification opens that post
  const eng = useRef(engine); eng.current = engine;
  const ota = useOta();
  const goTab = useCallback((k, seg) => { setStack([]); setTab(k); if (seg) setTodoSeg(seg); }, []);
  const pop = useCallback(() => setStack((x) => x.slice(0, -1)), []);

  const ctx = useMemo(() => ({
    ...engine, ota, wide, tab, todoSeg, setTodoSeg, goTab, pop, openItem,
    openClass: (name) => setStack((x) => [...x, { t: 'class', name }]),
    openConnection: () => setStack((x) => (x.some((p) => p.t === 'conn') ? x : [...x, { t: 'conn' }])),
    openFind: () => setStack((x) => (x.some((p) => p.t === 'find') ? x : [...x, { t: 'find' }])),
    openPreview: (file, list) => setPreview({ file, list: list && list.length ? list : [file] }),
    openAdd: () => setAdding(true),
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

  const screen = top && top.t === 'class' ? <ClassScreen key={top.name} name={top.name} />
    : top && top.t === 'item' ? <ItemScreen key={top.id} id={top.id} />
      : top && top.t === 'conn' ? <ConnectionScreen />
        : top && top.t === 'find' ? <FindScreen />
          : tab === 'todo' ? <TodoScreen /> : tab === 'calendar' ? <CalendarScreen /> : tab === 'more' ? <MoreScreen /> : <ClassesScreen />;

  return (
    <AppCtx.Provider value={ctx}>
      <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: insets.top }}>
        <UpdateStrip />
        <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
          {wide && <Sidebar active={top ? (top.t === 'class' ? 'classes' : top.t === 'find' ? 'find' : '') : tab} openClassName={top && top.t === 'class' ? top.name : ''} missing={missing} />}
          <View style={{ flex: 1 }}>{screen}</View>
          {!wide && !top && <TabBar tab={tab} missing={missing} bottom={insets.bottom} />}
        </View>
        <Notice text={engine.notice} bottom={(wide || top ? 26 : 92) + insets.bottom} />
        {engine.fresh.length > 0 && (
          <WhatsNew fresh={engine.fresh} onClose={() => engine.setFresh([])}
            onOpen={(it) => { engine.setFresh([]); setTab('classes'); setStack([{ t: 'class', name: niceCourse(it.course) }, { t: 'item', id: it.id }]); }} />
        )}
        {preview && <Preview key={preview.file.id} file={preview.file} list={preview.list} onSwitch={(f) => setPreview({ ...preview, file: f })} onClose={() => setPreview(null)} />}
        {adding && <AddModal classes={[...new Set(engine.items.map((i) => i.course || 'Other'))].sort()} onClose={() => setAdding(false)}
          onSave={(d) => { const it = engine.addItem(d); setAdding(false); setStack([{ t: 'item', id: it.id }]); engine.notify(`Added “${it.title}”`); }} />}
        {incoming && <AttachPicker incoming={incoming} items={engine.items} onClose={() => setIncoming(null)}
          onPick={(it) => { engine.addWork(it, { uri: incoming.uri, name: incoming.name }); setIncoming(null); setStack([{ t: 'item', id: it.id }]); }} />}
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
        <Pressable onPress={() => Updates.reloadAsync().catch(() => this.setState({ err: null }))}><Text style={{ color: T.brand, fontWeight: '700', marginTop: 14 }}>Restart the app</Text></Pressable>
      </View>
    );
  }
}

export default function App() {
  return (<SafeAreaProvider><StatusBar style="dark" /><Boundary><Main /></Boundary></SafeAreaProvider>);
}

const s = StyleSheet.create({
  side: { width: SIDEBAR, backgroundColor: '#F9F9FB', borderRightWidth: hair, borderRightColor: T.line, paddingHorizontal: 12, paddingTop: 14 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingBottom: 16 },
  mark: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  brandTxt: { fontSize: 20, fontWeight: '700', color: T.ink, letterSpacing: -0.3 },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, height: 44, borderRadius: 10, marginBottom: 2 },
  sideOn: { backgroundColor: T.brandSoft },
  sideTxt: { flex: 1, fontSize: 17, color: T.text, letterSpacing: -0.3 },
  sideHead: { fontSize: 13, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.2, marginTop: 20, marginBottom: 6, marginLeft: 12 },
  sideClass: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, height: 40, borderRadius: 10 },
  sideDot: { width: 10, height: 10, borderRadius: 5 },
  sideClassTxt: { flex: 1, fontSize: 15, color: T.text, letterSpacing: -0.2 },
  sideCount: { fontSize: 13, color: T.sub, fontWeight: '600' },
  sideFoot: { paddingVertical: 14, alignItems: 'flex-start', paddingHorizontal: 6 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: T.redFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeTxt: { color: '#fff', fontSize: 12, fontWeight: '600' },
  nav: { flexDirection: 'row', backgroundColor: '#F9F9F9F2', borderTopWidth: hair, borderTopColor: T.line, paddingTop: 6 },
  navItem: { flex: 1, alignItems: 'center', gap: 2 },
  navPill: { paddingHorizontal: 18, paddingVertical: 1 },
  navBadge: { position: 'absolute', top: -4, right: 6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: T.redFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  navTxt: { fontSize: 10.5, color: T.faint, fontWeight: '500' },
  crash: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: T.bg },
  crashTitle: { fontSize: 19, fontWeight: '800', color: T.ink, textAlign: 'center' },
  crashTxt: { fontSize: 13, color: T.sub, textAlign: 'center', marginTop: 10 },
  crashBtn: { marginTop: 20, backgroundColor: T.brand, paddingHorizontal: 22, height: 46, borderRadius: 14, justifyContent: 'center' },
  crashBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
