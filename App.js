import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as DocumentPicker from 'expo-document-picker';
import { WebView } from 'react-native-webview';
import { C, DEFAULTS, PROBES, courseColor, load, makeApi, runProbe, save } from './src/lib';
import { downloadFile, openFile, saveLocal } from './src/files';
import { exportLibraryZip, importZipFile } from './src/ziplib';
import { cancelReminders, scheduleReminders } from './src/remind';

const AppCtx = createContext({});

const dueLabel = (item) => {
  if (!item.dueAt) return item.due || 'No due date';
  return 'Due ' + new Date(item.dueAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const typeOf = (i) => (i.kind === 'announcement' ? 'Announcements' : i.kind === 'material' || i.kind === 'email' ? 'Other' : 'Assignments');

/* ---------- small pieces ---------- */
const Btn = ({ label, onPress, kind = 'solid', disabled }) => (
  <Pressable onPress={onPress} disabled={disabled} style={[s.btn, kind === 'ghost' && s.btnGhost, disabled && { opacity: 0.5 }]}>
    <Text style={[s.btnTxt, kind === 'ghost' && { color: C.blue }]}>{label}</Text>
  </Pressable>
);

function FileRow({ f }) {
  const { saved, openPreview } = useContext(AppCtx);
  const path = f.local || saved[f.id];
  const mine = f.origin === 'upload';
  return (
    <Pressable onPress={() => openPreview(f)} style={s.fileRow}>
      <View style={[s.fileIcon, mine && { backgroundColor: C.green }]}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>{(f.name.split('.').pop() || 'file').slice(0, 4).toUpperCase()}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={s.fileName} numberOfLines={1}>{f.name}</Text>
        <Text style={s.sub}>{mine ? 'Your work' : 'From Classroom'} · {Math.max(1, Math.round((f.size || 0) / 1024))} KB{f.pending ? ' · waiting to upload' : path ? ' · saved offline' : ''}</Text>
      </View>
      <Text style={{ color: C.blue, fontSize: 14, fontWeight: '600' }}>Preview</Text>
    </Pressable>
  );
}

function ItemCard({ item, compact }) {
  const [open, setOpen] = useState(!compact);
  const { toggleSubmitted, pickAndUpload } = useContext(AppCtx);
  const color = courseColor(item.course);
  const overdue = item.dueAt && !item.submitted && item.dueAt < Date.now();
  const files = item.files || [];
  const theirs = files.filter((f) => f.origin !== 'upload');
  const mine = files.filter((f) => f.origin === 'upload');
  const isWork = typeOf(item) === 'Assignments';
  return (
    <Pressable onPress={() => setOpen((o) => !o)} style={[s.card, item.submitted && { opacity: 0.6 }]}>
      <View style={[s.cardHead, { backgroundColor: color }]}>
        <Text style={s.cardCourse} numberOfLines={1}>{item.course || 'Classroom'}</Text>
        <Text style={[s.cardDue, overdue && { color: '#fff', fontWeight: '700' }]}>{item.submitted ? 'Submitted ✓' : overdue ? 'Overdue · ' + dueLabel(item) : dueLabel(item)}</Text>
      </View>
      <View style={{ padding: 14 }}>
        <Text style={s.cardTitle}>{item.title}</Text>
        {open && !!item.body && <Text style={s.cardBody}>{item.body}</Text>}
        {open && theirs.map((f) => <FileRow key={f.id} f={f} />)}
        {open && mine.length > 0 && <Text style={[s.section, { marginTop: 14 }]}>Your work</Text>}
        {open && mine.map((f) => <FileRow key={f.id} f={f} />)}
        {!open && files.length > 0 && <Text style={s.sub}>{files.length} file{files.length > 1 ? 's' : ''} · tap to open</Text>}
        {open && !!item.url && <Text style={[s.sub, { color: C.blue, marginTop: 10 }]} onPress={() => Linking.openURL(item.url)}>Open in Classroom to submit</Text>}
        {open && (
          <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {isWork && <Btn kind="ghost" label="Upload my work" onPress={() => pickAndUpload(item)} />}
            {isWork && <Btn kind="ghost" label={item.submitted ? 'Mark not submitted' : 'Mark as submitted'} onPress={() => toggleSubmitted(item)} />}
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** Full-screen document preview: PDFs/images/docs render in a web view; the file is only saved if you tap Save. */
function Preview({ file, onClose }) {
  const { api, saved, onSaved } = useContext(AppCtx);
  const [busy, setBusy] = useState(false);
  const local = file.local || saved[file.id];
  const uri = local || api.fileUrl(file.id);
  const save = async () => { setBusy(true); try { onSaved(file.id, await downloadFile(uri, file.name)); } catch {} setBusy(false); };
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={s.previewBar}>
          <Btn kind="ghost" label="Close" onPress={onClose} />
          <Text style={[s.fileName, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>{file.name}</Text>
          {busy ? <ActivityIndicator color={C.blue} /> : local ? <Btn kind="ghost" label="Share" onPress={() => openFile(local)} /> : <Btn kind="ghost" label="Save" onPress={save} />}
        </View>
        {Platform.OS === 'web'
          ? <View style={{ padding: 20 }}><Text style={s.sub}>Previews open inside the installed app.</Text><Text style={{ color: C.blue, marginTop: 8 }} onPress={() => Linking.openURL(uri)}>Open in browser</Text></View>
          : <WebView source={{ uri }} originWhitelist={['*']} allowFileAccess allowingReadAccessToURL={local || undefined} startInLoadingState
              renderLoading={() => <ActivityIndicator style={{ marginTop: 40 }} color={C.blue} />}
              renderError={() => <View style={{ padding: 24 }}><Text style={s.cardTitle}>Can’t preview right now</Text><Text style={[s.sub, { marginTop: 6 }]}>No connection. Save it when you’re online and it opens offline.</Text></View>} />}
      </View>
    </Modal>
  );
}

/** A file arrived from another app's share sheet (Quill, Files…): pick which assignment it is the finished work for. */
function AttachPicker({ incoming, items, onPick, onClose }) {
  const list = items.filter((i) => typeOf(i) === 'Assignments' && !i.submitted).sort((a, b) => (a.dueAt || 9e15) - (b.dueAt || 9e15));
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: 50 }}>
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={s.h2}>Which assignment is this for?</Text>
          <Text style={s.sub}>{incoming.name} · it uploads to your account and shows up on all your devices.</Text>
        </View>
        <FlatList data={list} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: 14 }}
          ListEmptyComponent={<Text style={[s.sub, { textAlign: 'center', marginTop: 40 }]}>No open assignments to attach to yet.</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => onPick(item)} style={[s.card, { padding: 14 }]}>
              <Text style={s.sub}>{item.course}</Text>
              <Text style={s.cardTitle}>{item.title}</Text>
              <Text style={s.sub}>{dueLabel(item)}</Text>
            </Pressable>
          )} />
        <View style={{ padding: 14 }}><Btn kind="ghost" label="Cancel" onPress={onClose} /></View>
      </View>
    </Modal>
  );
}

