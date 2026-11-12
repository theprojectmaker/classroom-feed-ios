import React, { useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { C, PROBES, courseColor, runProbe } from './lib';
import { downloadFile, openFile, saveBase64 } from './files';
import { ckLookup, cloudFileBase64 } from './cloud';
import { AppCtx } from './ctx';
import { BUCKETS, Icon, addedDetail, agoLabel, inCheckHours, nextCheckAt, whenLabel, SectionHeader, WorkRow, bucketOf, isWork, kindOf, niceCourse, postedDetail, postedLabel, shortDue, statusOf, st } from './ui';

export const Btn = ({ label, onPress, kind = 'solid', disabled, icon }) => (
  <Pressable onPress={onPress} disabled={disabled} style={[s.btn, kind === 'ghost' && s.btnGhost, kind === 'outline' && s.btnOutline, disabled && { opacity: 0.5 }]}>
    {icon ? <Icon n={icon} s={18} c={kind === 'solid' ? '#fff' : C.blue} /> : null}
    <Text style={[s.btnTxt, kind !== 'solid' && { color: C.blue }]}>{label}</Text>
  </Pressable>
);

export function AppBar({ title, subtitle, color, onBack, right }) {
  const onColor = !!color;
  return (
    <View style={[s.bar, onColor && { backgroundColor: color, borderBottomWidth: 0 }]}>
      {onBack ? <Pressable onPress={onBack} hitSlop={12} style={s.barBack}><Icon n="arrow-back" s={24} c={onColor ? '#fff' : C.text} /></Pressable> : null}
      <View style={{ flex: 1 }}>
        <Text style={[s.barTitle, onColor && { color: '#fff' }]} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={[s.barSub, onColor && { color: '#ffffffcc' }]} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

/* ---------- "Next check" banner ---------- */
function CheckBanner() {
  const { checkInfo } = useContext(AppCtx);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const seen = checkInfo?.pcSeen || 0;
  const quiet = inCheckHours(now) && (!seen || now - seen > 25 * 60 * 1000);
  return (
    <View style={[s.checkCard, quiet && s.checkWarn]}>
      <Icon n={quiet ? 'warning-outline' : 'time-outline'} s={22} c={quiet ? '#b45309' : C.blue} />
      <View style={{ flex: 1 }}>
        <Text style={s.checkMain}>Next check: {whenLabel(nextCheckAt(now))}</Text>
        <Text style={s.checkSub}>
          {seen ? `Last check ${whenLabel(seen)} (${agoLabel(seen, now)})` : 'Waiting for the first check'}
          {checkInfo?.lastNew ? ` · newest post found ${whenLabel(checkInfo.lastNew)}` : ''}
        </Text>
        <Text style={s.checkSub}>Every 5 min on school days, 8:00 AM–2:30 PM</Text>
        {quiet && <Text style={s.checkAlert}>The checker hasn’t reported lately. Make sure the computer is on and awake.</Text>}
      </View>
    </View>
  );
}

/* ---------- Classes (home) ---------- */
export function ClassesScreen() {
  const { items, openClass, openItem, refresh, refreshing, status } = useContext(AppCtx);
  const { width } = useWindowDimensions();
  const cols = width >= 900 ? 3 : width >= 600 ? 2 : 1;
  const [q, setQ] = useState('');
  const classes = useMemo(() => {
    const m = new Map();
    items.forEach((i) => {
      const k = i.course || 'Other';
      const e = m.get(k) || { name: k, todo: 0, next: 0, count: 0 };
      e.count++;
      if (isWork(i) && !i.submitted) { e.todo++; if (i.dueAt && i.dueAt > Date.now() && (!e.next || i.dueAt < e.next)) e.next = i.dueAt; }
      m.set(k, e);
    });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);
  // Fill the last row with blanks so cards keep the same width.
  const padded = cols > 1 ? [...classes, ...Array.from({ length: (cols - (classes.length % cols)) % cols }, (_, i) => ({ name: '__pad' + i, pad: true }))] : classes;
  const hits = q.trim() ? items.filter((i) => (i.title + ' ' + i.course).toLowerCase().includes(q.trim().toLowerCase())) : null;
  return (
    <View style={{ flex: 1 }}>
      <AppBar title="Classes" subtitle={status} />
      <View style={s.searchWrap}>
        <Icon n="search" s={18} c={C.sub} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search all your work" placeholderTextColor={C.sub} style={s.search} autoCorrect={false} />
        {!!q && <Pressable onPress={() => setQ('')} hitSlop={10}><Icon n="close-circle" s={18} c={C.sub} /></Pressable>}
      </View>
      {!hits && <CheckBanner />}
      {hits ? (
        <FlatList data={hits} keyExtractor={(i) => i.id} keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={s.empty}>No matches.</Text>}
          renderItem={({ item }) => <WorkRow item={item} color={courseColor(item.course)} showCourse onPress={() => openItem(item.id)} />} />
      ) : (
        <FlatList key={'cols' + cols} data={padded} keyExtractor={(c) => c.name} numColumns={cols}
          columnWrapperStyle={cols > 1 ? { gap: 14 } : undefined}
          contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListEmptyComponent={<Text style={s.empty}>No classes yet.{'\n'}Sign in under Settings and your classes appear here, or open a Homework zip from Messages (Share → Classroom Feed).</Text>}
          renderItem={({ item: c }) => {
            if (c.pad) return <View style={{ flex: 1 }} />;
            const color = courseColor(c.name);
            return (
              <Pressable onPress={() => openClass(c.name)} style={[s.classCard, cols > 1 && { flex: 1 }]}>
                <View style={[s.classBanner, { backgroundColor: color }]}>
                  <Text style={s.classTitle} numberOfLines={2}>{c.name}</Text>
                  <Text style={s.classSub}>{c.count} post{c.count === 1 ? '' : 's'}</Text>
                  <View style={s.avatar}><Text style={[s.avatarTxt, { color }]}>{c.name.trim().charAt(0).toUpperCase()}</Text></View>
                </View>
                <View style={s.classFoot}>
                  <Text style={[s.classDue, c.todo > 0 && { color: C.text }]} numberOfLines={1}>
                    {c.todo === 0 ? 'No work due' : c.next ? `${c.todo} to do · next ${shortDue({ dueAt: c.next })}` : `${c.todo} to do`}
                  </Text>
                  <Icon n="chevron-forward" s={18} c={C.sub} />
                </View>
              </Pressable>
            );
          }} />
      )}
    </View>
  );
}

/* ---------- To-do (all classes) ---------- */
export function TodoScreen() {
  const { items, openItem, refresh, refreshing } = useContext(AppCtx);
  const [tab, setTab] = useState('Assigned');
  const [cls, setCls] = useState('All classes');
  const names = useMemo(() => ['All classes', ...[...new Set(items.filter(isWork).map((i) => i.course || 'Other'))].sort()], [items]);
  const rows = useMemo(() => {
    const list = items.filter((i) => isWork(i) && (cls === 'All classes' || (i.course || 'Other') === cls) && (tab === 'Done' ? i.submitted : !i.submitted));
    if (tab === 'Done') return list.length ? [{ h: 'Done', n: list.length }, ...list.sort((a, b) => (b.posted_at || 0) - (a.posted_at || 0))] : [];
    const out = [];
    for (const b of BUCKETS) {
      const g = list.filter((i) => bucketOf(i) === b).sort((a, c) => (a.dueAt || 9e15) - (c.dueAt || 9e15));
      if (g.length) out.push({ h: b, n: g.length }, ...g);
    }
    return out;
  }, [items, tab, cls]);
  return (
    <View style={{ flex: 1 }}>
      <AppBar title="To-do" />
      <View style={s.seg}>
        {['Assigned', 'Done'].map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[s.segItem, tab === t && s.segOn]}><Text style={[s.segTxt, tab === t && { color: C.blue, fontWeight: '700' }]}>{t}</Text></Pressable>
        ))}
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
          {names.map((n) => (
            <Pressable key={n} onPress={() => setCls(n)} style={[s.chip, cls === n && s.chipOn]}><Text style={[s.chipTxt, cls === n && { color: C.blue, fontWeight: '700' }]} numberOfLines={1}>{n}</Text></Pressable>
          ))}
        </ScrollView>
      </View>
      <FlatList data={rows} keyExtractor={(r, i) => r.id || 'h' + r.h + i} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={{ paddingBottom: 30 }}
        ListEmptyComponent={<Text style={s.empty}>{tab === 'Done' ? 'Nothing marked done yet.' : 'You’re all caught up. 🎉'}</Text>}
        renderItem={({ item }) => (item.h
          ? <SectionHeader title={item.h} count={item.n} color={item.h === 'Overdue' ? C.red : undefined} />
          : <WorkRow item={item} color={courseColor(item.course)} showCourse onPress={() => openItem(item.id)} />)} />
    </View>
  );
}

