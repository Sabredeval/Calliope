import { plainText } from './model.js'

/* ---------- codex mention detection ---------- */

export function findMentions(text, codex) {
  const lower = (text || '').toLowerCase()
  const found = []
  for (const entry of codex) {
    const names = [entry.name, ...(entry.aliases || [])].filter(Boolean)
    let count = 0
    for (const n of names) {
      const needle = n.toLowerCase()
      if (!needle) continue
      let i = lower.indexOf(needle)
      while (i !== -1) {
        count++
        i = lower.indexOf(needle, i + needle.length)
      }
    }
    if (count > 0) found.push({ entry, count })
  }
  return found.sort((a, b) => b.count - a.count)
}

/* ---------- scene flattening + reverse mention index ---------- */

// Flat, ordered list of every "writable location" in the manuscript, with
// its parent chapter attached — handy anywhere a component needs to walk
// the manuscript without nested loops. A chapter with scenes contributes
// one entry per scene; a flow-mode chapter (no scenes, written directly)
// contributes a single pseudo-scene entry standing in for itself, flagged
// isChapterFlow so consumers can tell the two apart when they need to.
export function flatScenes(chapters) {
  const out = []
  for (const ch of chapters || []) {
    if (ch.scenes && ch.scenes.length) {
      for (const sc of ch.scenes) {
        out.push({ ...sc, chapterId: ch.id, chapterTitle: ch.title, isChapterFlow: false })
      }
    } else {
      out.push({
        id: ch.id, title: ch.title, summary: '', content: ch.content, status: null,
        chapterId: ch.id, chapterTitle: ch.title, isChapterFlow: true,
      })
    }
  }
  return out
}

// Inverse of findMentions: for every codex entry, which scenes (or flow
// chapters) mention it and how often.
// { [entryId]: [{ sceneId, sceneTitle, chapterId, chapterTitle, count, isChapterFlow, locationId }] }
// locationId is always a valid jump target (a scene id, or — for flow
// chapters — the chapter's own id); sceneId is null for flow-chapter hits.
export function mentionsByEntry(chapters, codex) {
  const map = {}
  for (const sc of flatScenes(chapters)) {
    const text = `${sc.summary || ''} ${plainText(sc.content)}`
    for (const { entry, count } of findMentions(text, codex)) {
      if (!map[entry.id]) map[entry.id] = []
      map[entry.id].push({
        sceneId: sc.isChapterFlow ? null : sc.id,
        sceneTitle: sc.title,
        chapterId: sc.chapterId,
        chapterTitle: sc.chapterTitle,
        isChapterFlow: sc.isChapterFlow,
        locationId: sc.id,
        count,
      })
    }
  }
  return map
}

/* ---------- manuscript tree (groups + chapters, in display order) ---------- */

// Unified sibling order at a given parent level (an Act's id, or null for the
// root) — merges child acts and child chapters into one list sorted by their
// shared `order` field, so the sidebar tree, arrow-key reordering, and
// drag-and-drop all agree on "what comes before/after what" regardless of
// whether it's an act or a chapter. Lets acts and chapters be freely
// interleaved, Scrivener-binder style, instead of acts always coming first.
export function siblingsAt(chapters, groups, parentId) {
  const gs = (groups || [])
    .filter((g) => (g.parentId ?? null) === (parentId ?? null))
    .map((g) => ({ id: g.id, kind: 'group', order: g.order ?? 0 }))
  const cs = (chapters || [])
    .filter((c) => (c.groupId ?? null) === (parentId ?? null))
    .map((c) => ({ id: c.id, kind: 'chapter', order: c.order ?? 0 }))
  return [...gs, ...cs].sort((a, b) => a.order - b.order)
}

// Builds the nested Act/.../Chapter tree in true display order (acts and
// chapters interleaved per siblingsAt, not grouped-then-chapters).
export function buildManuscriptTree(chapters, groups, parentId = null) {
  return siblingsAt(chapters, groups, parentId).map((item) => {
    if (item.kind === 'group') {
      const g = groups.find((x) => x.id === item.id)
      return { type: 'group', group: g, children: buildManuscriptTree(chapters, groups, g.id) }
    }
    const c = chapters.find((x) => x.id === item.id)
    return { type: 'chapter', chapter: c }
  })
}

/* ---------- writing log (daily streak / habit tracking) ---------- */

// Local calendar date, not UTC — a streak should follow the writer's own
// day boundary, not flip at midnight UTC for people west of Greenwich.
export function dateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(key, delta) {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  return dateKey(dt)
}

// Derives everything the streak UI needs from the persisted day-total
// snapshots plus the *live* current total (today's snapshot may be stale by
// a few keystrokes if writingLog/sync hasn't fired yet, so the caller always
// passes the freshly computed total rather than relying on days[today]).
export function writingStats(writingLog, liveTotalToday, now = new Date()) {
  const days = writingLog?.days || {}
  const goal = writingLog?.dailyGoal || 0
  const today = dateKey(now)

  // yesterday's frozen total is the baseline for today's delta; if we've
  // never seen yesterday (gap, or a brand-new novel), fall back to today's
  // own first-seen snapshot so day one doesn't read as a huge false delta
  const yesterday = addDays(today, -1)
  const baseline = days[yesterday] ?? liveTotalToday
  const todayWords = Math.max(0, liveTotalToday - baseline)

  // per-day delta for a frozen (past) day — null when we have no data to
  // compare against (a gap in the log, e.g. the novel didn't exist yet)
  const deltaFor = (key, prevKey) => {
    if (!(key in days)) return null
    const prev = days[prevKey]
    if (prev === undefined) return null
    return Math.max(0, days[key] - prev)
  }
  // a day "counts" toward the streak if it met the goal — or, with no goal
  // set, simply if any words were logged that day at all
  const counts = (delta) => delta !== null && (goal > 0 ? delta >= goal : delta > 0)

  let streak = counts(todayWords) ? 1 : 0
  let cursor = yesterday
  while (true) {
    const prevKey = addDays(cursor, -1)
    const delta = deltaFor(cursor, prevKey)
    if (!counts(delta)) break
    streak++
    cursor = prevKey
  }

  // last 12 weeks of daily deltas for the calendar heatmap, oldest first
  const heatmap = []
  for (let i = 83; i >= 0; i--) {
    const key = addDays(today, -i)
    const prevKey = addDays(key, -1)
    const delta = key === today ? todayWords : deltaFor(key, prevKey)
    heatmap.push({ key, words: delta, hasData: delta !== null })
  }

  const bestDay = Math.max(todayWords, ...heatmap.map((h) => h.words || 0))

  return { today, todayWords, goal, streak, heatmap, bestDay }
}