/* ---------- screens ---------- */
function Library({ items, onRefresh, refreshing, status, onShare }) {
  const [course, setCourse] = useState(null);
  const sorted = useMemo(() => [...items].sort((a, b) => (b.posted_at || b.created_at) - (a.posted_at || a.created_at)), [items]);
  const courses = useMemo(() => {
    const m = new Map();
    sorted.forEach((i) => { const k = i.course || 'Other'; const e = m.get(k) || { name: k, count: 0, due: 0 }; e.count++; if (!i.submitted && i.dueAt > Date.now() && typeOf(i) === 'Assignments') e.due++; m.set(k, e); });
    return [...m.values()];
  }, [sorted]);
  if (course) {
    const inClass = sorted.filter((i) => (i.course || 'Other') === course);
    const rows = [];
    for (const sec of ['Assignments', 'Announcements', 'Other']) {
      const list = inClass.filter((i) => typeOf(i) === sec).sort((a, b) => (a.submitted ? 1 : 0) - (b.submitted ? 1 : 0) || (a.dueAt || 9e15) - (b.dueAt || 9e15));
      if (list.length) rows.push({ id: 'h-' + sec, header: sec, n: list.length }, ...list);
    }
    return (
      <FlatList key="class-view" data={rows} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
        ListHeaderComponent={<View style={{ marginBottom: 12 }}><Btn kind="ghost" label="‹ All classes" onPress={() => setCourse(null)} /><Text style={s.h2}>{course}</Text></View>}
        renderItem={({ item }) => (item.header ? <Text style={s.section}>{item.header} · {item.n}</Text> : <ItemCard item={item} compact />)} />
    );
  }
  return (
    <FlatList key="class-tiles" data={courses} keyExtractor={(c) => c.name} numColumns={2} columnWrapperStyle={{ gap: 12 }}
      contentContainerStyle={{ padding: 14, paddingBottom: 30, gap: 12 }} refreshing={refreshing} onRefresh={onRefresh}
      ListHeaderComponent={<View style={{ marginBottom: 6 }}><Text style={s.sub}>{status}</Text>{items.length > 0 && <View style={{ alignItems: 'flex-start', marginTop: 4 }}><Btn kind="ghost" label="Send library to another device" onPress={onShare} /></View>}</View>}
      ListEmptyComponent={<Text style={[s.sub, { textAlign: 'center', marginTop: 60 }]}>Nothing yet. Sign in under Settings and it syncs by itself, or open a Homework zip from Messages (Share → Classroom Feed).</Text>}
      renderItem={({ item: c }) => (
        <Pressable onPress={() => setCourse(c.name)} style={[s.tile, { backgroundColor: courseColor(c.name) }]}>
          <Text style={s.tileName} numberOfLines={3}>{c.name}</Text>
          <Text style={s.tileCount}>{c.count} item{c.count > 1 ? 's' : ''}{c.due ? ` · ${c.due} due` : ''}</Text>
        </Pressable>
      )} />
  );
}