/* ---------- One class: Classwork | Materials | Announcements ---------- */
export function ClassScreen({ name }) {
  const { items, openItem, pop } = useContext(AppCtx);
  const [tab, setTab] = useState('Classwork');
  const color = courseColor(name);
  const mine = useMemo(() => items.filter((i) => (i.course || 'Other') === name), [items, name]);
  const counts = { Classwork: mine.filter((i) => kindOf(i) === 'Classwork').length, Materials: mine.filter((i) => kindOf(i) === 'Materials').length, Announcements: mine.filter((i) => kindOf(i) === 'Announcements').length };
  const list = mine.filter((i) => kindOf(i) === tab);
  const rows = useMemo(() => {
    if (tab !== 'Classwork') return [...list].sort((a, b) => (b.posted_at || 0) - (a.posted_at || 0));
    const open = list.filter((i) => !i.submitted).sort((a, b) => (a.dueAt || 9e15) - (b.dueAt || 9e15));
    const done = list.filter((i) => i.submitted);
    return [...(open.length ? [{ h: 'Assigned', n: open.length }, ...open] : []), ...(done.length ? [{ h: 'Done', n: done.length }, ...done] : [])];
  }, [list, tab]);
  return (
    <View style={{ flex: 1 }}>
      <AppBar title={name} subtitle={`${mine.length} post${mine.length === 1 ? '' : 's'}`} color={color} onBack={pop} />
      <View style={[s.tabStrip, { borderBottomColor: color }]}>
        {['Classwork', 'Materials', 'Announcements'].map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[s.stripItem, tab === t && { borderBottomColor: color }]}>
            <Text style={[s.stripTxt, tab === t && { color, fontWeight: '700' }]}>{t}{counts[t] ? ` · ${counts[t]}` : ''}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList data={rows} keyExtractor={(r, i) => r.id || 'h' + r.h + i} contentContainerStyle={{ paddingBottom: 30 }}
        ListEmptyComponent={<Text style={s.empty}>{tab === 'Announcements' ? 'No announcements.' : tab === 'Materials' ? 'No materials.' : 'No classwork.'}</Text>}
        renderItem={({ item }) => (item.h ? <SectionHeader title={item.h} count={item.n} color={color} /> : <WorkRow item={item} color={color} onPress={() => openItem(item.id)} />)} />
    </View>
  );
}

