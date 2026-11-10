import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { C, DEFAULTS, PROBES, courseColor, fmtDue, load, makeApi, runProbe, sameDay, save } from './src/lib';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { downloadFile, openFile, saveLocal } from './src/files';
import { exportLibraryZip, importZipFile } from './src/ziplib';
import { cancelReminders, scheduleReminders } from './src/remind';

// Lets any card toggle "submitted" without threading a prop through every screen.
const AppCtx = createContext({ toggleSubmitted: () => {} });
const dueLabel = (item) => {
  if (!item.dueAt) return item.due || 'No due date';
  const d = new Date(item.dueAt);
  return 'Due ' + d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const typeOf = (i) => (i.kind === 'announcement' ? 'Announcements' : i.kind === 'assignment' || i.kind === 'quiz' || i.kind === 'question' || !i.kind ? 'Assignments' : 'Other');

/* ---------- small pieces ---------- */
const Btn = ({ label, onPress, kind = 'solid', disabled }) => (
  <Pressable onPress={onPress} disabled={disabled} style={[s.btn, kind === 'ghost' && s.btnGhost, disabled && { opacity: 0.5 }]}>
    <Text style={[s.btnTxt, kind === 'ghost' && { color: C.blue }]}>{label}</Text>
  </Pressable>
);

function FileRow({ f, api, saved, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const path = f.local || saved[f.id];
  const get = async () => {
    setBusy(true); setErr('');
    try { onSaved(f.id, await downloadFile(api.fileUrl(f.id), f.name)); }
    catch { setErr('Download failed — will work on a better connection'); }
    setBusy(false);
  };
  return (
    <View style={s.fileRow}>
      <View style={s.fileIcon}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>{(f.name.split('.').pop() || 'file').slice(0, 4).toUpperCase()}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={s.fileName} numberOfLines={1}>{f.name}</Text>
        <Text style={s.sub}>{err || `${Math.max(1, Math.round(f.size / 1024))} KB${path ? ' · saved offline' : ''}`}</Text>
      </View>
      {busy ? <ActivityIndicator color={C.blue} /> : path ? <Btn kind="ghost" label="Open" onPress={() => openFile(path)} /> : f.local === undefined && f.id.indexOf('local-') !== 0 ? <Btn kind="ghost" label="Save" onPress={get} /> : null}
    </View>
  );
}

function ItemCard({ item, api, saved, onSaved, compact }) {
  const [open, setOpen] = useState(!compact);
  const { toggleSubmitted } = useContext(AppCtx);
  const color = courseColor(item.course);
  const overdue = item.dueAt && !item.submitted && item.dueAt < Date.now();
  return (
    <Pressable onPress={() => setOpen((o) => !o)} style={[s.card, item.submitted && { opacity: 0.6 }]}>
      <View style={[s.cardHead, { backgroundColor: color }]}>
        <Text style={s.cardCourse} numberOfLines={1}>{item.course || (item.kind === 'email' ? 'Email' : 'Classroom')}</Text>
        <Text style={[s.cardDue, overdue && { color: '#fff', fontWeight: '700' }]}>{item.submitted ? 'Submitted ✓' : overdue ? 'Overdue · ' + dueLabel(item) : dueLabel(item)}</Text>
      </View>
      <View style={{ padding: 14 }}>
        <Text style={s.cardTitle}>{item.title}</Text>
        {open && !!item.body && <Text style={s.cardBody}>{item.body}</Text>}
        {open && (item.files || []).map((f) => <FileRow key={f.id} f={f} api={api} saved={saved} onSaved={onSaved} />)}
        {!open && (item.files || []).length > 0 && <Text style={s.sub}>{item.files.length} attachment{item.files.length > 1 ? 's' : ''} · tap to open</Text>}
        {open && !!item.url && <Text style={[s.sub, { color: C.blue, marginTop: 8 }]} onPress={() => Linking.openURL(item.url)}>Open in Classroom</Text>}
        {open && <View style={{ marginTop: 10, alignItems: 'flex-start' }}><Btn kind="ghost" label={item.submitted ? 'Mark not submitted' : 'Mark as submitted'} onPress={() => toggleSubmitted(item)} /></View>}
      </View>
    </Pressable>
  );
}

/* ---------- screens ---------- */
/** Library: Classroom-style class tiles; tap one to see its assignments and files. */
function Library({ items, api, saved, onSaved, onRefresh, refreshing, status, onShare }) {
  const [course, setCourse] = useState(null);
  const sorted = useMemo(() => [...items].sort((a, b) => (b.posted_at || b.created_at) - (a.posted_at || a.created_at)), [items]);
  const courses = useMemo(() => {
    const m = new Map();
    sorted.forEach((i) => { const k = i.course || 'Other'; m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].map(([name, count]) => ({ name, count }));
  }, [sorted]);
  if (course) {
    const inClass = sorted.filter((i) => (i.course || 'Other') === course);
    // Sections: Assignments (soonest due first, submitted last), Announcements, Other.
    const rows = [];
    for (const sec of ['Assignments', 'Announcements', 'Other']) {
      const list = inClass.filter((i) => typeOf(i) === sec).sort((a, b) => (a.submitted ? 1 : 0) - (b.submitted ? 1 : 0) || (a.dueAt || 9e15) - (b.dueAt || 9e15));
      if (list.length) rows.push({ id: 'h-' + sec, header: sec, n: list.length }, ...list);
    }
    return (
      <FlatList
        key="class-view"
        data={rows}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
        ListHeaderComponent={<View style={{ marginBottom: 12 }}><Btn kind="ghost" label="‹ All classes" onPress={() => setCourse(null)} /><Text style={s.h2}>{course}</Text></View>}
        renderItem={({ item }) => item.header
          ? <Text style={s.section}>{item.header} · {item.n}</Text>
          : <ItemCard item={item} api={api} saved={saved} onSaved={onSaved} compact />}
      />
    );
  }
  return (
    <FlatList
      key="class-tiles"
      data={courses}
      keyExtractor={(c) => c.name}
      numColumns={2}
      columnWrapperStyle={{ gap: 12 }}
      contentContainerStyle={{ padding: 14, paddingBottom: 30, gap: 12 }}
      refreshing={refreshing}
      onRefresh={onRefresh}
      ListHeaderComponent={<View style={{ marginBottom: 6 }}><Text style={s.sub}>{status}</Text>{items.length > 0 && <View style={{ alignItems: 'flex-start', marginTop: 4 }}><Btn kind="ghost" label="Send library to another device" onPress={onShare} /></View>}</View>}
      ListEmptyComponent={<Text style={[s.sub, { textAlign: 'center', marginTop: 60 }]}>Nothing yet. Open a Homework zip from Messages (Share → Classroom Feed), or use the Import tab.</Text>}
      renderItem={({ item: c }) => (
        <Pressable onPress={() => setCourse(c.name)} style={[s.tile, { backgroundColor: courseColor(c.name) }]}>
          <Text style={s.tileName} numberOfLines={3}>{c.name}</Text>
          <Text style={s.tileCount}>{c.count} item{c.count > 1 ? 's' : ''}</Text>
        </Pressable>
      )}
    />
  );
}

/** Turns the plain text the bot sends ("Course / Title / Due… / body") back into a library item. */
export function parseMessage(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const course = (lines[0] || '').trim();
  const title = (lines[1] || '').trim();
  const hasDue = /^(Due|No due)/i.test((lines[2] || '').trim());
  const due = hasDue ? lines[2].trim() : '';
  const body = lines.slice(hasDue ? 3 : 2).join('\n').trim();
  let h = 0; for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return { id: 'msg-' + h, kind: 'assignment', course: course || 'Other', title: title || 'Message', due, body, url: '', created_at: Date.now(), posted_at: Date.now(), files: [] };
}

function Importer({ items, onAdd, onAttach, onZip }) {
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const latest = items[0];
  const add = (t) => {
    if (!t.trim()) { setNote('Nothing to import — copy the message first.'); return; }
    const it = parseMessage(t); onAdd(it); setText(''); setNote(`Added “${it.title}” to ${it.course}.`);
  };
  const paste = async () => { try { add(await Clipboard.getStringAsync()); } catch { setNote('Could not read the clipboard.'); } };
  const pick = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (r.canceled) return;
      await onAttach(r.assets);
      setNote(`Attached ${r.assets.length} file${r.assets.length > 1 ? 's' : ''}.`);
    } catch { setNote('Could not attach the file.'); }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
      <Text style={s.h2}>Import</Text>
      <Text style={s.sub}>Easiest: in Messages, touch and hold the Homework zip, tap Share, then pick Classroom Feed. It sorts everything into classes for you. Or choose the zip from Files here.</Text>
      <View style={{ height: 14 }} />
      <Btn label="Open a Homework zip…" onPress={async () => {
        try { const r = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'public.zip-archive', '*/*'], copyToCacheDirectory: true }); if (!r.canceled) setNote(await onZip(r.assets[0].uri)); }
        catch { setNote('Could not open that zip.'); }
      }} />
      <View style={{ height: 22 }} />
      <Text style={s.label}>Just a text message?</Text>
      <Btn kind="ghost" label="Paste copied message" onPress={paste} />
      <View style={{ height: 10 }} />
      <Btn kind="ghost" label={latest ? `2. Attach file(s) to “${latest.title.slice(0, 28)}”` : '2. Attach file(s)'} onPress={pick} disabled={!latest} />
      {!!note && <View style={s.verdict}><Text style={{ color: C.text }}>{note}</Text></View>}
      <Text style={s.label}>Or paste text here</Text>
      <TextInput value={text} onChangeText={setText} multiline placeholder="Course\nTitle\nDue…\n\nInstructions" placeholderTextColor={C.sub} style={[s.field, { minHeight: 120, textAlignVertical: 'top' }]} />
      <View style={{ height: 10 }} />
      <Btn label="Add to library" onPress={() => add(text)} disabled={!text.trim()} />
    </ScrollView>
  );
}

