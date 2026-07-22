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