/* ---------- One assignment / material ---------- */
export function ItemScreen({ id }) {
  const { items, pop, toggleSubmitted, pickAndUpload, openPreview } = useContext(AppCtx);
  const item = items.find((i) => i.id === id);
  if (!item) return <View style={{ flex: 1 }}><AppBar title="Not found" onBack={pop} /></View>;
  const color = courseColor(item.course);
  const status = statusOf(item);
  const work = isWork(item);
  const files = item.files || [];
  const theirs = files.filter((f) => f.origin !== 'upload');
  const mine = files.filter((f) => f.origin === 'upload');
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <AppBar title={item.course} color={color} onBack={pop} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.itemHead}>
          <View style={[st.rowIcon, { backgroundColor: color, width: 46, height: 46, borderRadius: 23 }]}><Icon n={work ? 'document-text' : 'book'} s={24} c="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={[s.itemTitle, { color }]}>{item.title}</Text>
            <Text style={s.itemMeta}>{postedDetail(item) || postedLabel(item)} · Google Classroom{addedDetail(item) ? ' · ' + addedDetail(item) : ''}</Text>
          </View>
        </View>
        {work && (
          <View style={s.dueRow}>
            <Icon n="time-outline" s={18} c={status === 'overdue' ? C.red : C.sub} />
            <Text style={[s.dueTxt, status === 'overdue' && { color: C.red }]}>{status === 'done' ? 'Done' : status === 'overdue' ? 'Overdue · ' : 'Due '}{status === 'done' ? '' : shortDue(item)}</Text>
          </View>
        )}
        <View style={s.hr} />
        {!!item.body && <Text style={s.itemBody}>{item.body}</Text>}
        {!item.body && <Text style={[s.itemBody, { color: C.sub }]}>No instructions.</Text>}

        {theirs.length > 0 && (<>
          <Text style={s.itemSection}>Attachments</Text>
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {theirs.map((f) => <Attachment key={f.id} f={f} onPress={() => openPreview(f)} />)}
          </View>
        </>)}

        {work && (
          <View style={s.workCard}>
            <View style={s.workHead}>
              <Text style={s.workTitle}>Your work</Text>
              <Text style={[s.workStatus, status === 'done' && { color: C.green }, status === 'overdue' && { color: C.red }]}>{status === 'done' ? 'Done' : status === 'overdue' ? 'Overdue' : 'Assigned'}</Text>
            </View>
            {mine.map((f) => <Attachment key={f.id} f={f} mine onPress={() => openPreview(f)} />)}
            <View style={{ gap: 10, marginTop: mine.length ? 10 : 0 }}>
              <Btn kind="outline" icon="add" label="Add file" onPress={() => pickAndUpload(item)} />
              <Btn icon={status === 'done' ? 'arrow-undo' : 'checkmark'} label={status === 'done' ? 'Unmark as done' : 'Mark as done'} onPress={() => toggleSubmitted(item)} />
            </View>
            <Text style={s.workHint}>Files you add sync to all your devices. Hand it in on Classroom, then mark it done here to stop the reminders.</Text>
          </View>
        )}
        {!!item.url && <View style={{ paddingHorizontal: 16, marginTop: 14 }}><Btn kind="ghost" icon="open-outline" label="Open in Google Classroom" onPress={() => Linking.openURL(item.url)} /></View>}
      </ScrollView>
    </View>
  );
}

