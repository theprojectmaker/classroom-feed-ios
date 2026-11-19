// Classes — the first screen, laid out like Google Classroom's home: one card per class. Above the cards: when Classroom
// was last checked (with the button to check now), your pinned posts, and three numbers that open the To-do list.
import React, { useContext, useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AppCtx } from '../ctx';
import { SIDEBAR, T, WIDE, classPair, hair } from '../theme';
import { Btn, Card, Empty, Icon, IconBtn, LargeTitle, LinearGradient, SectionTitle, WorkRow, gradeSummary, isNew, isOpen, shortDue, teacherOf, useNow, workState } from '../ui';
import { connInfo, scanView } from '../conn';

/** Small "Live · iCloud" chip. Tapping it opens the connection page. */
export function ConnChip() {
  const e = useContext(AppCtx);
  const now = useNow(10000);
  const c = connInfo(e, now);
  const color = c.tone === 'green' ? T.greenFill : c.tone === 'red' ? T.redFill : '#AEAEB2';
  const waiting = e.outbox.filter((o) => o.t !== 'hello').length + e.jobs.length; // the app's own status report is not something "you" are sending
  return (
    <Pressable onPress={e.openConnection} hitSlop={8} style={({ pressed }) => [s.conn, pressed && { opacity: 0.6 }]}>
      <View style={[s.connDot, { backgroundColor: color }]} />
      <Text style={s.connTxt}>{c.label}{waiting ? ` · ${waiting} sending` : ''}</Text>
    </Pressable>
  );
}

/** One row that says when Classroom was last checked, and lets you check it now. It follows a check step by step. */
export function ScanStrip() {
  const e = useContext(AppCtx);
  const peek = scanView(e);
  const now = useNow(peek.busy ? 1500 : 15000);
  const v = scanView(e, now);
  const c = connInfo(e, now);
  return (
    <View style={s.scan}>
      <View style={[s.scanIcon, { backgroundColor: v.error ? T.redSoft : v.fresh ? T.greenSoft : T.brandSoft }]}>
        {v.busy ? <ActivityIndicator size="small" color={T.brand} /> : <Icon n={v.error ? 'alert' : v.fresh ? 'checkmark' : 'sync'} s={17} c={v.error ? T.red : v.fresh ? T.green : T.brand} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.scanLine, v.error && { color: T.red }]} numberOfLines={2}>{v.busy ? `${v.title} ${v.line}` : v.line}</Text>
        {!v.busy && <Text style={s.scanPc} numberOfLines={1}>{c.pcLine}</Text>}
      </View>
      {!v.busy && <Pressable onPress={() => e.scanNow()} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.5 }}><Text style={s.scanBtn}>Check now</Text></Pressable>}
    </View>
  );
}

