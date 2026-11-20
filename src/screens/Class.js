// One class, laid out like Google Classroom: the bar with the class's name, underlined tabs — Stream, Classwork, People and
// (this app's extra) Grades. Stream = a coloured banner, an "Upcoming" card and the feed; Classwork = a topic filter and the
// posts under their topics; People = teachers and the number of classmates.
import React, { useContext, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppCtx } from '../ctx';
import { T, classTone } from '../theme';
import { AppBar, Avatar, Btn, Dropdown, Empty, GroupHead, IconBtn, MIcon, RowIcon, StatePill, Tabs, Text, WorkRow, DONE_STATES, gradeParts, gradeSummary, isOpen, isWork, monthKey, monthLabel, niceCourse, niceName, postedDetail, realName, shortDue, teacherOf, workState } from '../ui';

const posted = (i) => i.posted_at || i.created_at || 0;
/** "Today, 10:19 AM" / "Nov 17, 9:28 AM" — when it was posted, as a line of its own. */
const when = (i) => { const t = postedDetail(i).replace(/^Posted /, ''); return t.charAt(0).toUpperCase() + t.slice(1); };
const KIND_WORD = { assignment: 'a new assignment', material: 'new material', email: 'a message' };
const pctColor = (p) => (p >= 85 ? T.green : p >= 70 ? T.amber : T.red);

/** One post in the Stream: an announcement shows its text; everything else is "<teacher> posted a new assignment: …". */
function StreamPost({ item, who, onOpen, onMore }) {
  const nf = (item.files || []).filter((f) => f.origin !== 'upload').length;
  if (item.kind === 'announcement') {
    return (
      <Pressable onPress={onOpen} style={({ pressed }) => [s.post, pressed && { opacity: 0.85 }]}>
        <View style={s.postHead}>
          <Avatar name={who || 'A'} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={s.postWho} numberOfLines={1}>{who || 'Announcement'}</Text>
            <Text style={s.postWhen}>{when(item)}</Text>
          </View>
          {item.starred && <MIcon n="pin" s={16} c={T.amberFill} />}
          <IconBtn mi="dots-vertical" onPress={onMore} size={22} style={{ marginRight: -8 }} />
        </View>
        <Text style={s.postBody} numberOfLines={9}>{String(item.body || item.title || '').trim()}</Text>
        {nf > 0 && <View style={s.postFiles}><MIcon n="paperclip" s={16} c={T.sub} /><Text style={s.postFilesTxt}>{nf} attachment{nf === 1 ? '' : 's'}</Text></View>}
      </Pressable>
    );
  }
  const lead = who ? `${who} posted ${KIND_WORD[item.kind] || 'a new post'}: ` : `${item.kind === 'material' ? 'New material' : 'New assignment'}: `;
  const done = isWork(item) && DONE_STATES.includes(workState(item));
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [s.post, s.postRow, pressed && { opacity: 0.85 }]}>
      <RowIcon item={item} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.postLine} numberOfLines={3}>{lead}{item.title}</Text>
        <Text style={s.postWhen} numberOfLines={2}>{[when(item), isWork(item) && (item.dueAt || item.due) && !done ? 'Due ' + shortDue(item) : ''].filter(Boolean).join(' · ')}</Text>
        {isWork(item) && (workState(item) !== 'open' || item.turnin === 'queued') && <View style={{ alignItems: 'flex-start', marginTop: 2 }}><StatePill item={item} plain /></View>}
      </View>
      {item.starred && <MIcon n="pin" s={14} c={T.amberFill} />}
      <IconBtn mi="dots-vertical" onPress={onMore} size={22} style={{ marginRight: -12 }} />
    </Pressable>
  );
}