function Network({ cfg }) {
  const [res, setRes] = useState({});
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true); setRes({});
    await Promise.all(PROBES.map(async (p) => { const r = await runProbe(p, cfg); setRes((x) => ({ ...x, [p.name]: r })); }));
    setRunning(false);
  };
  const done = Object.keys(res).length === PROBES.length;
  const ok = (g) => PROBES.filter((p) => p.group === g).some((p) => res[p.name]?.ok);
  let verdict = '';
  if (done) verdict = res[PROBES[0].name]?.ok ? 'Your bot server is reachable here, so the app syncs fully, files included.'
    : ok('Apple') ? 'The bot server is blocked, but Apple/iCloud is reachable. Tell Claude.'
    : 'Only push may get through here. Use the iPad to send you the Homework zip, then Share it to this app.';
  return (
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      <Text style={s.h2}>Network test</Text>
      <Text style={s.sub}>Run this on the restricted Wi-Fi. Any response means a site is reachable; “blocked” means it is not.</Text>
      <View style={{ height: 12 }} />
      <Btn label={running ? 'Testing…' : 'Run test'} onPress={run} disabled={running} />
      <View style={{ height: 12 }} />
      {PROBES.map((p) => {
        const r = res[p.name];
        return (
          <View key={p.name} style={s.probe}>
            <View style={[s.dot, { backgroundColor: !r ? C.line : r.ok ? C.green : C.red }]} />
            <View style={{ flex: 1 }}><Text style={s.fileName}>{p.name}</Text><Text style={s.sub}>{p.group}</Text></View>
            <Text style={[s.sub, { color: !r ? C.sub : r.ok ? C.green : C.red }]}>{!r ? (running ? '…' : '—') : r.ok ? `OK · ${r.ms} ms` : r.error}</Text>
          </View>
        );
      })}
      {!!verdict && <View style={s.verdict}><Text style={{ color: C.text, fontSize: 15 }}>{verdict}</Text></View>}
      {done && <Text selectable style={[s.sub, { marginTop: 12 }]}>{'Report for Claude: ' + PROBES.map((p) => `${p.name}=${res[p.name]?.ok ? 'OK' : 'blocked'}`).join(', ')}</Text>}
    </ScrollView>
  );
}

