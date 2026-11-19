// One post: instructions, attachments, and "Your work" (add a file or photo, turn it in, follow it until Classroom has it).
import React, { useContext, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppCtx } from '../ctx';
import { T, classPair, hair } from '../theme';
import { Btn, Card, FileBadge, Header, Icon, Line, Pill, Progress, SectionTitle, StatePill, WorkRow, addedDetail, hasUpdate, isOpen, isWork, postedDetail, shortDue, whenLabel, workState } from '../ui';
import { fmtBytes } from '../lib';
import { fileExists, openFile, resolveLocal } from '../files';
import { turninView } from '../conn';
import { NotesCard, RichText, StepsCard } from '../extra';

const pct = (p) => (p && p.total ? Math.round(((p.done || 0) / p.total) * 100) : 0);

/** A file the teacher attached. Shows whether it is on the device, in iCloud, or still has to be fetched by the PC. */
function Attachment({ f, onPress, last }) {
  const e = useContext(AppCtx);
  const local = f.local || e.saved[f.id];
  const p = e.progress[f.id];
  const reachable = !!local || (e.net.mode === 'bot' && f.kv !== 0) || f.cloud || !!f.p;
  const asked = !!e.wanted[f.id];
  let state, tone = T.sub;
  if (local) { state = 'On this device'; tone = T.green; }
  else if (p && !p.error) state = `Getting it… ${pct(p)}%`;
  else if (reachable) state = 'Tap to open';
  else state = asked ? 'Asked your PC — it arrives shortly' : 'Not copied to iCloud yet';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.fileRow, !last && s.rowLine, pressed && { backgroundColor: T.soft }]}>
      <FileBadge name={f.name} />
      <View style={{ flex: 1 }}>
        <Text style={s.fileName} numberOfLines={2}>{f.name}</Text>
        <Text style={[s.fileSub, { color: tone }]} numberOfLines={1}>{fmtBytes(f.size)} · {state}</Text>
        {p && !p.error && <Progress value={pct(p) / 100} style={{ marginTop: 6 }} />}
      </View>
      {local ? <Icon n="checkmark-circle" s={22} c={T.green} />
        : p && !p.error ? <ActivityIndicator color={T.brand} />
          : reachable ? <Icon n="cloud-download-outline" s={22} c={T.brand} />
            : asked ? <Icon n="time-outline" s={22} c={T.faint} /> : <Btn small kind="soft" label="Get it" onPress={() => e.wantFile(f)} />}
    </Pressable>
  );
}

/** A finished file you added. Shows it travelling (with a progress bar) and lets you take it off again. */
function MyFile({ item, f, locked, onPress }) {
  const e = useContext(AppCtx);
  const p = e.progress[f.id];
  const job = e.jobs.find((j) => j.up === f.id);
  const err = (job && job.error) || (p && p.error);
  let line, tone = T.sub;
  if (item.mine) line = 'On this device';
  else if (err) { line = e.net.mode === 'offline' ? 'Waiting for a connection' : `Not sent yet — ${err}`; tone = T.red; }
  else if (f.pending) line = p && p.total > 1 ? `Sending… ${pct(p)}%` : e.net.mode === 'offline' ? 'Waiting for a connection' : 'Sending…';
  else if (f.synced) { line = 'Sent'; tone = T.green; }
  else { line = 'Sent — your PC is receiving it'; tone = T.green; }
  return (
    <Pressable onPress={onPress} style={s.myFile}>
      <FileBadge name={f.name} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={s.fileName} numberOfLines={1}>{f.name}</Text>
        <Text style={[s.fileSub, { color: tone }]} numberOfLines={2}>{fmtBytes(f.size)} · {line}</Text>
        {f.pending && !err && <Progress value={p && p.total > 1 ? pct(p) / 100 : 0.08} style={{ marginTop: 6 }} />}
      </View>
      {!!err && e.net.mode !== 'offline' && <Btn small kind="soft" label="Retry" onPress={() => e.retryWork(f.id)} />}
      {!locked && <Pressable onPress={() => e.removeWork(item, f)} hitSlop={10} style={s.xBtn}><Icon n="close" s={18} c={T.sub} /></Pressable>}
    </Pressable>
  );
}