export function ClassScreen({ name, tab: startTab }) {
  const e = useContext(AppCtx);
  const { items, openItem, pop } = e;
  const { width } = useWindowDimensions();
  const [cw, setCw] = useState(width);
  const [tab, setTab] = useState(startTab || 'stream');
  const [topic, setTopic] = useState('');
  const [fold, setFold] = useState({});
  const tone = classTone(name);
  const two = cw >= 760;

  const mine = useMemo(() => items.filter((i) => (i.course || 'Other') === name).sort((a, b) => posted(b) - posted(a)), [items, name]);
  const teacher = useMemo(() => teacherOf(mine), [mine]);
  const upcoming = useMemo(() => mine.filter((i) => isOpen(i) && workState(i) !== 'late' && i.dueAt).sort((a, b) => a.dueAt - b.dueAt).slice(0, 3), [mine]);
  const missing = useMemo(() => mine.filter((i) => isOpen(i) && workState(i) === 'late'), [mine]);

  // Classwork: posts sit under their topic, in the order the teacher arranged them. A post that has not been sorted into a
  // topic yet (just posted) waits at the top. Until the topics have been read, months are the fallback.
  const groups = useMemo(() => {
    const list = mine.filter((i) => i.kind !== 'announcement');
    if (list.some((i) => (i.io ?? -1) >= 0)) {
      const m = new Map();
      for (const i of list) {
        const placed = (i.io ?? -1) >= 0;
        const key = placed ? `t${i.to}` : 'new';
        let g = m.get(key);
        if (!g) { g = { k: key, label: placed ? (i.topic || 'No topic') : 'Just posted', ord: placed ? i.to : -1, list: [] }; m.set(key, g); }
        g.list.push(i);
      }
      const byTopic = [...m.values()].sort((a, b) => a.ord - b.ord);
      byTopic.forEach((g) => g.list.sort((a, b) => (a.io ?? 1e9) - (b.io ?? 1e9) || posted(b) - posted(a)));
      return byTopic;
    }
    const out = [];
    for (const i of list) {
      const k = monthKey(i);
      let g = out[out.length - 1];
      if (!g || g.k !== k) { g = { k, label: monthLabel(i), list: [] }; out.push(g); }
      g.list.push(i);
    }
    return out;
  }, [mine]);
  const shown = groups.filter((g) => !topic || g.k === topic);
  const allFolded = shown.length > 0 && shown.every((g) => fold[g.k]);

  // People: the teachers (read off the class's People page; the names on its posts when that has not been read yet).
  const cid = useMemo(() => { const u = (mine.find((i) => i.url) || {}).url || ''; return (u.match(/\/c\/([^/]+)/) || [])[1] || ''; }, [mine]);
  const roster = (e.remote && e.remote.people && cid && e.remote.people[cid]) || null;
  const teachers = useMemo(() => {
    if (roster && roster.t && roster.t.length) return roster.t.map(niceName);
    const n = {};
    for (const i of mine) if (realName(i.author)) n[i.author] = (n[i.author] || 0) + 1;
    return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([k]) => niceName(k));
  }, [mine, roster]);

  const scored = useMemo(() => mine.filter((i) => gradeParts(i.grade)), [mine]);
  const sum = useMemo(() => gradeSummary(mine), [mine]);
  const waiting = useMemo(() => mine.filter((i) => isWork(i) && workState(i) === 'turnedin' && !gradeParts(i.grade)).length, [mine]);

  const moreFor = (i) => () => e.openMenu([
    { label: 'Open', mi: 'open-in-new', onPress: () => openItem(i.id) },
    { label: i.starred ? 'Unpin' : 'Pin to the top of Home', mi: i.starred ? 'pin-off-outline' : 'pin-outline', onPress: () => e.togglePin(i) },
  ]);
  const upcomingCard = (
    <View style={[s.upcoming, two && { width: 200 }]}>
      <Text style={s.upTitle}>Upcoming</Text>
      {upcoming.length === 0 ? <Text style={s.upNone}>Woohoo, no work due soon!</Text> : upcoming.map((i) => (
        <Pressable key={i.id} onPress={() => openItem(i.id)} style={({ pressed }) => [s.upRow, pressed && { opacity: 0.5 }]}>
          <Text style={s.upDue}>{'Due ' + (new Date(i.dueAt).toDateString() === new Date().toDateString() ? 'today' : new Date(i.dueAt).toDateString() === new Date(Date.now() + 86400000).toDateString() ? 'tomorrow' : new Date(i.dueAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }))}</Text>
          <Text style={s.upName} numberOfLines={1}>{new Date(i.dueAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – {i.title}</Text>
        </Pressable>
      ))}
      <Pressable onPress={() => setTab('classwork')} hitSlop={8}><Text style={s.upAll}>View all</Text></Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }} onLayout={(ev) => setCw(ev.nativeEvent.layout.width)}>
      {e.wide
        ? <AppBar brand onMenu={e.openDrawer} onBrand={() => e.goTab('classes')} crumb={niceCourse(name)} crumbSub={teacher} />
        : <AppBar onBack={pop} title={niceCourse(name)} subtitle={teacher} />}
      <Tabs fill={!e.wide} options={[['stream', 'Stream'], ['classwork', 'Classwork'], ['people', 'People'], ['grades', 'Grades']]} value={tab} onChange={setTab} />

      {tab === 'stream' && (
        <ScrollView contentContainerStyle={s.page}>
          <View style={s.wrap}>
            <View style={[s.banner, { backgroundColor: tone.bg }, two && { height: 200 }]}>
              <View style={[s.bannerA, { backgroundColor: tone.solid }]} />
              <View style={[s.bannerB, { backgroundColor: tone.solid }]} />
              <Text style={[s.bannerTitle, two && { fontSize: 36, lineHeight: 44 }]} numberOfLines={3}>{niceCourse(name)}</Text>
              {!!teacher && <Text style={s.bannerSub}>{teacher}</Text>}
            </View>
            <View style={two ? s.cols : null}>
              {upcomingCard}
              <View style={{ flex: 1 }}>
                {mine.length === 0 && <Empty icon="chat-outline" title="Nothing posted yet" />}
                {mine.map((i) => <StreamPost key={i.id} item={i} who={niceName(realName(i.author) ? i.author : '')} onOpen={() => openItem(i.id)} onMore={moreFor(i)} />)}
              </View>
            </View>
          </View>
        </ScrollView>
      )}

      {tab === 'classwork' && (
        <ScrollView contentContainerStyle={s.page}>
          <View style={s.wrap}>
            <View style={s.cwBar}>
              <Dropdown label="Topic filter" value={topic} onChange={setTopic} style={two ? { width: 340 } : { flex: 1 }}
                options={[['', 'All topics'], ...groups.map((g) => [g.k, g.label])]} />
              <View style={{ flex: two ? 1 : 0 }} />
              {two && <Btn kind="outlined" mi="clipboard-account-outline" label="View your work" onPress={() => setTab('grades')} />}
              <Pressable onPress={() => setFold(allFolded ? {} : Object.fromEntries(shown.map((g) => [g.k, true])))} hitSlop={8} style={s.collapse}>
                <MIcon n={allFolded ? 'unfold-more-horizontal' : 'unfold-less-horizontal'} s={20} c={T.brand} /><Text style={s.collapseTxt}>{allFolded ? 'Expand all' : 'Collapse all'}</Text>
              </Pressable>
            </View>
            {!two && <View style={{ marginTop: 8, alignItems: 'flex-start' }}><Btn kind="outlined" small mi="clipboard-account-outline" label="View your work" onPress={() => setTab('grades')} /></View>}
            {shown.length === 0 && <Empty icon="file-tray-outline" title="Nothing here yet" />}
            {shown.map((g) => (
              <View key={g.k} style={{ marginTop: 20 }}>
                <GroupHead title={g.label} size={24} open={!fold[g.k]} onToggle={() => setFold((f) => ({ ...f, [g.k]: !f[g.k] }))} />
                <View style={s.topicLine} />
                {!fold[g.k] && g.list.map((i, k) => <WorkRow key={i.id} item={i} mode="classwork" last={k === g.list.length - 1} onPress={() => openItem(i.id)} onLongPress={() => e.togglePin(i)} onMore={moreFor(i)} />)}
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {tab === 'people' && (
        <ScrollView contentContainerStyle={s.page}>
          <View style={s.wrap}>
            <Text style={s.pHead}>Teachers</Text>
            <View style={s.pRule} />
            {teachers.length === 0 && <Text style={s.pNone}>Your teacher’s name shows up here after the PC has looked at this class.</Text>}
            {teachers.map((t) => (
              <View key={t} style={s.pRow}><Avatar name={t} size={40} color={tone.solid} /><Text style={s.pName}>{t}</Text></View>
            ))}
            <View style={s.pHeadRow}>
              <Text style={s.pHead}>Classmates</Text>
              {!!(roster && roster.n) && <Text style={s.pCount}>{roster.n} student{roster.n === 1 ? '' : 's'}</Text>}
            </View>
            <View style={s.pRule} />
            <Text style={s.pNote}>{roster && roster.n ? 'Your classmates’ names stay in Google Classroom. This app only keeps how many there are, so other students’ names are not copied anywhere.' : 'The number of students shows up here after the PC has looked at this class.'}</Text>
          </View>
        </ScrollView>
      )}

      {tab === 'grades' && (
        <ScrollView contentContainerStyle={s.page}>
          <View style={s.wrap}>
            <View style={s.sum}>
              <View style={{ flex: 1 }}>
                <Text style={s.sumL}>Average of graded work</Text>
                <Text style={[s.sumBig, sum.pct != null && { color: pctColor(sum.pct) }]}>{sum.pct != null ? `${sum.pct}%` : '—'}</Text>
                <Text style={s.sumSub}>{sum.n ? `${sum.got} of ${sum.of} points · ${sum.n} graded` : 'Nothing graded yet'}</Text>
              </View>
              <View style={s.sumSide}>
                <Text style={[s.sumNum, missing.length > 0 && { color: T.red }]}>{missing.length}</Text><Text style={s.sumCap}>missing</Text>
                <Text style={[s.sumNum, { marginTop: 8 }]}>{waiting}</Text><Text style={s.sumCap}>turned in, not graded yet</Text>
              </View>
            </View>
            <Text style={s.fine}>Points earned out of points possible, across everything graded here. Your teacher may weigh work differently, so the grade in the school portal can be different.</Text>
            {scored.length === 0 ? <Empty icon="ribbon-outline" title="No grades yet" text="Scores show up here as soon as your teacher grades something." /> : (<>
              <GroupHead title="Graded" count={scored.length} size={22} style={{ marginTop: 16 }} />
              <View style={s.topicLine} />
              {scored.map((i, k) => {
                const g = gradeParts(i.grade), p = Math.round((g.got / g.of) * 100);
                return (
                  <Pressable key={i.id} onPress={() => openItem(i.id)} style={({ pressed }) => [s.gRow, pressed && { backgroundColor: T.tonal }, k < scored.length - 1 && s.gLine]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.gTitle} numberOfLines={2}>{i.title}</Text>
                      <Text style={s.gSub} numberOfLines={1}>{postedDetail(i)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.gScore}>{i.grade}</Text>
                      <Text style={[s.gPct, { color: pctColor(p) }]}>{p}%</Text>
                    </View>
                  </Pressable>
                );
              })}
            </>)}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },
  wrap: { width: '100%', maxWidth: 1100, alignSelf: 'center' },
  banner: { borderRadius: 16, height: 132, padding: 20, justifyContent: 'center', overflow: 'hidden', marginBottom: 16 },
  bannerA: { position: 'absolute', right: -40, top: -60, width: 230, height: 230, borderRadius: 115, opacity: 0.14 },
  bannerB: { position: 'absolute', right: 90, bottom: -90, width: 170, height: 170, borderRadius: 85, opacity: 0.1 },
  bannerTitle: { fontSize: 28, lineHeight: 34, color: T.ink },
  bannerSub: { fontSize: 16, color: T.sub, marginTop: 4 },
  cols: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  upcoming: { borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 16, gap: 10, marginBottom: 16 },
  upTitle: { fontSize: 16, fontWeight: '500', color: T.ink },
  upNone: { fontSize: 13, color: T.sub },
  upRow: { gap: 1 },
  upDue: { fontSize: 12, color: T.sub },
  upName: { fontSize: 12, color: T.ink },
  upAll: { fontSize: 14, color: T.brand, fontWeight: '500', alignSelf: 'flex-end', marginTop: 4 },
  post: { backgroundColor: T.tonal, borderRadius: 16, padding: 16, marginBottom: 12 },
  postRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  postWho: { fontSize: 14, fontWeight: '500', color: T.ink },
  postWhen: { fontSize: 12, color: T.sub, marginTop: 1 },
  postBody: { fontSize: 14, color: T.ink, lineHeight: 21 },
  postFiles: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  postFilesTxt: { fontSize: 13, color: T.sub },
  postLine: { fontSize: 14, fontWeight: '500', color: T.ink, lineHeight: 20 },
  cwBar: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  collapse: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 8 },
  collapseTxt: { fontSize: 14, fontWeight: '500', color: T.brand },
  topicLine: { height: 1, backgroundColor: T.line },
  pHead: { fontSize: 32, lineHeight: 40, color: T.ink },
  pHeadRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 36 },
  pCount: { fontSize: 14, color: T.sub },
  pRule: { height: 2, backgroundColor: T.brand, marginTop: 6, marginBottom: 6 },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12 },
  pName: { fontSize: 15, color: T.ink },
  pNone: { fontSize: 14, color: T.sub, paddingVertical: 12 },
  pNote: { fontSize: 14, color: T.sub, lineHeight: 20, paddingVertical: 10 },
  sum: { flexDirection: 'row', backgroundColor: T.tonal2, borderRadius: 16, padding: 20, gap: 16, alignItems: 'center' },
  sumL: { fontSize: 14, color: T.sub },
  sumBig: { fontSize: 45, lineHeight: 54, color: T.ink, marginTop: 2 },
  sumSub: { fontSize: 14, color: T.sub, marginTop: 1 },
  sumSide: { alignItems: 'flex-end', maxWidth: 150 },
  sumNum: { fontSize: 24, color: T.ink },
  sumCap: { fontSize: 12, color: T.sub, textAlign: 'right' },
  fine: { fontSize: 12, color: T.faint, lineHeight: 17, marginTop: 10, marginHorizontal: 4 },
  gRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 60 },
  gLine: { borderBottomWidth: 1, borderBottomColor: T.line },
  gTitle: { fontSize: 16, color: T.ink, lineHeight: 21 },
  gSub: { fontSize: 12, color: T.sub, marginTop: 2 },
  gScore: { fontSize: 16, fontWeight: '500', color: T.ink },
  gPct: { fontSize: 13, fontWeight: '500', marginTop: 1 },
});
