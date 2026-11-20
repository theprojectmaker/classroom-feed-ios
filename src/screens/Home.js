// Home — laid out like Google Classroom's home page: the Classroom bar, a "Due soon" card, and a big white panel holding the
// class cards. Each card has a coloured header with the class name and teacher, a round teacher avatar, what is due next, and
// a footer. Above them, one slim line says when Classroom was last checked and lets you check right now.
import React, { useContext, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppCtx } from '../ctx';
import { T, WIDE, classTone } from '../theme';
import { AppBar, Avatar, Btn, Card, Empty, IconBtn, MIcon, Text, WorkRow, gradeSummary, isNew, isOpen, niceCourse, startOfToday, teacherOf, useNow, workState } from '../ui';
import { connInfo, scanView } from '../conn';

/** Small "Live · iCloud" chip. Tapping it opens the connection page. */
export function ConnChip({ compact }) {
  const e = useContext(AppCtx);
  const now = useNow(10000);
  const c = connInfo(e, now);
  const color = c.tone === 'green' ? T.greenFill : c.tone === 'red' ? T.redFill : '#9AA0A6';
  const waiting = e.outbox.filter((o) => o.t !== 'hello').length + e.jobs.length; // the app's own status report is not something "you" are sending
  return (
    <Pressable onPress={e.openConnection} hitSlop={8} style={({ pressed }) => [s.conn, compact && s.connSm, pressed && { opacity: 0.6 }]}>
      <View style={[s.connDot, { backgroundColor: color }]} />
      {compact ? (waiting ? <Text style={s.connTxt}>{waiting}</Text> : null) : <Text style={s.connTxt}>{c.label}{waiting ? ` · ${waiting} sending` : ''}</Text>}
    </Pressable>
  );
}

/** One slim line: when Classroom was last checked, and a button to check right now. It follows a check step by step. */
export function ScanStrip() {
  const e = useContext(AppCtx);
  const peek = scanView(e);
  const now = useNow(peek.busy ? 1500 : 15000);
  const v = scanView(e, now);
  const c = connInfo(e, now);
  return (
    <View style={s.scan}>
      <View style={[s.scanIcon, { backgroundColor: v.error ? T.redSoft : v.fresh ? T.greenSoft : T.brandSoft }]}>
        {v.busy ? <ActivityIndicator size="small" color={T.brand} /> : <MIcon n={v.error ? 'alert-outline' : v.fresh ? 'check' : 'sync'} s={18} c={v.error ? T.red : v.fresh ? T.green : T.brand} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.scanLine, v.error && { color: T.red }]} numberOfLines={2}>{v.busy ? `${v.title} ${v.line}` : v.line}</Text>
        {!v.busy && <Text style={s.scanPc} numberOfLines={1}>{c.pcLine}</Text>}
      </View>
      {!v.busy && <Pressable onPress={() => e.scanNow()} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.5 }}><Text style={s.scanBtn}>Check now</Text></Pressable>}
    </View>
  );
}