/** Three steps so you can see a turn-in go through: sent -> your PC hands it in -> Classroom has it. */
function TurnInSteps({ tv }) {
  const steps = [['Request sent', 1], ['Your PC is handing it in', 2], ['Turned in on Google Classroom', 3]];
  return (
    <View style={{ gap: 9 }}>
      {steps.map(([label, n]) => {
        const done = tv.stage >= n && !(tv.failed && n === 2) && !(n === 2 && tv.stage === 2 && tv.state === 'queued');
        const active = !done && (tv.stage === n - 1 || (n === 2 && tv.stage === 2));
        return (
          <View key={n} style={s.step}>
            {done ? <Icon n="checkmark-circle" s={21} c={T.green} /> : active ? <ActivityIndicator size="small" color={T.brand} style={{ width: 21 }} /> : <Icon n="ellipse-outline" s={21} c={T.line} />}
            <Text style={[s.stepTxt, done && { color: T.ink }, active && { color: T.brand, fontWeight: '700' }]}>{label}</Text>
          </View>
        );
      })}
      {!!tv.note && <Text style={s.stepNote}>{tv.note}</Text>}
    </View>
  );
}

export function ItemScreen({ id }) {
  const e = useContext(AppCtx);
  const { items, pop, openPreview, updateItem, deleteItem, notify } = e;
  const [askEmpty, setAskEmpty] = useState(false);
  const item = items.find((i) => i.id === id);
  if (!item) return <View style={{ flex: 1 }}><Header title="Not found" onBack={pop} /></View>;
  const pair = classPair(item.course);
  const work = isWork(item);
  const ws = workState(item);
  const files = item.files || [];
  const theirs = files.filter((f) => f.origin !== 'upload');
  const mine = files.filter((f) => f.origin === 'upload');
  const tv = turninView(e, item);
  const handedIn = ws === 'turnedin' || ws === 'graded';
  const queued = tv.state === 'queued';
  const canClassroom = work && !item.mine && !!item.url;
  const sending = mine.some((f) => f.pending);

  const addAssets = async (assets) => { for (const a of assets) await e.addWork(item, a); };
  const pickFile = async () => {
    try { const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true }); if (!r.canceled) await addAssets(r.assets); }
    catch { notify('Could not open the file picker.'); }
  };
  const photoAsset = (a, k) => ({ uri: a.uri, name: a.fileName || `Photo ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}${k ? '-' + (k + 1) : ''}.jpg`, size: a.fileSize, mimeType: a.mimeType || 'image/jpeg' });
  const pickPhotos = async () => {
    try { const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 12, quality: 0.85 }); if (!r.canceled) await addAssets(r.assets.map(photoAsset)); }
    catch { notify('Could not open your photos.'); }
  };
  const takePhoto = async () => {
    try {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) { notify('Allow camera access for Classroom Feed in the Settings app first.'); return; }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
      if (!r.canceled) await addAssets(r.assets.map(photoAsset));
    } catch { notify('The camera is not available here.'); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <Header title={item.course} pair={pair} onBack={pop} right={(
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Pressable onPress={() => updateItem(item.id, { starred: !item.starred })} hitSlop={10} style={s.hBtn}><Icon n={item.starred ? 'star' : 'star-outline'} s={23} c="#fff" /></Pressable>
          {item.mine && <Pressable onPress={() => { deleteItem(item.id); pop(); }} hitSlop={10} style={s.hBtn}><Icon n="trash-outline" s={22} c="#fff" /></Pressable>}
        </View>
      )} />
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.wrap}>
          <Text style={s.title}>{item.title}</Text>
          <Text style={s.meta}>{[postedDetail(item), addedDetail(item)].filter(Boolean).join(' · ')}</Text>
          <View style={s.pills}>
            {work && <Pill label={item.dueAt || item.due ? 'Due ' + shortDue(item) : 'No due date'} tone={ws === 'late' ? 'red' : 'gray'} icon="time-outline" />}
            {work && (ws === 'open' ? <Pill label="Assigned" tone="blue" /> : <StatePill item={item} />)}
            {!!item.grade && ws !== 'graded' && <Pill label={item.grade} tone="green" icon="ribbon-outline" />}
            {!work && <Pill label={item.kind === 'announcement' ? 'Announcement' : 'Material'} tone="gray" />}
          </View>

          {hasUpdate(item) && (
            <View style={s.update}><Icon n="notifications" s={17} c={T.red} /><Text style={s.updateTxt}>Updated · {item.change_note || item.changeNote}</Text></View>
          )}

          <Card style={{ paddingVertical: 16, marginTop: 16 }}>
            {item.body ? <RichText text={item.body} /> : <Text style={s.none}>No instructions.</Text>}
          </Card>

          {theirs.length > 0 && (<>
            <SectionTitle title={`Attachments · ${theirs.length}`} />
            <Card>{theirs.map((f, k) => <Attachment key={f.id} f={f} last={k === theirs.length - 1} onPress={() => openPreview(f, files)} />)}</Card>
          </>)}

          {work && (<>
            <SectionTitle title="Your work" />
            <Card style={{ padding: 16, gap: 14 }}>
              {mine.length > 0 && <View style={{ gap: 10 }}>{mine.map((f) => <MyFile key={f.id} item={item} f={f} locked={queued || handedIn} onPress={() => openPreview(f, files)} />)}</View>}

              {!handedIn && !queued && (
                <View style={s.addRow}>
                  <Btn kind="soft" icon="document-attach-outline" label="Add file" onPress={pickFile} style={{ flex: 1 }} />
                  <Btn kind="soft" icon="images-outline" label="Photos" onPress={pickPhotos} style={{ flex: 1 }} />
                  {Platform.OS !== 'web' && <Btn kind="soft" icon="camera-outline" label="Camera" onPress={takePhoto} style={{ flex: 1 }} />}
                </View>
              )}

              {canClassroom && (<>
                {(mine.length > 0 || queued || handedIn || tv.failed) && <Line />}
                {tv.state === 'done' || handedIn ? (
                  <View style={[s.result, { backgroundColor: T.greenSoft }]}>
                    <Icon n="checkmark-circle" s={24} c={T.green} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.resultTitle, { color: T.green }]}>{ws === 'graded' ? `Graded${item.grade ? ' · ' + item.grade : ''}` : 'Turned in on Google Classroom'}</Text>
                      {!!(tv.state === 'done' && tv.at) && <Text style={s.resultSub}>{tv.note && !/^turned in$/i.test(tv.note) ? tv.note + ' · ' : ''}{whenLabel(tv.at)}</Text>}
                    </View>
                  </View>
                ) : queued ? (<>
                  <TurnInSteps tv={tv} />
                  <Btn kind="outline" small icon="close" label="Cancel the turn-in" onPress={() => e.cancelTurnIn(item)} />
                </>) : (<>
                  {tv.failed && (
                    <View style={[s.result, { backgroundColor: T.redSoft }]}>
                      <Icon n="alert-circle" s={22} c={T.red} />
                      <View style={{ flex: 1 }}><Text style={[s.resultTitle, { color: T.red }]}>It wasn’t turned in</Text><Text style={s.resultSub}>{tv.note}</Text></View>
                    </View>
                  )}
                  {mine.length > 0 ? (
                    <Btn icon="paper-plane" label={sending ? `Turn in when sent (${mine.length} file${mine.length === 1 ? '' : 's'})` : `Turn in ${mine.length} file${mine.length === 1 ? '' : 's'}`} onPress={() => e.turnIn(item)} />
                  ) : askEmpty ? (
                    <View style={{ gap: 10 }}>
                      <Text style={s.hint}>This hands it in on Google Classroom with nothing attached (“Mark as done”). Your teacher sees it as turned in.</Text>
                      <View style={s.addRow}>
                        <Btn kind="outline" label="Not yet" onPress={() => setAskEmpty(false)} style={{ flex: 1 }} />
                        <Btn kind="green" icon="checkmark" label="Yes, mark as done" onPress={() => { setAskEmpty(false); e.turnIn(item, { empty: true }); }} style={{ flex: 1.4 }} />
                      </View>
                    </View>
                  ) : (
                    <Btn kind="outline" icon="checkmark-done" label="Nothing to attach — mark as done" onPress={() => setAskEmpty(true)} />
                  )}
                  <Text style={s.hint}>{mine.length ? 'Your PC attaches your file' + (mine.length > 1 ? 's' : '') + ' and presses Turn in on Google Classroom for you. This works on school Wi-Fi too.' : 'Add the file or photo of your finished work above, then turn it in.'}</Text>
                </>)}
              </>)}

              {!handedIn && !queued && (
                <Pressable onPress={() => e.toggleSubmitted(item)} hitSlop={6} style={s.tick}>
                  <Icon n={item.submitted ? 'checkbox' : 'square-outline'} s={20} c={item.submitted ? T.green : T.faint} />
                  <Text style={s.tickTxt}>{item.submitted ? 'Ticked off on my list' : 'Tick off on my own list (doesn’t turn anything in)'}</Text>
                </Pressable>
              )}
            </Card>
          </>)}

          {!!item.comments && (<>
            <SectionTitle title="Private comments" />
            <Card style={{ padding: 16 }}><Text style={s.body}>{item.comments}</Text></Card>
          </>)}

          <StepsCard item={item} />
          <NotesCard item={item} />

          {!!item.url && <View style={{ marginTop: 18 }}><Btn kind="ghost" icon="open-outline" label="Open in Google Classroom" onPress={() => Linking.openURL(item.url).catch(() => notify('That only opens on normal internet.'))} /></View>}
        </View>
      </ScrollView>
    </View>
  );
}

