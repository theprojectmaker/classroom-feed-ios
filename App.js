import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as DocumentPicker from 'expo-document-picker';
import { C, DEFAULTS, load, makeApi, save } from './src/lib';
import { fileSize, openFile, saveLocal, removeLocal, resolveLocal, fileExists, downloadFile, saveBase64 } from './src/files';
import { exportLibraryZip, importZipFile } from './src/ziplib';
import { cancelReminders, scheduleReminders } from './src/remind';
import { AppCtx } from './src/ctx';
import { cloudLibrary, cloudFileBase64 } from './src/cloud';
import { Icon, isWork, niceCourse } from './src/ui';
import { AttachPicker, ClassScreen, ClassesScreen, ItemScreen, NetworkScreen, Notice, Preview, SettingsScreen, TodoScreen, WhatsNew } from './src/screens';
import { AddModal, SearchScreen } from './src/extra';

const NAV = [['classes', 'Classes', 'home'], ['todo', 'To-do', 'checkbox'], ['find', 'Find', 'search'], ['settings', 'Settings', 'settings']];

function Main() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('classes');
  const [stack, setStack] = useState([]);
  const [cfg, setCfgState] = useState(DEFAULTS);
  const [items, setItems] = useState([]);
  const [saved, setSaved] = useState({});
  const [status, setStatus] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [incoming, setIncoming] = useState(null);
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState(false);
  const [fresh, setFresh] = useState([]);
  const [checkInfo, setCheckInfo] = useState(null);
  const [ck, setCk] = useState(null); // read-only iCloud details, learned while the bot is reachable
  const ckRef = useRef(null); ckRef.current = ck;
  const [ready, setReady] = useState(false);
  const api = useMemo(() => makeApi(cfg), [cfg]);

  const itemsRef = useRef([]); itemsRef.current = items;
  const queueRef = useRef([]);
  const lastSyncRef = useRef(0);
  const syncing = useRef(false);
  const noticeTimer = useRef(null);

  const notify = useCallback((msg) => {
    setNotice(msg); clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 3200);
  }, []);
  const push = useCallback((screen) => setStack((x) => [...x, screen]), []);
  const pop = useCallback(() => setStack((x) => x.slice(0, -1)), []);

  useEffect(() => { (async () => {
    setCfgState(await load('cfg2', DEFAULTS)); setItems((await load('items', [])).map((i) => ({ ...i, course: niceCourse(i.course) }))); setSaved(await load('saved', {}));
    setCk(await load('ck', null));
    queueRef.current = await load('queue', []); lastSyncRef.current = await load('lastSync', 0);
    setReady(true);
  })(); }, []);

  const persistQueue = () => save('queue', queueRef.current);
  const setCfg = (c) => { setCfgState(c); save('cfg2', c); };

  // Merging never throws away what's on the device: local files and unsent changes survive a sync.
  const merge = useCallback((incomingItems, fromServer) => setItems((cur) => {
    const map = new Map(cur.map((i) => [i.id, i]));
    const pendingState = new Set(queueRef.current.filter((q) => q.type === 'state').map((q) => q.id));
    incomingItems.forEach((raw) => {
      const i = { ...raw, course: niceCourse(raw.course) };
      const old = map.get(i.id);
      if (!old) { map.set(i.id, { ...i, submitted: !!i.submitted }); return; }
      const keepLocal = (old.files || []).filter((f) => f.local || f.pending);
      const names = new Set(keepLocal.map((f) => f.name));
      const files = [...keepLocal, ...(i.files || []).filter((f) => !names.has(f.name))];
      map.set(i.id, { ...old, ...i, files, dueAt: i.dueAt || old.dueAt || 0,
        submitted: pendingState.has(i.id) ? old.submitted : (fromServer ? !!i.submitted : old.submitted || !!i.submitted) });
    });
    const next = [...map.values()].sort((a, b) => (b.posted_at || b.created_at) - (a.posted_at || a.created_at));
    save('items', next); return next;
  }), []);

  const onSaved = useCallback((id, path) => setSaved((x) => { const n = { ...x, [id]: path }; save('saved', n); return n; }), []);

  /** Sends changes made while offline (done marks, uploads) as soon as a connection works. */
  const flushQueue = useCallback(async () => {
    // A failed send never blocks pulling new work: a network error keeps the change for later, a rejected one (4xx) is dropped.
    while (queueRef.current.length) {
      const q = queueRef.current[0];
      try {
        if (q.type === 'state') await api.setSubmitted(q.id, q.submitted);
        else if (q.type === 'upload') {
          const r = await api.upload(q.itemId, q.name, resolveLocal(q.uri), q.mime);
          setItems((cur) => { const next = cur.map((i) => {
            if (i.id !== q.itemId) return i;
            const files = i.files || [];
            // The server already had this exact file (a retry, or another device uploaded it): keep one copy.
            if (files.some((f) => f.id === r.id)) return { ...i, files: files.filter((f) => f.id !== q.fileId) };
            return { ...i, files: files.map((f) => (f.id === q.fileId ? { ...f, id: r.id, pending: false } : f)) };
          }); save('items', next); return next; });
        }
      } catch (e) {
        if (e.status === 401) throw e;
        if (!(e.status >= 400 && e.status < 500)) break; // offline or server hiccup: try again next sync
      }
      queueRef.current.shift(); persistQueue();
    }
  }, [api]);

  // Every attachment is copied onto the device as soon as it is seen, so it opens with no connection.
  const savedRef = useRef({}); savedRef.current = saved;
  const autoSaving = useRef(false);
  const autoSave = useCallback(async (viaCloud) => {
    if (Platform.OS === 'web' || autoSaving.current) return;
    autoSaving.current = true;
    try {
      for (const it of itemsRef.current) {
        for (const f of it.files || []) {
          if (f.pending || f.local || String(f.id).startsWith('local-')) continue;
          const cur = savedRef.current[f.id];
          if (cur && await fileExists(cur)) continue;
          try {
            const p = viaCloud ? await saveBase64(await cloudFileBase64(ckRef.current, f), f.name, f.id) : await downloadFile(api.fileUrl(f.id), f.name, f.id);
            onSaved(f.id, p);
          } catch (e) { if (!viaCloud || e.status === 401) return; }
        }
      }
    } finally { autoSaving.current = false; }
  }, [api, onSaved]);

  const applyIncoming = useCallback((got) => {
    const known = new Set(itemsRef.current.map((i) => i.id));
    const brandNew = got.filter((i) => !known.has(i.id) && i.kind !== 'email');
    if (known.size && brandNew.length) setFresh(brandNew);
    merge(got, true);
    got.forEach((it) => { if (it.dueAt && !it.submitted) scheduleReminders(it); else if (it.submitted) cancelReminders(it); });
  }, [merge]);

  const sync = useCallback(async () => {
    if (!cfg.token || syncing.current) return;
    syncing.current = true; setRefreshing(true);
    try {
      await flushQueue();
      const r = await api.items(lastSyncRef.current);
      const got = r.items || [];
      applyIncoming(got);
      try { const st = await api.status(); setCheckInfo(st); if (st.ck) { setCk(st.ck); save('ck', st.ck); } } catch { /* the banner just keeps its last values */ }
      lastSyncRef.current = got.reduce((m, i) => Math.max(m, i.updated_at || 0), lastSyncRef.current); save('lastSync', lastSyncRef.current);
      setStatus(`Synced ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${got.length ? ` · ${got.length} updated` : ''}`);
      setTimeout(() => autoSave(false), 600);
    } catch (e) {
      if (e.status === 401) { setCfg({ ...cfg, token: '' }); setStatus('Please sign in again.'); }
      else if (ckRef.current && await (async () => {
        // The bot can't be reached (restricted Wi-Fi): read the library from iCloud instead.
        try { const lib = await cloudLibrary(ckRef.current); applyIncoming(lib.items); setStatus(`Synced from iCloud ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · this network blocks the bot`); setTimeout(() => autoSave(true), 600); return true; } catch { return false; }
      })()) { /* status already set */ }
      else setStatus(queueRef.current.length ? `Offline · ${queueRef.current.length} change${queueRef.current.length > 1 ? 's' : ''} will send when you reconnect` : 'Offline · showing what’s saved on this device');
    }
    syncing.current = false; setRefreshing(false);
  }, [api, cfg, flushQueue, merge, applyIncoming, autoSave]);

  // Sync on launch, when the app comes to the front, and every minute while open (reconnects are picked up automatically).
  useEffect(() => { if (ready && cfg.token) sync(); }, [ready, cfg.token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setInterval(() => sync(), 60000);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') sync(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [sync]);

  const toggleSubmitted = useCallback((item) => {
    const updated = { ...item, submitted: !item.submitted };
    setItems((cur) => { const next = cur.map((i) => (i.id === item.id ? updated : i)); save('items', next); return next; });
    if (updated.submitted) cancelReminders(updated); else scheduleReminders(updated);
    if (item.mine) return; // your own assignments live on this device only
    queueRef.current = [...queueRef.current.filter((q) => !(q.type === 'state' && q.id === item.id)), { type: 'state', id: item.id, submitted: updated.submitted }];
    persistQueue(); sync();
  }, [sync]);

  /** Notes, steps, stars: saved on the device and never overwritten by a sync. */
  const updateItem = useCallback((id, patch) => setItems((cur) => { const next = cur.map((i) => (i.id === id ? { ...i, ...patch } : i)); save('items', next); return next; }), []);
  const deleteItem = useCallback((id) => setItems((cur) => { const next = cur.filter((i) => i.id !== id); save('items', next); return next; }), []);
  const addItem = useCallback((d) => {
    const now = Date.now();
    const it = { id: 'mine-' + now, kind: d.kind === 'material' ? 'material' : 'assignment', course: niceCourse(d.course), title: d.title, body: d.body || '', due: '', dueAt: d.dueAt || 0, posted_at: now, created_at: now, updated_at: now, mine: true, submitted: false, files: [], url: '' };
    setItems((cur) => { const next = [it, ...cur]; save('items', next); return next; });
    if (it.dueAt) scheduleReminders(it);
    setAdding(false); setStack([{ t: 'item', id: it.id }]); notify(`Added “${it.title}”`);
  }, [notify]);

  /** Adds a finished file to an assignment (shown at once, uploaded when online). The same file is never added twice. */
  const uploadFor = useCallback(async (item, asset) => {
    const name = asset.name || 'work';
    const local = await saveLocal(asset.uri, name);
    const size = asset.size || (await fileSize(local));
    const cur = itemsRef.current.find((i) => i.id === item.id) || item;
    const dupFile = (cur.files || []).some((f) => f.origin === 'upload' && f.name === name && (!f.size || !size || f.size === size));
    const dupQueued = queueRef.current.some((q) => q.type === 'upload' && q.itemId === item.id && q.name === name);
    if (dupFile || dupQueued) { await removeLocal(local); notify(`“${name}” is already uploaded for this assignment.`); return; }
    const fileId = 'pending-' + Date.now();
    const file = { id: fileId, name, size, local, origin: 'upload', pending: !cur.mine };
    setItems((c) => { const next = c.map((i) => (i.id === item.id ? { ...i, files: [...(i.files || []), file] } : i)); save('items', next); return next; });
    if (cur.mine) { notify(`Added “${name}”`); return; } // your own assignment: the file stays on this device
    queueRef.current = [...queueRef.current, { type: 'upload', itemId: item.id, fileId, name, uri: local, mime: asset.mimeType }];
    persistQueue(); notify(`Added “${name}”${cfg.token ? ' · uploading' : ''}`); sync();
  }, [sync, notify, cfg.token]);

  const pickAndUpload = useCallback(async (item) => {
    try { const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true }); if (!r.canceled) await uploadFor(item, r.assets[0]); } catch {}
  }, [uploadFor]);

  const handleZip = useCallback(async (uri) => {
    const imported = await importZipFile(uri);
    const known = new Set(itemsRef.current.map((i) => i.id));
    const brandNew = imported.filter((i) => !known.has(i.id));
    if (brandNew.length) setFresh(brandNew);
    merge(imported, false);
    imported.forEach((it) => scheduleReminders(it));
    setStack([]); setTab('classes');
    const nf = imported.reduce((n, i) => n + (i.files || []).length, 0);
    notify(`Imported ${imported.length} item${imported.length === 1 ? '' : 's'}${nf ? ` · ${nf} file${nf === 1 ? '' : 's'} saved offline` : ''}.`);
  }, [merge, notify]);

  // Files opened with Share → Classroom Feed: a Homework zip fills the library; anything else (e.g. from Quill) is your finished work.
  useEffect(() => {
    const handle = (u) => {
      if (!u || !/^file:/i.test(u)) return;
      const name = decodeURIComponent(u.split('/').pop().split('?')[0]);
      if (/\.zip$/i.test(name)) handleZip(u).catch(() => notify('Could not read that zip.'));
      else setIncoming({ uri: u, name });
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [handleZip, notify]);

  const shareLibrary = useCallback(async () => {
    try { await openFile(await exportLibraryZip(itemsRef.current)); } catch { notify('Sharing needs the installed app.'); }
  }, [notify]);

  const onAuth = useCallback(async (mode, name, password, invite) => {
    const open = makeApi({ ...cfg, token: '' });
    const r = mode === 'up' ? await open.register(name, password, invite) : await open.login(name, password);
    setCfg({ ...cfg, token: r.token, name: r.name });
  }, [cfg]);

  useEffect(() => { (async () => {
    if (!cfg.token || Platform.OS === 'web') return;
    try { const p = await Notifications.requestPermissionsAsync(); if (!p.granted) return; const tok = await Notifications.getExpoPushTokenAsync(); await api.registerPush(tok.data); } catch {}
  })(); }, [cfg.token, api]);

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => { const d = n.request.content.data; if (d && d.item) merge([d.item], true); });
    return () => sub.remove();
  }, [merge]);

  const goTab = (k) => { setStack([]); setTab(k); };
  const ctx = useMemo(() => ({
    items, cfg, api, saved, onSaved, status, refreshing, checkInfo, ck, refresh: sync, toggleSubmitted, pickAndUpload, shareLibrary, onAuth,
    onSignOut: () => setCfg({ ...cfg, token: '' }),
    updateItem, deleteItem, openAdd: () => setAdding(true),
    openPreview: (file, list) => setPreview({ file, list: list && list.length ? list : [file] }), openClass: (name) => push({ t: 'class', name }), openItem: (id) => push({ t: 'item', id }),
    openNetwork: () => push({ t: 'network' }), pop,
  }), [items, cfg, api, saved, onSaved, status, refreshing, checkInfo, ck, sync, toggleSubmitted, pickAndUpload, shareLibrary, onAuth, push, pop, updateItem, deleteItem]); // eslint-disable-line react-hooks/exhaustive-deps

  const top = stack[stack.length - 1];
  const dueSoon = items.filter((i) => isWork(i) && !i.submitted && i.dueAt && i.dueAt < Date.now() + 2 * 86400000).length;

  return (
    <AppCtx.Provider value={ctx}>
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
        <View style={{ flex: 1 }}>
          {top?.t === 'class' ? <ClassScreen key={top.name} name={top.name} />
            : top?.t === 'item' ? <ItemScreen key={top.id} id={top.id} />
            : top?.t === 'network' ? <NetworkScreen cfg={cfg} />
            : tab === 'classes' ? <ClassesScreen />
            : tab === 'todo' ? <TodoScreen />
            : tab === 'find' ? <SearchScreen />
            : <SettingsScreen />}
        </View>
        {!top && (tab === 'classes' || tab === 'todo') && (
          <Pressable onPress={() => setAdding(true)} style={[s.fab, { bottom: 76 + Math.max(insets.bottom, 8) }]}>
            <Icon n="add" s={30} c="#fff" />
          </Pressable>
        )}
        {!top && (
          <View style={[s.nav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            {NAV.map(([k, label, icon]) => {
              const on = tab === k;
              return (
                <Pressable key={k} style={s.navItem} onPress={() => goTab(k)}>
                  <View style={[s.navPill, on && { backgroundColor: '#e8f0fe' }]}>
                    <Icon n={on ? icon : icon + '-outline'} s={22} c={on ? C.blue : C.sub} />
                    {k === 'todo' && dueSoon > 0 && <View style={s.badge}><Text style={s.badgeTxt}>{dueSoon > 9 ? '9+' : dueSoon}</Text></View>}
                  </View>
                  <Text style={[s.navTxt, on && { color: C.blue, fontWeight: '700' }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <Notice text={notice} />
        {fresh.length > 0 && <WhatsNew fresh={fresh} onClose={() => setFresh([])} onOpen={(it) => { setFresh([]); setTab('classes'); setStack([{ t: 'class', name: niceCourse(it.course) }, { t: 'item', id: it.id }]); }} />}
        {preview && <Preview key={preview.file.id} file={preview.file} list={preview.list} onSwitch={(f) => setPreview({ ...preview, file: f })} onClose={() => setPreview(null)} />}
        {adding && <AddModal classes={[...new Set(items.map((i) => i.course || 'Other'))].sort()} onSave={addItem} onClose={() => setAdding(false)} />}
        {incoming && <AttachPicker incoming={incoming} items={items} onClose={() => setIncoming(null)}
          onPick={(it) => { uploadFor(it, { uri: incoming.uri, name: incoming.name }); setIncoming(null); setStack([{ t: 'item', id: it.id }]); }} />}
      </View>
    </AppCtx.Provider>
  );
}

export default function App() {
  return (<SafeAreaProvider><StatusBar style="dark" /><Main /></SafeAreaProvider>);
}

const s = StyleSheet.create({
  nav: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, paddingTop: 6 },
  navItem: { flex: 1, alignItems: 'center', gap: 2 },
  navPill: { paddingHorizontal: 20, paddingVertical: 4, borderRadius: 16 },
  navTxt: { fontSize: 12, color: C.sub },
  badge: { position: 'absolute', top: -2, right: 8, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  fab: { position: 'absolute', right: 18, width: 58, height: 58, borderRadius: 29, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