function Chat({ items, api, saved, onSaved, onNewItems }) {
  const [msgs, setMsgs] = useState([{ id: 'hi', from: 'bot', text: 'Hi! Ask me for your assignments, e.g. “send me all assignments from today”.' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const push = (m) => setMsgs((x) => [...x, { id: String(Date.now() + Math.random()), ...m }]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setText(''); push({ from: 'me', text: t }); setBusy(true);
    try {
      const r = await api.ask(t);
      onNewItems(r.items || []);
      push({ from: 'bot', text: r.reply || `Found ${(r.items || []).length}.`, items: r.items || [] });
    } catch {
      // Offline / blocked network: answer from what is already saved on the phone.
      const today = /today/i.test(t);
      const local = today ? items.filter((i) => sameDay(i.created_at)) : items.slice(0, 10);
      push({ from: 'bot', text: `Can’t reach the bot right now, so here is what’s saved on your phone${today ? ' from today' : ''} (${local.length}).`, items: local });
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        ref={ref}
        data={msgs}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 14 }}
        onContentSizeChange={() => ref.current?.scrollToEnd({ animated: true })}
        renderItem={({ item: m }) => (
          <View style={{ marginBottom: 10, alignItems: m.from === 'me' ? 'flex-end' : 'flex-start' }}>
            <View style={[s.bubble, m.from === 'me' ? s.bubbleMe : s.bubbleBot]}>
              <Text style={{ color: m.from === 'me' ? '#fff' : C.text, fontSize: 15 }}>{m.text}</Text>
            </View>
            {(m.items || []).map((i) => <View key={i.id} style={{ width: '100%', marginTop: 8 }}><ItemCard item={i} api={api} saved={saved} onSaved={onSaved} compact /></View>)}
          </View>
        )}
        ListFooterComponent={busy ? <Text style={s.sub}>Searching Classroom…</Text> : null}
      />
      <View style={s.inputBar}>
        <TextInput value={text} onChangeText={setText} placeholder="Ask for assignments…" placeholderTextColor={C.sub} style={s.input} onSubmitEditing={send} returnKeyType="send" />
        <Btn label="Send" onPress={send} disabled={busy || !text.trim()} />
      </View>
    </KeyboardAvoidingView>
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
  if (done) verdict = res[PROBES[0].name]?.ok ? 'Your bot server is reachable here — the app can sync fully, files included.'
    : ok('Apple') ? 'The bot server is blocked, but Apple/iCloud is reachable. Tell Claude — files may be able to travel through iCloud.'
    : 'Only push may get through here. The app will show the text from each push and download files later on a real connection.';
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

function Settings({ cfg, setCfg }) {
  const [server, setServer] = useState(cfg.server);
  const [key, setKey] = useState(cfg.key);
  return (
    <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
      <Text style={s.h2}>Settings</Text>
      <Text style={s.label}>Bot server address</Text>
      <TextInput value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} style={s.field} />
      <Text style={s.label}>Access key</Text>
      <TextInput value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} secureTextEntry style={s.field} />
      <View style={{ height: 12 }} />
      <Btn label="Save" onPress={() => setCfg({ server: server.trim(), key: key.trim() })} />
    </ScrollView>
  );
}

/* ---------- shell ---------- */
const TABS = [['library', 'Library'], ['import', 'Import'], ['chat', 'Chat'], ['net', 'Network'], ['settings', 'Settings']];

function Main() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('library');
  const [cfg, setCfgState] = useState(DEFAULTS);
  const [items, setItems] = useState([]);
  const [saved, setSaved] = useState({});
  const [status, setStatus] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const api = useMemo(() => makeApi(cfg), [cfg]);

  useEffect(() => { (async () => {
    setCfgState(await load('cfg', DEFAULTS)); setItems(await load('items', [])); setSaved(await load('saved', {}));
  })(); }, []);

  // Merging never throws away what's already on the device: local files, due time and "submitted" survive a sync.
  const merge = useCallback((incoming) => setItems((cur) => {
    const map = new Map(cur.map((i) => [i.id, i]));
    incoming.forEach((i) => {
      const old = map.get(i.id);
      if (!old) { map.set(i.id, i); return; }
      const localFiles = (old.files || []).filter((f) => f.local);
      const names = new Set(localFiles.map((f) => f.name));
      const files = [...localFiles, ...(i.files || []).filter((f) => !names.has(f.name))];
      map.set(i.id, { ...old, ...i, files, dueAt: i.dueAt || old.dueAt || 0, submitted: old.submitted || false });
    });
    const next = [...map.values()].sort((a, b) => (b.posted_at || b.created_at) - (a.posted_at || a.created_at));
    save('items', next); return next;
  }), []);

  const toggleSubmitted = useCallback((item) => {
    const updated = { ...item, submitted: !item.submitted };
    setItems((cur) => { const next = cur.map((i) => (i.id === item.id ? updated : i)); save('items', next); return next; });
    if (updated.submitted) cancelReminders(updated); else scheduleReminders(updated);
  }, []);

  // A zip arriving from Messages' share sheet (or the picker): file it into classes and schedule reminders.
  const handleZip = useCallback(async (uri) => {
    const imported = await importZipFile(uri);
    merge(imported);
    imported.forEach((it) => scheduleReminders(it));
    setTab('library');
    const msg = `Imported ${imported.length} assignment${imported.length === 1 ? '' : 's'} into your classes.`;
    setStatus(msg);
    return msg;
  }, [merge]);

  useEffect(() => {
    const isZip = (u) => !!u && /\.zip(\?|$)/i.test(u);
    Linking.getInitialURL().then((u) => { if (isZip(u)) handleZip(u).catch(() => setStatus('Could not read that zip.')); }).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => { if (isZip(e.url)) handleZip(e.url).catch(() => setStatus('Could not read that zip.')); });
    return () => sub.remove();
  }, [handleZip]);

  const shareLibrary = useCallback(async () => {
    try {
      const path = await exportLibraryZip(items);
      await openFile(path); // AirDrop / Messages / Save to Files — the other device opens it the same way
    } catch { setStatus('Sharing needs the installed app.'); }
  }, [items]);
  const onSaved = useCallback((id, path) => setSaved((x) => { const n = { ...x, [id]: path }; save('saved', n); return n; }), []);
  const setCfg = (c) => { setCfgState(c); save('cfg', c); };
  // Attach picked files to the newest item (copied into the app so they open offline).
  const onAttach = useCallback(async (assets) => {
    const target = items[0]; if (!target) return;
    const files = [];
    for (const a of assets) {
      const path = await saveLocal(a.uri, a.name || 'file');
      files.push({ id: 'local-' + Date.now() + '-' + files.length, name: a.name || 'file', size: a.size || 0, local: path });
    }
    merge([{ ...target, files: [...(target.files || []), ...files] }]);
  }, [items, merge]);

  const sync = useCallback(async () => {
    if (!cfg.key) { setStatus('Add your access key in Settings first.'); return; }
    setRefreshing(true);
    try {
      const since = items.reduce((m, i) => Math.max(m, i.created_at), 0);
      const r = await api.items(since);
      merge(r.items || []);
      setStatus(`Synced ${new Date().toLocaleTimeString()} · ${(r.items || []).length} new`);
    } catch { setStatus('Offline — showing what’s saved on your phone.'); }
    setRefreshing(false);
  }, [api, cfg.key, items, merge]);

  useEffect(() => { if (cfg.key) sync(); }, [cfg.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Register for push once a key exists, so new assignments arrive even when nothing else gets through.
  useEffect(() => { (async () => {
    if (!cfg.key || Platform.OS === 'web') return;
    try {
      const p = await Notifications.requestPermissionsAsync();
      if (!p.granted) return;
      const tok = await Notifications.getExpoPushTokenAsync();
      await api.registerPush(tok.data);
    } catch {}
  })(); }, [cfg.key, api]);

  // A push can carry the item itself (title/body/data) — store it so it's readable with zero connection.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const d = n.request.content.data;
      if (d && d.item) merge([d.item]);
    });
    return () => sub.remove();
  }, [merge]);

  return (
    <AppCtx.Provider value={{ toggleSubmitted }}>
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <View style={s.top}><Text style={s.topTitle}>Classroom Feed</Text></View>
      <View style={{ flex: 1 }}>
        {tab === 'library' && <Library items={items} api={api} saved={saved} onSaved={onSaved} onRefresh={sync} refreshing={refreshing} status={status} onShare={shareLibrary} />}
        {tab === 'import' && <Importer items={items} onAdd={(it) => { merge([it]); }} onAttach={onAttach} onZip={handleZip} />}
        {tab === 'chat' && <Chat items={items} api={api} saved={saved} onSaved={onSaved} onNewItems={merge} />}
        {tab === 'net' && <Network cfg={cfg} />}
        {tab === 'settings' && <Settings cfg={cfg} setCfg={setCfg} />}
      </View>
      <View style={[s.tabs, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {TABS.map(([k, label]) => (
          <Pressable key={k} style={s.tab} onPress={() => setTab(k)}>
            <View style={[s.tabPill, tab === k && { backgroundColor: '#e8f0fe' }]}><Text style={[s.tabTxt, tab === k && { color: C.blue, fontWeight: '700' }]}>{label}</Text></View>
          </Pressable>
        ))}
      </View>
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
  bubble: { maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleMe: { backgroundColor: C.blue, borderBottomRightRadius: 4 },
  bubbleBot: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderBottomLeftRadius: 4 },
  inputBar: { flexDirection: 'row', gap: 8, padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, alignItems: 'center' },
  input: { flex: 1, backgroundColor: C.bg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: C.text },
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
});