function Settings({ cfg, onAuth, onSignOut, onSyncNow, status }) {
  const [name, setName] = useState(cfg.name || '');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [mode, setMode] = useState('in');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try { await onAuth(mode, name.trim(), password, invite.trim()); setPassword(''); }
    catch (e) { setErr(e.message || 'Could not reach the server'); }
    setBusy(false);
  };
  if (cfg.token) {
    return (
      <ScrollView contentContainerStyle={{ padding: 14 }}>
        <Text style={s.h2}>Account</Text>
        <View style={s.verdict}><Text style={{ color: C.text }}>Signed in as {cfg.name || 'you'}. Your library, uploads and “submitted” marks sync to every device signed in to this account.</Text></View>
        <Text style={[s.sub, { marginTop: 10 }]}>{status}</Text>
        <View style={{ height: 14 }} />
        <Btn label="Sync now" onPress={onSyncNow} />
        <View style={{ height: 10 }} />
        <Btn kind="ghost" label="Sign out" onPress={onSignOut} />
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
      <Text style={s.h2}>{mode === 'in' ? 'Sign in' : 'Create your account'}</Text>
      <Text style={s.sub}>{mode === 'in' ? 'Use the same name and password on every device.' : 'Do this once, on your first device. You’ll need the 10-character invite code.'}</Text>
      <Text style={s.label}>Name</Text>
      <TextInput value={name} onChangeText={setName} autoCapitalize="none" autoCorrect={false} style={s.field} />
      <Text style={s.label}>Password</Text>
      <TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} style={s.field} />
      {mode === 'up' && (<><Text style={s.label}>Invite code</Text><TextInput value={invite} onChangeText={setInvite} autoCapitalize="none" autoCorrect={false} style={s.field} /></>)}
      {!!err && <Text style={{ color: C.red, marginTop: 10 }}>{err}</Text>}
      <View style={{ height: 14 }} />
      <Btn label={busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'} onPress={go} disabled={busy || !name.trim() || password.length < 6} />
      <View style={{ height: 8 }} />
      <Btn kind="ghost" label={mode === 'in' ? 'New here? Create an account' : 'I already have an account'} onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(''); }} />
    </ScrollView>
  );
}

/* ---------- shell ---------- */
const TABS = [['library', 'Library'], ['net', 'Network'], ['settings', 'Settings']];