/* ---------- File preview ---------- */
export function Preview({ file, list = [], onSwitch, onClose }) {
  const e = useContext(AppCtx);
  const insets = useSafeAreaInsets();
  const [path, setPath] = useState(null);
  const [err, setErr] = useState(null);
  const [tries, setTries] = useState(0);
  const idx = Math.max(0, list.findIndex((f) => f.id === file.id));
  const p = e.progress[file.id];
  useEffect(() => {
    let on = true;
    setPath(null); setErr(null);
    (async () => {
      const cur = file.local || e.saved[file.id];
      if (cur && (await fileExists(cur))) { if (on) setPath(cur); return; }
      try { const got = await e.getFile(file); if (on) setPath(got); }
      catch (x) { if (on) setErr({ msg: String((x && x.message) || x), code: (x && x.code) || '' }); }
    })();
    return () => { on = false; };
  }, [file.id, tries]); // eslint-disable-line react-hooks/exhaustive-deps
  const local = path ? resolveLocal(path) : null;
  const uri = local && Platform.OS !== 'web' ? encodeURI(decodeURI(local)) : local;
  const dir = uri ? uri.slice(0, uri.lastIndexOf('/') + 1) : undefined;
  const missing = err && err.code === 'NOT_IN_CLOUD';
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}>
        <View style={s.previewBar}>
          <Pressable onPress={onClose} hitSlop={12} style={s.pBtn}><Icon n="close" s={24} /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.fileName} numberOfLines={1}>{file.name}</Text>
            <Text style={s.fileSub} numberOfLines={1}>{fmtBytes(file.size)}{list.length > 1 ? ` · ${idx + 1} of ${list.length}` : ''}{path ? ' · on this device' : ''}</Text>
          </View>
          {list.length > 1 && (<>
            <Pressable onPress={() => list[idx - 1] && onSwitch(list[idx - 1])} disabled={idx === 0} hitSlop={8} style={s.pBtn}><Icon n="chevron-back" s={24} c={idx === 0 ? T.line : T.text} /></Pressable>
            <Pressable onPress={() => list[idx + 1] && onSwitch(list[idx + 1])} disabled={idx >= list.length - 1} hitSlop={8} style={s.pBtn}><Icon n="chevron-forward" s={24} c={idx >= list.length - 1 ? T.line : T.text} /></Pressable>
          </>)}
          {!!path && Platform.OS !== 'web' && <Btn small kind="soft" icon="share-outline" label="Share" onPress={() => openFile(path)} />}
        </View>
        {!path && !err && (
          <View style={s.center}>
            <ActivityIndicator size="large" color={T.brand} />
            <Text style={s.centerTitle}>Getting the file…</Text>
            {p && p.total > 1 && <><Progress value={pct(p) / 100} style={{ width: 220, marginTop: 6 }} /><Text style={s.fileSub}>{pct(p)}% · through iCloud</Text></>}
          </View>
        )}
        {!!err && (
          <View style={s.center}>
            <Icon n={missing ? 'cloud-offline-outline' : 'alert-circle-outline'} s={44} c={T.faint} />
            <Text style={s.centerTitle}>{missing ? 'This file hasn’t been copied to iCloud yet' : 'Couldn’t get the file'}</Text>
            <Text style={[s.fileSub, { textAlign: 'center', maxWidth: 340 }]}>{missing ? 'Ask your PC to send it — it usually arrives within a minute, as long as the PC is on.' : err.msg}</Text>
            {missing
              ? <Btn icon="paper-plane-outline" label={e.wanted[file.id] ? 'Asked — it’s on its way' : 'Ask my PC to send it'} disabled={!!e.wanted[file.id]} onPress={() => e.wantFile(file)} />
              : <Btn icon="refresh" label="Try again" onPress={() => setTries((n) => n + 1)} />}
            {missing && !!e.wanted[file.id] && <Btn kind="ghost" label="Check again" onPress={() => { e.refresh(); setTries((n) => n + 1); }} />}
          </View>
        )}
        {!!path && (Platform.OS === 'web'
          ? <View style={s.center}><Text style={s.centerTitle}>Previews open inside the installed app.</Text><Btn kind="soft" label="Open in the browser" onPress={() => Linking.openURL(path)} /></View>
          : <WebView source={{ uri }} originWhitelist={['*']} allowFileAccess allowFileAccessFromFileURLs allowUniversalAccessFromFileURLs allowingReadAccessToURL={dir} startInLoadingState
              renderLoading={() => <ActivityIndicator style={{ marginTop: 40 }} color={T.brand} />}
              renderError={() => <View style={s.center}><Text style={s.centerTitle}>This kind of file can’t be shown here</Text><Btn icon="share-outline" label="Open in another app" onPress={() => openFile(path)} /></View>} />)}
      </View>
    </Modal>
  );
}