const typeColor = (name) => { const e = (name.split('.').pop() || '').toLowerCase(); return e === 'pdf' ? '#d93025' : ['doc', 'docx'].includes(e) ? '#1a73e8' : ['xls', 'xlsx', 'csv'].includes(e) ? '#1e8e3e' : ['ppt', 'pptx'].includes(e) ? '#e37400' : ['png', 'jpg', 'jpeg', 'heic'].includes(e) ? '#a142f4' : '#5f6368'; };
function Attachment({ f, onPress, mine }) {
  const { saved } = useContext(AppCtx);
  const local = f.local || saved[f.id];
  return (
    <Pressable onPress={onPress} style={s.attach}>
      <View style={[s.attachThumb, { backgroundColor: typeColor(f.name) }]}><Text style={s.attachExt}>{(f.name.split('.').pop() || 'file').slice(0, 4).toUpperCase()}</Text></View>
      <View style={{ flex: 1, paddingHorizontal: 12 }}>
        <Text style={s.attachName} numberOfLines={2}>{f.name}</Text>
        <Text style={s.rowSub}>{mine ? 'Your file' : 'Attachment'} · {Math.max(1, Math.round((f.size || 0) / 1024))} KB{f.pending ? ' · uploading when online' : local ? ' · saved offline' : ''}</Text>
      </View>
      <Icon n="eye-outline" s={20} c={C.sub} />
    </Pressable>
  );
}