function Main() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('library');
  const [cfg, setCfgState] = useState(DEFAULTS);
  const [items, setItems] = useState([]);
  const [saved, setSaved] = useState({});
  const [status, setStatus] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [incoming, setIncoming] = useState(null);
  const [ready, setReady] = useState(false);
  const api = useMemo(() => makeApi(cfg), [cfg]);

  const itemsRef = useRef([]); itemsRef.current = items;
  const queueRef = useRef([]);
  const lastSyncRef = useRef(0);
  const syncing = useRef(false);

  useEffect(() => { (async () => {
    setCfgState(await load('cfg2', DEFAULTS)); setItems(await load('items', [])); setSaved(await load('saved', {}));
    queueRef.current = await load('queue', []); lastSyncRef.current = await load('lastSync', 0);
    setReady(true);
  })(); }, []);

  const persistQueue = () => save('queue', queueRef.current);
  const setCfg = (c) => { setCfgState(c); save('cfg2', c); };

  // Merging never throws away what's on the device: local files and unsent changes survive a sync.
  const merge = useCallback((incomingItems, fromServer) => setItems((cur) => {
    const map = new Map(cur.map((i) => [i.id, i]));
    const pendingState = new Set(queueRef.current.filter((q) => q.type === 'state').map((q) => q.id));
    incomingItems.forEach((i) => {
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

  /** Sends changes made while offline (submitted marks, uploads) as soon as a connection works. */
  const flushQueue = useCallback(async () => {
    while (queueRef.current.length) {
      const q = queueRef.current[0];
      if (q.type === 'state') await api.setSubmitted(q.id, q.submitted);
      else if (q.type === 'upload') {
        const r = await api.upload(q.itemId, q.name, q.uri, q.mime);
        setItems((cur) => { const next = cur.map((i) => (i.id !== q.itemId ? i : { ...i, files: (i.files || []).map((f) => (f.id === q.fileId ? { ...f, id: r.id, pending: false } : f)) })); save('items', next); return next; });
      }
      queueRef.current.shift(); persistQueue();
    }
  }, [api]);

  const sync = useCallback(async () => {
    if (!cfg.token || syncing.current) return;
    syncing.current = true; setRefreshing(true);
    try {
      await flushQueue();
      const r = await api.items(lastSyncRef.current);
      const got = r.items || [];
      merge(got, true);
      got.forEach((it) => { if (it.dueAt && !it.submitted) scheduleReminders(it); else if (it.submitted) cancelReminders(it); });
      lastSyncRef.current = got.reduce((m, i) => Math.max(m, i.updated_at || 0), lastSyncRef.current); save('lastSync', lastSyncRef.current);
      setStatus(`Synced ${new Date().toLocaleTimeString()}${got.length ? ` · ${got.length} updated` : ''}`);
    } catch (e) {
      if (e.status === 401) { setCfg({ ...cfg, token: '' }); setStatus('Please sign in again.'); }
      else setStatus(queueRef.current.length ? `Offline — ${queueRef.current.length} change${queueRef.current.length > 1 ? 's' : ''} will send when you reconnect.` : 'Offline — showing what’s saved on this device.');
    }
    syncing.current = false; setRefreshing(false);
  }, [api, cfg, flushQueue, merge]);

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
    queueRef.current = [...queueRef.current.filter((q) => !(q.type === 'state' && q.id === item.id)), { type: 'state', id: item.id, submitted: updated.submitted }];
    persistQueue(); sync();
  }, [sync]);

  /** Adds a finished file to an assignment: shown at once, uploaded as soon as there is a connection. */
  const uploadFor = useCallback(async (item, asset) => {
    const name = asset.name || 'work';
    const local = await saveLocal(asset.uri, name);
    const fileId = 'pending-' + Date.now();
    const file = { id: fileId, name, size: asset.size || 0, local, origin: 'upload', pending: true };
    setItems((cur) => { const next = cur.map((i) => (i.id === item.id ? { ...i, files: [...(i.files || []), file] } : i)); save('items', next); return next; });
    queueRef.current = [...queueRef.current, { type: 'upload', itemId: item.id, fileId, name, uri: local, mime: asset.mimeType }];
    persistQueue(); sync();
  }, [sync]);

  const pickAndUpload = useCallback(async (item) => {
    try { const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true }); if (!r.canceled) await uploadFor(item, r.assets[0]); } catch {}
  }, [uploadFor]);

  const handleZip = useCallback(async (uri) => {
    const imported = await importZipFile(uri);
    merge(imported, false);
    imported.forEach((it) => scheduleReminders(it));
    setTab('library'); setStatus(`Imported ${imported.length} item${imported.length === 1 ? '' : 's'} into your classes.`);
  }, [merge]);

  // Files opened with Share → Classroom Feed: a Homework zip fills the library; anything else (e.g. from Quill) is your finished work.
  useEffect(() => {
    const handle = (u) => {
      if (!u || !/^file:/i.test(u)) return;
      const name = decodeURIComponent(u.split('/').pop().split('?')[0]);
      if (/\.zip$/i.test(name)) handleZip(u).catch(() => setStatus('Could not read that zip.'));
      else setIncoming({ uri: u, name });
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [handleZip]);

  const shareLibrary = useCallback(async () => {
    try { await openFile(await exportLibraryZip(itemsRef.current)); } catch { setStatus('Sharing needs the installed app.'); }
  }, []);

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

  const ctx = useMemo(() => ({ api, saved, onSaved, toggleSubmitted, pickAndUpload, openPreview: setPreview }), [api, saved, onSaved, toggleSubmitted, pickAndUpload]);

  return (
    <AppCtx.Provider value={ctx}>
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
        <View style={s.top}><Text style={s.topTitle}>Classroom Feed</Text></View>
        <View style={{ flex: 1 }}>
          {tab === 'library' && <Library items={items} onRefresh={sync} refreshing={refreshing} status={cfg.token ? status : 'Sign in under Settings to sync.'} onShare={shareLibrary} />}
          {tab === 'net' && <Network cfg={cfg} />}
          {tab === 'settings' && <Settings cfg={cfg} onAuth={onAuth} onSignOut={() => setCfg({ ...cfg, token: '' })} onSyncNow={sync} status={status} />}
        </View>
        <View style={[s.tabs, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {TABS.map(([k, label]) => (
            <Pressable key={k} style={s.tab} onPress={() => setTab(k)}>
              <View style={[s.tabPill, tab === k && { backgroundColor: '#e8f0fe' }]}><Text style={[s.tabTxt, tab === k && { color: C.blue, fontWeight: '700' }]}>{label}</Text></View>
            </Pressable>
          ))}
        </View>
        {preview && <Preview file={preview} onClose={() => setPreview(null)} />}
        {incoming && <AttachPicker incoming={incoming} items={items} onClose={() => setIncoming(null)} onPick={(it) => { uploadFor(it, { uri: incoming.uri, name: incoming.name }); setIncoming(null); setTab('library'); }} />}
      </View>
    </AppCtx.Provider>
  );
}

export default function App() {
  return (<SafeAreaProvider><StatusBar style="dark" /><Main /></SafeAreaProvider>);
}

const s = StyleSheet.create({
  top: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  topTitle: { fontSize: 20, color: C.text, fontWeight: '600' },
  card: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, marginBottom: 12, overflow: 'hidden' },
  cardHead: { paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardCourse: { color: '#fff', fontWeight: '600', fontSize: 14, flex: 1, marginRight: 8 },
  cardDue: { color: '#ffffffcc', fontSize: 12 },
  cardTitle: { fontSize: 17, color: C.text, fontWeight: '600' },
  cardBody: { fontSize: 14, color: C.sub, marginTop: 8, lineHeight: 20 },
  sub: { fontSize: 12, color: C.sub },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: C.line },
  fileIcon: { width: 40, height: 40, borderRadius: 6, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 14, color: C.text, fontWeight: '500' },
  btn: { backgroundColor: C.blue, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, alignItems: 'center' },
  btnGhost: { backgroundColor: 'transparent', paddingHorizontal: 10 },
  btnTxt: { color: '#fff', fontWeight: '600', fontSize: 14 },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center' },
  tabPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  tabTxt: { fontSize: 13, color: C.sub },
  h2: { fontSize: 22, color: C.text, fontWeight: '600', marginBottom: 6 },
  label: { fontSize: 13, color: C.sub, marginTop: 14, marginBottom: 6 },
  field: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 12, fontSize: 15, color: C.text },
  probe: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  verdict: { marginTop: 8, padding: 14, borderRadius: 10, backgroundColor: '#e8f0fe' },
  section: { fontSize: 13, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 10, marginBottom: 8 },
  tile: { flex: 1, minHeight: 120, borderRadius: 12, padding: 14, justifyContent: 'space-between' },
  tileName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  tileCount: { color: '#ffffffcc', fontSize: 12 },
  previewBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 52, paddingHorizontal: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.line },
});