/** What one class card shows: the next things due, and how much is open. */
function useClassCards(items) {
  return useMemo(() => {
    const m = new Map();
    for (const i of items) {
      const k = i.course || 'Other';
      const c = m.get(k) || { name: k, todo: 0, late: 0, fresh: 0, next: [], all: [] };
      c.all.push(i);
      if (isNew(i)) c.fresh++;
      if (isOpen(i)) {
        if (workState(i) === 'late') c.late++;
        else { c.todo++; if (i.dueAt) c.next.push(i); }
      }
      m.set(k, c);
    }
    const out = [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
    out.forEach((c) => { c.next = c.next.sort((a, b) => a.dueAt - b.dueAt).slice(0, 2); c.teacher = teacherOf(c.all); c.avg = gradeSummary(c.all).pct; c.all = null; });
    return out;
  }, [items]);
}

export function ClassesScreen() {
  const e = useContext(AppCtx);
  const { items, openItem, openClass, refresh, refreshing, cfg } = e;
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const cw = wide ? width - SIDEBAR : width;
  const now = useNow(60000);
  const conn = connInfo(e, now);
  const classes = useClassCards(items);
  const cols = cw >= 1000 ? 3 : cw >= 620 ? 2 : 1;
  const cardW = Math.floor((cw - 32 - 14 * (cols - 1)) / cols) - 1; // a hair under, so rounding never drops the last card to the next row
  const pinned = useMemo(() => items.filter((i) => i.starred), [items]);
  const first = String(cfg.name || '').split(/[\s._-]/)[0];

  return (
    <View style={{ flex: 1 }}>
      <LargeTitle title="Classes" subtitle={new Date(now).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) + (wide && first ? ` · Hi ${first.charAt(0).toUpperCase() + first.slice(1)}` : '')}
        right={<View style={s.titleRight}>{!wide && <ConnChip />}<IconBtn icon="search" onPress={e.openFind} /></View>} />
      <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.faint} />}>
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
          {pinned.length > 0 && (<>
            <SectionTitle title="Pinned" />
            <Card>{pinned.map((i, k) => <WorkRow key={i.id} item={i} showCourse last={k === pinned.length - 1} onPress={() => openItem(i.id)} onLongPress={() => e.togglePin(i)} />)}</Card>
          </>)}

          <View style={{ height: pinned.length ? 24 : 8 }} />
          {classes.length === 0 && <Empty icon="school-outline" title="No classes yet" text="They appear after the first sync. Pull down to refresh, or tap Check now." />}
          <View style={s.grid}>
            {classes.map((c) => (
              <Pressable key={c.name} onPress={() => openClass(c.name)} style={({ pressed }) => [s.classCard, { width: cardW }, pressed && { opacity: 0.75 }]}>
                <LinearGradient colors={classPair(c.name)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.banner}>
                  <View style={s.bannerGlow} />
                  <Text style={s.bannerTitle} numberOfLines={2}>{c.name}</Text>
                  {!!c.teacher && <Text style={s.bannerSub} numberOfLines={1}>{c.teacher}</Text>}
                </LinearGradient>
                <View style={s.classBody}>
                  {c.next.length === 0 ? <Text style={s.nextNone}>{c.late ? 'Nothing else coming up' : 'No work due soon'}</Text> : c.next.map((i) => (
                    <View key={i.id} style={s.nextRow}>
                      <Text style={s.nextDue} numberOfLines={1}>{'Due ' + shortDue(i)}</Text>
                      <Text style={s.nextTitle} numberOfLines={1}>{i.title}</Text>
                    </View>
                  ))}
                </View>
                <View style={s.classFoot}>
                  <Text style={s.footTxt}>{c.todo ? `${c.todo} assigned` : 'All caught up'}</Text>
                  {c.late > 0 && <Text style={[s.footTxt, { color: T.red, fontWeight: '600' }]}>{c.late} missing</Text>}
                  {c.fresh > 0 && <Text style={[s.footTxt, { color: T.brand, fontWeight: '600' }]}>{c.fresh} new</Text>}
                  {c.avg != null && <Text style={[s.footTxt, { marginLeft: 'auto', color: T.text, fontWeight: '600' }]}>{c.avg}%</Text>}
                </View>
              </Pressable>
            ))}
          </View>
        </>)}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingBottom: 120, paddingTop: 6 },
  titleRight: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 6 },
  conn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, height: 32, borderRadius: 16, backgroundColor: '#fff' },
  connDot: { width: 8, height: 8, borderRadius: 4 },
  connTxt: { fontSize: 13, fontWeight: '600', color: T.text },
  scan: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, paddingVertical: 6 },
  scanIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  scanLine: { fontSize: 14.5, color: T.text, lineHeight: 19 },
  scanPc: { fontSize: 12.5, color: T.faint, marginTop: 1 },
  scanBtn: { fontSize: 15, color: T.brand, fontWeight: '500' },
  note: { padding: 18, gap: 10, marginBottom: 12 },
  noteTitle: { fontSize: 18, fontWeight: '700', color: T.ink },
  noteTxt: { fontSize: 15, color: T.sub, lineHeight: 21 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  classCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  banner: { height: 104, paddingHorizontal: 16, paddingBottom: 12, justifyContent: 'flex-end', overflow: 'hidden' },
  bannerSub: { color: '#ffffffd9', fontSize: 13.5, marginTop: 2 },
  bannerGlow: { position: 'absolute', right: -44, top: -56, width: 170, height: 170, borderRadius: 85, backgroundColor: '#ffffff22' },
  bannerTitle: { color: '#fff', fontSize: 21, fontWeight: '700', letterSpacing: -0.3, lineHeight: 25 },
  classBody: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, minHeight: 66, gap: 7, justifyContent: 'center' },
  nextRow: { gap: 1 },
  nextDue: { fontSize: 12.5, color: T.sub },
  nextTitle: { fontSize: 15, color: T.ink, fontWeight: '500', letterSpacing: -0.2 },
  nextNone: { fontSize: 14.5, color: T.faint },
  classFoot: { flexDirection: 'row', gap: 14, paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: hair, borderTopColor: T.line },
  footTxt: { fontSize: 13, color: T.sub },
});