/* ---------- Preview / attach / notice ---------- */
export function Preview({ file, onClose }) {
  const { api, saved, onSaved, ck } = useContext(AppCtx);
  const [busy, setBusy] = useState(false);
  const [cloudErr, setCloudErr] = useState('');
  const local = file.local || saved[file.id];
  const uri = local || api.fileUrl(file.id);
  const doCloud = async () => {
    setBusy(true); setCloudErr('');
    try { onSaved(file.id, await saveBase64(await cloudFileBase64(ck, file), file.name)); }
    catch (e) { setCloudErr(e.message || 'Could not get it from iCloud'); }
    setBusy(false);
  };
  const doSave = async () => { setBusy(true); try { onSaved(file.id, await downloadFile(uri, file.name)); } catch {} setBusy(false); };
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={s.previewBar}>
          <Pressable onPress={onClose} hitSlop={12}><Icon n="close" s={26} /></Pressable>
          <Text style={[s.attachName, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>{file.name}</Text>
          {busy ? <ActivityIndicator color={C.blue} /> : local ? <Btn kind="ghost" label="Share" onPress={() => openFile(local)} /> : <Btn kind="ghost" label="Save" onPress={doSave} />}
        </View>
        {Platform.OS === 'web'
          ? <View style={{ padding: 20 }}><Text style={s.rowSub}>Previews open inside the installed app.</Text><Text style={{ color: C.blue, marginTop: 8 }} onPress={() => Linking.openURL(uri)}>Open in browser</Text></View>
          : <WebView source={{ uri }} originWhitelist={['*']} allowFileAccess allowingReadAccessToURL={local || undefined} startInLoadingState
              renderLoading={() => <ActivityIndicator style={{ marginTop: 40 }} color={C.blue} />}
              renderError={() => <View style={{ padding: 24 }}><Text style={s.attachName}>Can’t preview right now</Text><Text style={[s.rowSub, { marginTop: 6 }]}>{ck ? 'This network may block the bot. You can still get the file through iCloud.' : 'No connection. Save it when you’re online and it opens offline.'}</Text>{ck ? <View style={{ marginTop: 14, alignItems: 'flex-start' }}><Btn icon="cloud-download-outline" label="Get it from iCloud" onPress={doCloud} disabled={busy} /></View> : null}{!!cloudErr && <Text style={{ color: C.red, marginTop: 10 }}>{cloudErr}</Text>}</View>} />}
      </View>
    </Modal>
  );
}

export function AttachPicker({ incoming, items, onPick, onClose }) {
  const list = items.filter((i) => isWork(i) && !i.submitted).sort((a, b) => (a.dueAt || 9e15) - (b.dueAt || 9e15));
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <AppBar title="Which assignment is this for?" subtitle={incoming.name} onBack={onClose} />
        <FlatList data={list} keyExtractor={(i) => i.id}
          ListEmptyComponent={<Text style={s.empty}>No open assignments to attach to yet.</Text>}
          renderItem={({ item }) => <WorkRow item={item} color={courseColor(item.course)} showCourse onPress={() => onPick(item)} />} />
      </View>
    </Modal>
  );
}