/** "Due today", "Due tomorrow", "Due Mon, Nov 23" — the small heading above what is due. */
const dueHead = (ms) => {
  const d0 = startOfToday(), days = Math.floor((ms - d0) / 86400000);
  return days <= 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : 'Due ' + new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

function ClassCard({ c, onOpen, onGrades, onWork, onMore }) {
  const tone = classTone(c.name);
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [s.card, { flex: 1, minWidth: 0 }, pressed && { opacity: 0.85 }]}>
      <View style={[s.cardHead, { backgroundColor: tone.bg }]}>
        <View style={[s.cardGlow, { backgroundColor: tone.solid }]} />
        <Text style={s.cardTitle} numberOfLines={2}>{niceCourse(c.name)}</Text>
        {!!c.teacher && <Text style={s.cardTeacher} numberOfLines={1}>{c.teacher.toUpperCase()}</Text>}
      </View>
      <View style={s.cardAvatar}><Avatar name={c.teacher || niceCourse(c.name)} size={72} color={tone.solid} /></View>
      <View style={s.cardBody}>
        {c.next.length === 0
          ? <Text style={s.cardNone}>{c.late ? `${c.late} missing` : 'Nothing due soon'}</Text>
          : c.next.map((i) => (
            <View key={i.id} style={{ marginBottom: 10 }}>
              <Text style={s.cardDue}>{dueHead(i.dueAt)}</Text>
              <Text style={s.cardDueTxt} numberOfLines={2}>{new Date(i.dueAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – {i.title}</Text>
            </View>
          ))}
      </View>
      <View style={s.cardFoot}>
        <View style={{ flex: 1, paddingLeft: 16, flexDirection: 'row', gap: 12 }}>
          {c.late > 0 && <Text style={[s.footTxt, { color: T.red }]}>{c.late} missing</Text>}
          {c.fresh > 0 && <Text style={[s.footTxt, { color: T.brand }]}>{c.fresh} new</Text>}
          {c.avg != null && <Text style={s.footTxt}>{c.avg}%</Text>}
        </View>
        <IconBtn mi="clipboard-account-outline" onPress={onGrades} size={22} />
        <IconBtn mi="folder-outline" onPress={onWork} size={22} />
        <IconBtn mi="dots-vertical" onPress={onMore} size={22} />
      </View>
    </Pressable>
  );
}

export function ClassesScreen() {
  const e = useContext(AppCtx);
  const { items, openItem, openClass, refresh, refreshing, cfg } = e;
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const [cw, setCw] = useState(width);
  const [soonOpen, setSoonOpen] = useState(false); // collapsed to begin with, as in Classroom
  const now = useNow(60000);
  const conn = connInfo(e, now);

  const classes = useMemo(() => {
    const m = new Map();
    for (const i of items) {
      const k = i.course || 'Other';
      const c = m.get(k) || { name: k, late: 0, fresh: 0, next: [], all: [] };
      c.all.push(i);
      if (isNew(i)) c.fresh++;
      if (isOpen(i)) { if (workState(i) === 'late') c.late++; else if (i.dueAt) c.next.push(i); }
      m.set(k, c);
    }
    const out = [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
    out.forEach((c) => { c.next = c.next.sort((a, b) => a.dueAt - b.dueAt).slice(0, 2); c.teacher = teacherOf(c.all); c.avg = gradeSummary(c.all).pct; c.all = null; });
    return out;
  }, [items]);
  const soon = useMemo(() => items.filter((i) => isOpen(i) && workState(i) !== 'late' && i.dueAt && i.dueAt < now + 7 * 86400000).sort((a, b) => a.dueAt - b.dueAt), [items, now]);
  const pinned = useMemo(() => items.filter((i) => i.starred), [items]);

  const inner = Math.max(280, Math.min(cw, 1240) - 16 - 32);
  const cols = inner >= 960 ? 3 : inner >= 600 ? 2 : 1;
  const cardW = Math.floor((inner - 16 * (cols - 1)) / cols) - 1;
  // Rows of `cols` cards sharing the width equally (a scroll bar or a different screen width can never push one onto its own line).
  const rows = [];
  for (let k = 0; k < classes.length; k += cols) rows.push(classes.slice(k, k + cols));

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }} onLayout={(ev) => setCw(ev.nativeEvent.layout.width)}>
      <AppBar brand onMenu={e.openDrawer} right={<View style={s.barRight}>{!wide && <ConnChip compact />}<Avatar name={cfg.name || 'S'} size={32} /></View>} />
      <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.faint} />}>
        <View style={s.wrap}>
          {!cfg.token && !e.canReadCloud ? (
            <Card style={s.note}>
              <Text style={s.noteTitle}>Sign in to get started</Text>
              <Text style={s.noteTxt}>Sign in once on normal Wi-Fi. On the school Wi-Fi, update Classroom Feed in the TestFlight app instead: the newest version works there right away, with nothing to set up.</Text>
              <Btn label="Sign in" onPress={() => e.goTab('more')} />
            </Card>
          ) : (<>
            {conn.stuck && (
              <Card style={s.note}>
                <Text style={s.noteTitle}>Update Classroom Feed in TestFlight</Text>
                <Text style={s.noteTxt}>This copy of the app can’t use iCloud yet, so nothing can arrive on this Wi-Fi. Open the TestFlight app and tap Update next to Classroom Feed. The new version works here right away, with nothing to set up.</Text>
              </Card>
            )}
            <ScanStrip />

            <View style={[s.soon, !soonOpen && cols > 1 && { width: cardW + 16, alignSelf: 'flex-start' }]}>
              <Pressable onPress={() => setSoonOpen((o) => !o)} style={s.soonHead}>
                <Text style={s.soonTitle}>Due soon</Text>
                {soon.length > 0 && <Text style={s.soonCount}>{soon.length}</Text>}
                <MIcon n={soonOpen ? 'arrow-collapse' : 'arrow-expand'} s={22} c={T.brandContainerOn} style={s.soonIcon} />
              </Pressable>
              {soonOpen && (soon.length === 0
                ? <Text style={s.soonNone}>Woohoo, no work due soon!</Text>
                : soon.slice(0, 8).map((i, k, arr) => <WorkRow key={i.id} item={i} showCourse last={k === arr.length - 1} onPress={() => openItem(i.id)} onLongPress={() => e.togglePin(i)} />))}
            </View>

            {pinned.length > 0 && (
              <View style={s.panel}>
                <Text style={s.panelTitle}>Pinned</Text>
                {pinned.map((i, k) => <WorkRow key={i.id} item={i} showCourse last={k === pinned.length - 1} onPress={() => openItem(i.id)} onLongPress={() => e.togglePin(i)} />)}
              </View>
            )}

            <View style={s.panel}>
              <View style={s.panelHead}>
                <Text style={s.panelTitle}>Classes</Text>
                <Pressable onPress={e.openAdd} hitSlop={8} style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.5 }]}>
                  <MIcon n="plus" s={20} c={T.brand} /><Text style={s.addTxt}>Add task</Text>
                </Pressable>
              </View>
              {classes.length === 0 && <Empty icon="school-outline" title="No classes yet" text="They appear after the first sync. Pull down to refresh, or tap Check now." />}
              <View>
                {rows.map((r, ri) => (
                  <View key={ri} style={s.gridRow}>
                    {r.map((c) => (
                      <ClassCard key={c.name} c={c} onOpen={() => openClass(c.name)} onGrades={() => openClass(c.name, 'grades')} onWork={() => openClass(c.name, 'classwork')}
                        onMore={() => e.openMenu([
                          { label: 'Open class', mi: 'open-in-new', onPress: () => openClass(c.name) },
                          { label: 'Classwork', mi: 'folder-outline', onPress: () => openClass(c.name, 'classwork') },
                          { label: 'People', mi: 'account-multiple-outline', onPress: () => openClass(c.name, 'people') },
                          { label: 'Grades', mi: 'clipboard-account-outline', onPress: () => openClass(c.name, 'grades') },
                        ])} />
                    ))}
                    {Array.from({ length: cols - r.length }).map((_, k) => <View key={'pad' + k} style={{ flex: 1 }} />)}
                  </View>
                ))}
              </View>
            </View>
          </>)}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 8, paddingBottom: 120, paddingTop: 4 },
  wrap: { width: '100%', maxWidth: 1240, alignSelf: 'center' },
  barRight: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 8 },
  conn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: T.line },
  connSm: { paddingHorizontal: 10, minWidth: 32, justifyContent: 'center' },
  connDot: { width: 8, height: 8, borderRadius: 4 },
  connTxt: { fontSize: 13, fontWeight: '500', color: T.sub },
  scan: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8 },
  scanIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  scanLine: { fontSize: 14, color: T.ink, lineHeight: 19 },
  scanPc: { fontSize: 12, color: T.sub, marginTop: 1 },
  scanBtn: { fontSize: 14, color: T.brand, fontWeight: '500' },
  note: { padding: 20, gap: 10, marginBottom: 12, marginHorizontal: 8 },
  noteTitle: { fontSize: 18, color: T.ink },
  noteTxt: { fontSize: 14, color: T.sub, lineHeight: 21 },
  soon: { backgroundColor: '#fff', borderRadius: 28, marginTop: 4, marginBottom: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  soonHead: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 10 },
  soonTitle: { fontSize: 22, color: T.ink },
  soonCount: { fontSize: 14, fontWeight: '500', color: T.brand },
  soonIcon: { marginLeft: 'auto', padding: 12, borderRadius: 24, borderWidth: 2, borderColor: T.brandContainerOn, overflow: 'hidden' },
  soonNone: { fontSize: 14, color: T.sub, paddingBottom: 14 },
  panel: { backgroundColor: '#fff', borderRadius: 28, padding: 16, marginBottom: 8 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  panelTitle: { fontSize: 22, color: T.ink, marginBottom: 4 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 40 },
  addTxt: { fontSize: 14, fontWeight: '500', color: T.brand },
  gridRow: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: T.line, overflow: 'hidden' },
  cardHead: { height: 104, paddingHorizontal: 16, paddingTop: 14, justifyContent: 'flex-start', overflow: 'hidden' },
  cardGlow: { position: 'absolute', right: -50, top: -70, width: 190, height: 190, borderRadius: 95, opacity: 0.16 },
  cardTitle: { fontSize: 22, lineHeight: 27, color: T.ink, paddingRight: 72 },
  cardTeacher: { fontSize: 12, color: T.ink, marginTop: 6, paddingRight: 84 },
  cardAvatar: { position: 'absolute', right: 16, top: 68 },
  cardBody: { minHeight: 104, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6 },
  cardNone: { fontSize: 13, color: T.faint },
  cardDue: { fontSize: 12, fontWeight: '500', color: T.ink },
  cardDueTxt: { fontSize: 12, color: T.ink, marginTop: 1 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: T.line, minHeight: 52, paddingRight: 8 },
  footTxt: { fontSize: 13, fontWeight: '500', color: T.sub },
});
