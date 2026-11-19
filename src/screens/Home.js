// Home: where things stand right now — the Scan button, what is due, what is new.
import React, { useContext, useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AppCtx } from '../ctx';
import { T, WIDE, shadow } from '../theme';
import { Btn, Card, Empty, Icon, LinearGradient, SectionTitle, WorkRow, bucketOf, hasUpdate, isNew, isOpen, useNow, workState } from '../ui';
import { connInfo, scanView } from '../conn';

/** Small "Live · iCloud" chip. Tapping it opens the connection page. */
export function ConnChip({ light }) {
  const e = useContext(AppCtx);
  const now = useNow(10000);
  const c = connInfo(e, now);
  const color = c.tone === 'green' ? '#18B877' : c.tone === 'red' ? T.red : '#A0A8B8';
  const waiting = e.outbox.length + e.jobs.length;
  return (
    <Pressable onPress={e.openConnection} hitSlop={8} style={[s.conn, light && { backgroundColor: '#ffffff26', borderColor: '#ffffff40' }]}>
      <View style={[s.connDot, { backgroundColor: color }]} />
      <Text style={[s.connTxt, light && { color: '#fff' }]}>{c.label}{waiting ? ` · ${waiting} sending` : ''}</Text>
    </Pressable>
  );
}

/** The scan button. One tap asks the PC to check Google Classroom now; the card then follows it step by step. */
export function ScanCard() {
  const e = useContext(AppCtx);
  const peek = scanView(e);
  const now = useNow(peek.busy ? 1500 : 15000);
  const v = scanView(e, now);
  const c = connInfo(e, now);
  return (
    <LinearGradient colors={v.error ? ['#B4232F', '#7E1620'] : ['#2F74FF', '#173FB8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.scan, shadow]}>
      <View style={s.scanGlow} />
      <View style={{ flex: 1 }}>
        <Text style={s.scanTitle}>{v.title}</Text>
        <Text style={s.scanLine}>{v.line}</Text>
        <View style={s.scanMeta}>
          <View style={[s.connDot, { backgroundColor: c.pcOnline ? '#5BE3A8' : '#FFC46B' }]} />
          <Text style={s.scanMetaTxt}>{c.pcLine}</Text>
        </View>
      </View>
      <Pressable onPress={v.busy ? undefined : () => e.scanNow()} disabled={v.busy} style={({ pressed }) => [s.scanBtn, pressed && { transform: [{ scale: 0.96 }] }]}>
        {v.busy ? <ActivityIndicator color={T.brand} /> : <Icon n={v.fresh ? 'checkmark' : 'scan'} s={28} c={v.fresh ? T.green : T.brand} />}
        <Text style={[s.scanBtnTxt, v.fresh && { color: T.green }]}>{v.busy ? 'Working' : v.fresh ? 'Done' : 'Scan'}</Text>
      </Pressable>
    </LinearGradient>
  );
}

export function HomeScreen() {
  const e = useContext(AppCtx);
  const { items, openItem, refresh, refreshing, cfg } = e;
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const now = useNow(60000);
  const d = useMemo(() => {
    const open = items.filter(isOpen);
    const b = (n) => open.filter((i) => bucketOf(i) === n).length;
    const late = open.filter((i) => workState(i) === 'late').sort((a, c) => (c.dueAt || 0) - (a.dueAt || 0));
    const next = open.filter((i) => workState(i) !== 'late' && i.dueAt).sort((a, c) => a.dueAt - c.dueAt);
    const undated = open.filter((i) => workState(i) !== 'late' && !i.dueAt);
    const latest = items.filter((i) => isNew(i) || hasUpdate(i)).sort((a, c) => Math.max(c.created_at || 0, c.changed_at || 0) - Math.max(a.created_at || 0, a.changed_at || 0));
    return { missing: late.length, today: b('Today'), week: b('Today') + b('Tomorrow') + b('This week'), todo: open.length, up: [...late.slice(0, 2), ...next, ...undated].slice(0, 6), latest: latest.slice(0, 6) };
  }, [items, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const hour = new Date(now).getHours();
  const hello = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = String(cfg.name || '').split(/[\s._-]/)[0];
  const tiles = [['Missing', d.missing, d.missing ? T.red : T.faint, 'missing', 'alert-circle'], ['Due today', d.today, d.today ? T.amber : T.faint, 'todo', 'today'], ['This week', d.week, T.brand, 'todo', 'calendar'], ['To do', d.todo, T.ink, 'todo', 'list']];

  const upNext = (
    <View style={wide && { flex: 1 }}>
      <SectionTitle title="Up next" right={d.todo > d.up.length ? <Text style={s.link} onPress={() => e.goTab('todo', 'todo')}>See all {d.todo}</Text> : null} />
      <Card>
        {d.up.length ? d.up.map((i, k) => <WorkRow key={i.id} item={i} showCourse last={k === d.up.length - 1} onPress={() => openItem(i.id)} />)
          : <Empty icon="checkmark-done" title="You’re all caught up" text="Nothing is waiting to be done." />}
      </Card>
    </View>
  );
  const latest = (
    <View style={wide && { flex: 1 }}>
      <SectionTitle title="New and updated" />
      <Card>
        {d.latest.length ? d.latest.map((i, k) => <WorkRow key={i.id} item={i} showCourse last={k === d.latest.length - 1} note={hasUpdate(i) ? (i.change_note || i.changeNote) : undefined} onPress={() => openItem(i.id)} />)
          : <Empty icon="notifications-outline" title="Nothing new today" text="New posts and grades show up here, and you get a notification." />}
      </Card>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={[s.page, wide && { paddingHorizontal: 28 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.brand} />}>
      <View style={s.top}>
        <View style={{ flex: 1 }}>
          <Text style={s.hello} numberOfLines={1}>{hello}{first ? `, ${first.charAt(0).toUpperCase() + first.slice(1)}` : ''}</Text>
          <Text style={s.date}>{new Date(now).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        </View>
        <ConnChip />
      </View>

      {!cfg.token && !e.canReadCloud ? (
        <Card style={{ padding: 20, gap: 10 }}>
          <Text style={s.cardTitle}>Sign in to get started</Text>
          <Text style={s.cardTxt}>Sign in once on normal Wi-Fi. After that your classes, files and turn-ins also work on the school Wi-Fi, through iCloud.</Text>
          <Btn label="Sign in" icon="log-in-outline" onPress={() => e.goTab('more')} />
        </Card>
      ) : (<>
        <ScanCard />
        <View style={s.tiles}>
          {tiles.map(([label, n, color, seg, icon]) => (
            <Pressable key={label} onPress={() => e.goTab('todo', seg)} style={({ pressed }) => [s.tile, pressed && { opacity: 0.7 }]}>
              <Icon n={icon} s={17} c={color} />
              <Text style={[s.tileN, { color }]}>{n}</Text>
              <Text style={s.tileL} numberOfLines={1}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {wide ? <View style={{ flexDirection: 'row', gap: 22 }}>{upNext}{latest}</View> : <>{upNext}{latest}</>}
        {items.length === 0 && <Text style={s.hint}>Your classes appear here after the first sync. Pull down to refresh, or tap Scan.</Text>}
      </>)}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingBottom: 110, paddingTop: 6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, paddingTop: 12, paddingBottom: 16 },
  hello: { fontSize: 28, fontWeight: '800', color: T.ink, letterSpacing: -0.5 },
  date: { fontSize: 14, color: T.sub, marginTop: 2 },
  conn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: '#fff', borderWidth: 1, borderColor: T.line },
  connDot: { width: 9, height: 9, borderRadius: 5 },
  connTxt: { fontSize: 13, fontWeight: '700', color: T.text },
  scan: { borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, overflow: 'hidden' },
  scanGlow: { position: 'absolute', right: -60, top: -80, width: 240, height: 240, borderRadius: 120, backgroundColor: '#ffffff14' },
  scanTitle: { color: '#fff', fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  scanLine: { color: '#ffffffe0', fontSize: 14.5, marginTop: 5, lineHeight: 20 },
  scanMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
  scanMetaTxt: { color: '#ffffffb8', fontSize: 12.5, fontWeight: '600' },
  scanBtn: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', gap: 2 },
  scanBtnTxt: { fontSize: 12.5, fontWeight: '800', color: T.brand },
  tiles: { flexDirection: 'row', gap: 10, marginTop: 14 },
  tile: { flex: 1, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 12, gap: 2 },
  tileN: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  tileL: { fontSize: 12, color: T.sub, fontWeight: '600' },
  link: { color: T.brand, fontSize: 13, fontWeight: '700' },
  cardTitle: { fontSize: 18, fontWeight: '800', color: T.ink },
  cardTxt: { fontSize: 14.5, color: T.sub, lineHeight: 21 },
  hint: { textAlign: 'center', color: T.faint, marginTop: 22, fontSize: 13.5, lineHeight: 19 },
});