/** After a sync or zip import: "3 new Biology assignments", with when each was posted on Google Classroom. */
export function WhatsNew({ fresh, onClose, onOpen }) {
  const groups = [];
  fresh.forEach((i) => {
    const course = niceCourse(i.course);
    const noun = i.kind === 'announcement' ? 'announcement' : isWork(i) ? 'assignment' : 'material';
    const g = groups.find((x) => x.course === course && x.noun === noun) || (groups[groups.length] = { course, noun, list: [] }, groups[groups.length - 1]);
    g.list.push(i);
  });
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.scrim}>
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>{fresh.length} new from Google Classroom</Text>
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 6 }}>
            {groups.map((g) => (
              <View key={g.course + g.noun} style={{ marginTop: 14 }}>
                <Text style={[s.sheetHead, { color: courseColor(g.course) }]}>{g.list.length} new {g.course} {g.noun}{g.list.length === 1 ? '' : 's'}</Text>
                {g.list.map((i) => (
                  <Pressable key={i.id} onPress={() => onOpen(i)} style={s.sheetRow}>
                    <Text style={s.sheetItem} numberOfLines={2}>{i.title}</Text>
                    <Text style={s.sheetPosted}>{postedDetail(i) || 'Posted recently'} · on Google Classroom</Text>
                    <Text style={s.sheetAdded}>{addedDetail(i)} · uploaded to your library{isWork(i) && i.dueAt ? ' · due ' + shortDue(i) : ''}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
          <View style={{ marginTop: 14 }}><Btn label="Got it" onPress={onClose} /></View>
        </View>
      </View>
    </Modal>
  );
}

export function Notice({ text }) {
  if (!text) return null;
  return <View style={s.notice} pointerEvents="none"><Text style={s.noticeTxt}>{text}</Text></View>;
}

/* ---------- Settings (account, devices, network test) ---------- */
export function SettingsScreen() {
  const { cfg, onAuth, onSignOut, refresh, status, shareLibrary, openNetwork, ck } = useContext(AppCtx);
  const [name, setName] = useState(cfg.name || '');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [mode, setMode] = useState('in');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => { setBusy(true); setErr(''); try { await onAuth(mode, name.trim(), password, invite.trim()); setPassword(''); } catch (e) { setErr(e.message || 'Could not reach the server'); } setBusy(false); };
  return (
    <View style={{ flex: 1 }}>
      <AppBar title="Settings" />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={s.setHead}>Account</Text>
        {cfg.token ? (
          <View style={s.setCard}>
            <Text style={s.itemBody2}>Signed in as <Text style={{ fontWeight: '700' }}>{cfg.name || 'you'}</Text></Text>
            <Text style={s.rowSub}>Your classes, uploads and “done” marks sync to every device signed in to this account.</Text>
            <Text style={[s.rowSub, { marginTop: 8 }]}>{status}</Text>
            <Text style={[s.rowSub, { marginTop: 4 }]}>iCloud backup route: {ck ? 'ready (used when your Wi-Fi blocks the bot)' : 'not set up yet'}</Text>
            <View style={{ gap: 8, marginTop: 12 }}><Btn icon="sync" label="Sync now" onPress={refresh} /><Btn kind="outline" label="Sign out" onPress={onSignOut} /></View>
          </View>
        ) : (
          <View style={s.setCard}>
            <Text style={s.itemBody2}>{mode === 'in' ? 'Sign in with the same name and password on every device.' : 'Create your account once, on your first device. You need the 10-character invite code.'}</Text>
            <Text style={s.label}>Name</Text>
            <TextInput value={name} onChangeText={setName} autoCapitalize="none" autoCorrect={false} style={s.field} />
            <Text style={s.label}>Password</Text>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} style={s.field} />
            {mode === 'up' && (<><Text style={s.label}>Invite code</Text><TextInput value={invite} onChangeText={setInvite} autoCapitalize="none" autoCorrect={false} style={s.field} /></>)}
            {!!err && <Text style={{ color: C.red, marginTop: 10 }}>{err}</Text>}
            <View style={{ gap: 8, marginTop: 14 }}>
              <Btn label={busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'} onPress={go} disabled={busy || !name.trim() || password.length < 6} />
              <Btn kind="ghost" label={mode === 'in' ? 'New here? Create an account' : 'I already have an account'} onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(''); }} />
            </View>
          </View>
        )}
        <Text style={s.setHead}>Devices</Text>
        <View style={s.setCard}>
          <Text style={s.rowSub}>No internet on a network? Pack your library into one file, AirDrop it to another device, and open it with Classroom Feed.</Text>
          <View style={{ marginTop: 10 }}><Btn kind="outline" icon="share-outline" label="Send library to another device" onPress={shareLibrary} /></View>
        </View>
        <Text style={s.setHead}>Troubleshooting</Text>
        <View style={s.setCard}>
          <Text style={s.rowSub}>Check which sites this Wi-Fi lets through.</Text>
          <View style={{ marginTop: 10 }}><Btn kind="outline" icon="wifi" label="Network test" onPress={openNetwork} /></View>
        </View>
      </ScrollView>
    </View>
  );
}

export function NetworkScreen({ cfg }) {
  const { pop, ck } = useContext(AppCtx);
  const [res, setRes] = useState({});
  const [cloud, setCloud] = useState(null);
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true); setRes({}); setCloud(null);
    const probeCloud = async () => {
      if (!ck) return setCloud({ ok: false, msg: 'Needs one sign-in on a normal network first' });
      const t0 = Date.now();
      try { const recs = await ckLookup(ck, ['meta'], 12000); const has = recs[0] && recs[0].fields && recs[0].fields.json; setCloud({ ok: true, msg: `OK · ${Date.now() - t0} ms · ${has ? 'library published' : 'library not published yet'}` }); }
      catch (e) { setCloud({ ok: false, msg: String(e.message || 'blocked').slice(0, 60) }); }
    };
    await Promise.all([probeCloud(), ...PROBES.map(async (p) => { const r = await runProbe(p, cfg); setRes((x) => ({ ...x, [p.name]: r })); })]);
    setRunning(false);
  };
  const done = Object.keys(res).length === PROBES.length;
  const ok = (g) => PROBES.filter((p) => p.group === g).some((p) => res[p.name]?.ok);
  const verdict = !done ? '' : res[PROBES[0].name]?.ok ? 'Your bot server is reachable here, so the app syncs fully, files included.' : ok('Apple') ? 'The bot server is blocked, but Apple/iCloud is reachable.' : 'Only push may get through here. Have the iPad iMessage you the Homework zip, then Share it to this app.';
  return (
    <View style={{ flex: 1 }}>
      <AppBar title="Network test" onBack={pop} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.rowSub}>Run this on the restricted Wi-Fi. Any response means a site is reachable; “blocked” means it is not.</Text>
        <View style={{ height: 12 }} />
        <Btn label={running ? 'Testing…' : 'Run test'} onPress={run} disabled={running} />
        <View style={{ height: 12 }} />
        {PROBES.map((p) => {
          const r = res[p.name];
          return (
            <View key={p.name} style={s.probe}>
              <View style={[s.dot, { backgroundColor: !r ? C.line : r.ok ? C.green : C.red }]} />
              <View style={{ flex: 1 }}><Text style={s.attachName}>{p.name}</Text><Text style={s.rowSub}>{p.group}</Text></View>
              <Text style={[s.rowSub, { color: !r ? C.sub : r.ok ? C.green : C.red }]}>{!r ? (running ? '…' : '—') : r.ok ? `OK · ${r.ms} ms` : r.error}</Text>
            </View>
          );
        })}
        <View style={[s.probe, { borderColor: C.blue }]}>
        <View style={[s.dot, { backgroundColor: !cloud ? C.line : cloud.ok ? C.green : C.red }]} />
        <View style={{ flex: 1 }}><Text style={s.attachName}>iCloud library (the real test)</Text><Text style={s.rowSub}>Reads the library through Apple, with no bot</Text></View>
        <Text style={[s.rowSub, { color: !cloud ? C.sub : cloud.ok ? C.green : C.red, maxWidth: 150, textAlign: 'right' }]}>{!cloud ? (running ? '…' : '—') : cloud.msg}</Text>
      </View>
      {!!verdict && <View style={s.verdict}><Text style={{ color: C.text, fontSize: 15 }}>{verdict}</Text></View>}
        {done && <Text selectable style={[s.rowSub, { marginTop: 12 }]}>{'Report for Claude: ' + PROBES.map((p) => `${p.name}=${res[p.name]?.ok ? 'OK' : 'blocked'}`).join(', ') + `, iCloud library read=${cloud ? (cloud.ok ? 'OK' : 'FAILED ' + cloud.msg) : '...'}`}</Text>}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  btn: { backgroundColor: C.blue, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  btnGhost: { backgroundColor: 'transparent' },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line },
  btnTxt: { color: '#fff', fontWeight: '600', fontSize: 14.5 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  barBack: { marginLeft: -4 },
  barTitle: { fontSize: 20, fontWeight: '500', color: C.text },
  barSub: { fontSize: 12, color: C.sub, marginTop: 1 },
  checkCard: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginHorizontal: 14, marginTop: 10, padding: 14, borderRadius: 12, backgroundColor: '#e8f0fe' },
  checkWarn: { backgroundColor: '#fef3c7' },
  checkMain: { fontSize: 15, fontWeight: '600', color: C.text },
  checkSub: { fontSize: 12.5, color: C.sub, marginTop: 2 },
  checkAlert: { fontSize: 12.5, color: '#92400e', marginTop: 6, fontWeight: '600' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 14, marginBottom: 2, paddingHorizontal: 14, height: 42, borderRadius: 21, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  search: { flex: 1, fontSize: 15, color: C.text, outlineStyle: 'none' },
  empty: { textAlign: 'center', color: C.sub, marginTop: 60, paddingHorizontal: 30, lineHeight: 21 },
  classCard: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  classBanner: { height: 104, padding: 14, justifyContent: 'flex-end' },
  classTitle: { color: '#fff', fontSize: 21, fontWeight: '500', paddingRight: 56 },
  classSub: { color: '#ffffffdd', fontSize: 13, marginTop: 2 },
  avatar: { position: 'absolute', right: 14, top: 14, width: 48, height: 48, borderRadius: 24, backgroundColor: '#ffffffee', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 22, fontWeight: '600' },
  classFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  classDue: { fontSize: 13, color: C.sub, flex: 1, marginRight: 8 },
  seg: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 13, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  segOn: { borderBottomColor: C.blue },
  segTxt: { fontSize: 14.5, color: C.sub, fontWeight: '500' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', maxWidth: 220 },
  chipOn: { backgroundColor: '#e8f0fe', borderColor: '#d2e3fc' },
  chipTxt: { fontSize: 13, color: C.sub },
  tabStrip: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  stripItem: { flex: 1, alignItems: 'center', paddingVertical: 13, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  stripTxt: { fontSize: 13.5, color: C.sub, fontWeight: '500' },
  itemHead: { flexDirection: 'row', gap: 14, padding: 16, paddingBottom: 6, alignItems: 'center' },
  itemTitle: { fontSize: 24, fontWeight: '500' },
  itemMeta: { fontSize: 13, color: C.sub, marginTop: 3 },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  dueTxt: { fontSize: 14.5, color: C.text, fontWeight: '500' },
  hr: { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginVertical: 14 },
  itemBody: { fontSize: 15.5, lineHeight: 23, color: C.text, paddingHorizontal: 16 },
  itemBody2: { fontSize: 15, lineHeight: 22, color: C.text },
  itemSection: { fontSize: 14, fontWeight: '700', color: C.blueDark, paddingHorizontal: 16, marginTop: 22, marginBottom: 10 },
  attach: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.line, borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' },
  attachThumb: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  attachExt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  attachName: { fontSize: 14.5, color: C.text, fontWeight: '500' },
  workCard: { margin: 16, marginTop: 24, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', gap: 10 },
  workHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  workTitle: { fontSize: 18, fontWeight: '500', color: C.text },
  workStatus: { fontSize: 13, fontWeight: '700', color: C.sub },
  workHint: { fontSize: 12, color: C.sub, marginTop: 4, lineHeight: 17 },
  previewBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 54, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  scrim: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: '#fff', borderRadius: 16, padding: 20, maxWidth: 520, width: '100%', alignSelf: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '600', color: C.text },
  sheetHead: { fontSize: 15, fontWeight: '700' },
  sheetRow: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  sheetItem: { fontSize: 15, color: C.text, fontWeight: '500' },
  sheetAdded: { fontSize: 12.5, color: C.blue, marginTop: 1, fontWeight: '500' },
  sheetPosted: { fontSize: 12.5, color: C.sub, marginTop: 2 },
  notice: { position: 'absolute', left: 16, right: 16, bottom: 86, backgroundColor: '#323232', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 13, elevation: 6 },
  noticeTxt: { color: '#fff', fontSize: 14 },
  setHead: { fontSize: 13, fontWeight: '700', color: C.blueDark, marginTop: 18, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  setCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 16 },
  label: { fontSize: 13, color: C.sub, marginTop: 14, marginBottom: 6 },
  field: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 12, fontSize: 15, color: C.text },
  probe: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  verdict: { marginTop: 8, padding: 14, borderRadius: 10, backgroundColor: '#e8f0fe' },
});