/** A file shared into the app from another app (e.g. your notes app): pick the assignment it belongs to. */
export function AttachPicker({ incoming, items, onPick, onClose }) {
  const insets = useSafeAreaInsets();
  const list = items.filter(isOpen).sort((a, b) => (a.dueAt || 9e15) - (b.dueAt || 9e15));
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: insets.top }}>
        <Header title="Which assignment is this for?" subtitle={incoming.name} onBack={onClose} />
        <FlatList data={list} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={[s.none, { textAlign: 'center', marginTop: 40 }]}>No open assignments to attach it to.</Text>}
          renderItem={({ item }) => <View style={s.pickRow}><WorkRow item={item} showCourse last onPress={() => onPick(item)} /></View>} />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  page: { paddingBottom: 120 },
  wrap: { width: '100%', maxWidth: 860, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 18 },
  hBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 27, fontWeight: '800', color: T.ink, letterSpacing: -0.4, lineHeight: 33 },
  meta: { fontSize: 13, color: T.sub, marginTop: 6 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  update: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: T.redSoft },
  updateTxt: { flex: 1, color: T.red, fontWeight: '700', fontSize: 14 },
  none: { fontSize: 15, color: T.sub, paddingHorizontal: 16 },
  body: { fontSize: 15.5, lineHeight: 23, color: T.text },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowLine: { borderBottomWidth: hair, borderBottomColor: T.line },
  fileName: { fontSize: 14.5, color: T.ink, fontWeight: '600' },
  fileSub: { fontSize: 12.5, color: T.sub, marginTop: 2 },
  myFile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, backgroundColor: T.bg },
  xBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  addRow: { flexDirection: 'row', gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepTxt: { fontSize: 14.5, color: T.faint, fontWeight: '600' },
  stepNote: { fontSize: 13, color: T.sub, marginLeft: 31 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
  resultTitle: { fontSize: 15.5, fontWeight: '800' },
  resultSub: { fontSize: 13, color: T.sub, marginTop: 2 },
  hint: { fontSize: 12.5, color: T.sub, lineHeight: 18 },
  tick: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 2 },
  tickTxt: { fontSize: 13.5, color: T.sub, flex: 1 },
  previewBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: hair, borderBottomColor: T.line },
  pBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 },
  centerTitle: { fontSize: 17, fontWeight: '700', color: T.ink, textAlign: 'center' },
  pickRow: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 10, overflow: 'hidden' },
});
