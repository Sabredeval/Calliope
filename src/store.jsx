import React, { createContext, useContext, useReducer, useEffect, useRef, useMemo } from 'react'

/* ---------- helpers ---------- */

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export const plainText = (html) => {
  const div = document.createElement('div')
  div.innerHTML = html || ''
  return div.textContent || ''
}

export const countWords = (text) => {
  const t = (text || '').trim()
  return t ? t.split(/\s+/).length : 0
}

export const sceneWords = (scene) => countWords(plainText(scene.content))
// A chapter with scenes counts them; a "flow" chapter (no scenes — written
// directly) counts its own content instead.
export const chapterWords = (ch) =>
  ch.scenes && ch.scenes.length ? ch.scenes.reduce((n, s) => n + sceneWords(s), 0) : countWords(plainText(ch.content))
export const novelWords = (chapters) => chapters.reduce((n, c) => n + chapterWords(c), 0)

// Recursive word total for a group (Act/Part/whatever) — its own chapters
// plus every nested child group's chapters.
export function groupWords(groupId, chapters, groups) {
  let total = 0
  for (const c of chapters) if (c.groupId === groupId) total += chapterWords(c)
  for (const g of groups || []) if (g.parentId === groupId) total += groupWords(g.id, chapters, groups)
  return total
}

// Scenes (splitting a chapter into multiple named sub-units) are archived for
// now — the reducer cases, helpers, and rendering branches below still exist
// so the feature is a one-line flip to bring back, but nothing in the UI
// currently offers a way to create one. Existing scene content is folded
// into its chapter's own flow content on load (see ensureHierarchyDefaults).
export const SCENES_ENABLED = false

export const SCENE_STATUSES = [
  { id: 'idea', label: 'Idea', color: 'var(--status-idea)' },
  { id: 'draft', label: 'Draft', color: 'var(--status-draft)' },
  { id: 'revised', label: 'Revised', color: 'var(--status-revised)' },
  { id: 'done', label: 'Done', color: 'var(--status-done)' },
]

export const CODEX_TYPES = [
  { id: 'character', label: 'Character', plural: 'Characters', icon: '👤' },
  { id: 'location', label: 'Location', plural: 'Locations', icon: '🗺️' },
  { id: 'item', label: 'Item', plural: 'Items', icon: '🗝️' },
  { id: 'lore', label: 'Lore', plural: 'Lore', icon: '📜' },
  { id: 'organization', label: 'Organization', plural: 'Organizations', icon: '🏛️' },
]

export const CODEX_COLORS = [
  '#e05c5c', '#e08d3c', '#d4b13f', '#6aab5e', '#4ba0a8', '#5b83d6', '#8a6ede', '#c95d9e', '#8d8d94',
]

/* ---------- timeline seed ---------- */

export const seedTimeline = () => {
  const tHistory = uid()
  const tLives = uid()
  const tStory = uid()
  return {
    unit: 'Year AE',
    tracks: [
      { id: tHistory, title: 'History' },
      { id: tLives, title: 'Lives' },
      { id: tStory, title: 'Story' },
    ],
    items: [
      { id: uid(), trackId: tHistory, kind: 'span', title: 'Reign of the Vaelor Dynasty', start: 320, end: 432, color: '#4ba0a8', description: 'Three centuries of unbroken rule from Vael Keep, ended by the last king’s failed working.' },
      { id: uid(), trackId: tHistory, kind: 'event', title: 'The Sundering', start: 432, end: null, color: '#8d8d94', description: 'The crown is unmade; the royal line and the realm’s bound magic shatter together.' },
      { id: uid(), trackId: tHistory, kind: 'span', title: 'The Interregnum', start: 432, end: null, color: '#8a6ede', description: 'Eighty years without a throne, policed by the Order of the Unlit Flame.' },
      { id: uid(), trackId: tHistory, kind: 'event', title: 'Order of the Unlit Flame founded', start: 434, end: null, color: '#8a6ede', description: 'Survivors of the Sundering swear that no monarch will ever rule again.' },
      { id: uid(), trackId: tLives, kind: 'span', title: 'Vaelor III, the Last King', start: 398, end: 432, color: '#d4b13f', description: 'Crowned at nineteen, unmade at fifty-three by his own ambition.' },
      { id: uid(), trackId: tLives, kind: 'span', title: 'Corvan', start: 478, end: null, color: '#5b83d6', description: 'Disgraced knight of the Order, oath-bound to the ring’s bearer.' },
      { id: uid(), trackId: tLives, kind: 'span', title: 'Aria Thorne', start: 493, end: null, color: '#e05c5c', description: 'Orchard-keeper of Thornfield; the ring finds her at nineteen.' },
      { id: uid(), trackId: tStory, kind: 'event', title: 'Ch 1 · The Burning of Thornfield', start: 512, end: null, color: '#e08d3c', description: 'The novel opens. Thornfield burns; Aria takes the ring from the ashes.' },
      { id: uid(), trackId: tStory, kind: 'event', title: 'Ch 2 · The Road North', start: 512, end: null, color: '#e08d3c', description: 'Aria and Corvan set out for Vael Keep.' },
    ],
  }
}

/* ---------- relationships seed ---------- */

export const seedRelationships = (codex) => {
  const byName = (n) => codex.find((e) => e.name === n)?.id
  const mk = (a, b, label, directed = true) => {
    const fromId = byName(a)
    const toId = byName(b)
    return fromId && toId ? { id: uid(), fromId, toId, label, directed } : null
  }
  return [
    mk('Corvan', 'Aria Thorne', 'sworn protector of'),
    mk('Aria Thorne', 'The Hollow Crown', 'bearer of'),
    mk('Aria Thorne', 'Thornfield', 'grew up in'),
    mk('Corvan', 'Order of the Unlit Flame', 'deserted from'),
    mk('Order of the Unlit Flame', 'Thornfield', 'burned'),
    mk('Order of the Unlit Flame', 'The Hollow Crown', 'hunts'),
    mk('The Hollow Crown', 'The Sundering', 'fragment of'),
    mk('Vael Keep', 'The Sundering', 'holds records of'),
    mk('Order of the Unlit Flame', 'The Sundering', 'founded after'),
  ].filter(Boolean)
}

/* ---------- seed data ---------- */

const seedState = () => {
  const scene = (title, summary, status, content) => ({
    id: uid(), title, summary, status, content,
  })
  return {
    novel: {
      title: 'The Hollow Crown',
      author: 'King Magdeley',
      wordGoal: 80000,
    },
    groups: [],
    chapters: [
      {
        id: uid(),
        title: 'Chapter 1 — Embers',
        groupId: null,
        content: '<p></p>',
        scenes: [
          scene(
            'The Burning of Thornfield',
            'Aria watches her village burn and finds the sigil ring in the ashes.',
            'draft',
            '<p>The smoke reached Aria before the news did. She stood at the crest of the hollow road, wheat brushing her knees, and watched Thornfield fold into fire the way parchment curls in a hearth — edges first, then all at once.</p><p>By the time she reached the square, there was nothing left to save. Only the well remained untouched, and beside it, half-buried in ash, a ring of blackened silver bearing the sigil of a crown with no jewels. A <em>hollow</em> crown.</p><p>She should have left it in the ash. Instead, she picked it up.</p>'
          ),
          scene(
            'The Stranger at the Well',
            'Corvan introduces himself and warns Aria that the ring is being hunted.',
            'draft',
            '<p>"You should not be holding that," said a voice behind her.</p><p>The man was tall, road-worn, with a crow perched on the pommel of his sword as if it had grown there. He named himself Corvan, and he said the name like an apology.</p><p>"The ones who burned this place were looking for it," he said, nodding at her closed fist. "They will know it survived. Rings like that one want to be found."</p>'
          ),
        ],
      },
      {
        id: uid(),
        title: 'Chapter 2 — The Road North',
        groupId: null,
        content: '<p></p>',
        scenes: [
          scene(
            'Leaving the Ashes',
            'Aria and Corvan set out for Vael Keep; first hints of the Order of the Unlit Flame.',
            'idea',
            '<p>They left before dawn, when the ash still glowed in the ruts of the road. Corvan spoke little, but when he did, it was of Vael Keep, of the Order of the Unlit Flame, and of debts that outlive the people who owe them.</p>'
          ),
        ],
      },
    ],
    codex: [
      {
        id: uid(), type: 'character', name: 'Aria Thorne', aliases: ['Aria'],
        oneLiner: 'A farm girl who inherits a dangerous relic and a more dangerous destiny.',
        description: 'Nineteen, stubborn, sharp-eyed. Grew up in Thornfield tending her late mother’s orchard. Distrusts authority, keeps promises to a fault. Carries the hollow crown ring on a cord around her neck.',
        notes: 'Arc: from survivor to reluctant claimant of the crown. Her flaw is that she confuses self-reliance with safety.',
        color: '#e05c5c', tags: ['protagonist', 'pov'],
      },
      {
        id: uid(), type: 'character', name: 'Corvan', aliases: ['the Crow Knight'],
        oneLiner: 'A disgraced knight-errant bound to protect the ring’s bearer.',
        description: 'Former blade of the Order of the Unlit Flame, now sworn against it. Travels with a tame crow named Sooth. Dry humor, old scars, older guilt.',
        notes: 'Knows more about the ring than he admits. Reveal his oath-brand in Chapter 4.',
        color: '#5b83d6', tags: ['deuteragonist'],
      },
      {
        id: uid(), type: 'location', name: 'Thornfield', aliases: [],
        oneLiner: 'Aria’s home village, burned in the opening chapter.',
        description: 'A wheat-farming village in the southern hollows. Known for its stone well, said to never run dry. Destroyed by riders of the Order searching for the sigil ring.',
        notes: '', color: '#e08d3c', tags: ['destroyed'],
      },
      {
        id: uid(), type: 'location', name: 'Vael Keep', aliases: [],
        oneLiner: 'A half-ruined fortress in the north where answers wait.',
        description: 'Seat of the old kings before the Sundering. Its archives supposedly hold the record of the crown’s unmaking.',
        notes: 'Destination of Act I.', color: '#4ba0a8', tags: [],
      },
      {
        id: uid(), type: 'item', name: 'The Hollow Crown', aliases: ['the sigil ring', 'the ring'],
        oneLiner: 'A blackened silver ring bearing the sigil of a jewelless crown.',
        description: 'The last remnant of the royal regalia, unmade during the Sundering. Whoever bears it can hear the dead kings arguing — faintly, and only at night.',
        notes: 'Rules: it cannot be given away, only taken or inherited. It grows warm near oath-breakers.',
        color: '#d4b13f', tags: ['macguffin', 'magic'],
      },
      {
        id: uid(), type: 'organization', name: 'Order of the Unlit Flame', aliases: ['the Order'],
        oneLiner: 'A militant brotherhood hunting the regalia to keep the throne empty.',
        description: 'Founded after the Sundering on the belief that no monarch should ever rule again. Their zeal has curdled into terror; they burn what they cannot claim.',
        notes: 'Antagonist faction. Their leader believes he is preventing a prophesied tyrant.',
        color: '#8a6ede', tags: ['antagonists'],
      },
      {
        id: uid(), type: 'lore', name: 'The Sundering', aliases: [],
        oneLiner: 'The cataclysm that ended the royal line eighty years ago.',
        description: 'When the last king tried to bind the realm’s magic to his bloodline, the working failed and shattered both. The crown was unmade into fragments; the ring is one of them.',
        notes: '', color: '#8d8d94', tags: ['history'],
      },
    ],
    timeline: seedTimeline(),
    settings: { theme: 'dark' },
  }
}

const withSeedRelationships = (s) => ({ ...s, relationships: seedRelationships(s.codex) })

/* ---------- library (multi-novel persistence) ---------- */

export const LIB_KEY = 'calliope.library.v1'
const LEGACY_KEY = 'calliope.novel.v1'
export const novelKey = (id) => `calliope.novel.${id}`

// A new novel's only mandatory unit is the chapter — Acts above it and
// Scenes below it are both optional, so it starts as a single flow-mode
// chapter (write directly, split into scenes later if you want them).
export const blankState = (title = 'Untitled Novel', author = '', theme = 'dark') => ({
  novel: { title, author, wordGoal: 0 },
  groups: [],
  chapters: [
    { id: uid(), title: 'Chapter 1', groupId: null, content: '<p></p>', scenes: [] },
  ],
  codex: [],
  relationships: [],
  timeline: { unit: 'Year', tracks: [{ id: uid(), title: 'Story' }], items: [] },
  settings: { theme },
})

// Fills in defaults for saves/imports made before groups and flow-mode
// chapters existed, so nothing older ever needs a real migration step.
const ensureHierarchyDefaults = (data) => {
  if (!Array.isArray(data.groups)) data.groups = []
  for (const c of data.chapters || []) {
    if (c.groupId === undefined) c.groupId = null
    if (c.content === undefined) c.content = '<p></p>'
    if (!Array.isArray(c.scenes)) c.scenes = []
    // Scenes are archived for now — fold any existing scene content into the
    // chapter's own flow content (same divider the "scene break" toolbar
    // button inserts) so nothing already written is lost, then clear the
    // scenes array so the chapter renders as flow-mode from here on.
    if (c.scenes.length) {
      const merged = c.scenes.map((s) => s.content || '<p></p>').join('<hr>')
      c.content = c.content && c.content !== '<p></p>' ? `${c.content}<hr>${merged}` : merged
      c.scenes = []
    }
  }
  // Assigns a shared `order` to any act/chapter that doesn't have one yet —
  // preserves the old "acts, then chapters" display order at each level so
  // upgrading an existing manuscript never visually reshuffles it. Anything
  // created after this point (drag-and-drop, +Act/+Chapter) gets its order
  // assigned directly by the reducer instead.
  const parentIds = [null, ...data.groups.map((g) => g.id)]
  for (const pid of parentIds) {
    let i = 0
    for (const g of data.groups.filter((g) => (g.parentId ?? null) === pid)) {
      if (g.order === undefined) g.order = i
      i++
    }
    for (const c of (data.chapters || []).filter((c) => (c.groupId ?? null) === pid)) {
      if (c.order === undefined) c.order = i
      i++
    }
  }
  return data
}

export const libMeta = (id, data, prev = {}) => ({
  createdAt: prev.createdAt || Date.now(),
  ...prev,
  id,
  title: data?.novel?.title || 'Untitled Novel',
  author: data?.novel?.author || '',
  words: novelWords(data?.chapters || []),
  chapters: (data?.chapters || []).length,
  scenes: (data?.chapters || []).reduce((n, c) => n + c.scenes.length, 0),
  updatedAt: Date.now(),
})

export const saveLibrary = (lib) => {
  try { localStorage.setItem(LIB_KEY, JSON.stringify(lib)) } catch (e) { console.warn(e) }
}

export const loadLibrary = () => {
  try {
    const raw = localStorage.getItem(LIB_KEY)
    if (raw) {
      const lib = JSON.parse(raw)
      if (lib && Array.isArray(lib.novels)) return lib
    }
  } catch (e) { console.warn(e) }

  const lib = { novels: [], currentId: null, theme: 'dark' }
  try {
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      // migrate the single pre-library novel into its own slot
      const data = JSON.parse(legacy)
      const id = uid()
      localStorage.setItem(novelKey(id), legacy)
      localStorage.removeItem(LEGACY_KEY)
      lib.novels.push(libMeta(id, data))
      lib.currentId = id
      lib.theme = data?.settings?.theme || 'dark'
    } else {
      // first launch: seed the sample novel
      const id = uid()
      const st = withSeedRelationships(seedState())
      localStorage.setItem(novelKey(id), JSON.stringify(st))
      lib.novels.push(libMeta(id, st))
      lib.currentId = id
    }
  } catch (e) { console.warn(e) }
  saveLibrary(lib)
  return lib
}

export const updateLibraryEntry = (id, data) => {
  const lib = loadLibrary()
  const i = lib.novels.findIndex((n) => n.id === id)
  if (i === -1) return
  lib.novels[i] = libMeta(id, data, lib.novels[i])
  if (data?.settings?.theme) lib.theme = data.settings.theme
  saveLibrary(lib)
}

export const createNovel = (data = null) => {
  const lib = loadLibrary()
  const id = uid()
  const st = data || blankState('Untitled Novel', '', lib.theme)
  localStorage.setItem(novelKey(id), JSON.stringify(st))
  lib.novels.push(libMeta(id, st))
  saveLibrary(lib)
  return id
}

export const duplicateNovel = (id) => {
  const raw = localStorage.getItem(novelKey(id))
  if (!raw) return null
  try {
    const data = JSON.parse(raw)
    data.novel = { ...data.novel, title: `${data.novel?.title || 'Untitled'} (copy)` }
    return createNovel(data)
  } catch { return null }
}

export const deleteNovel = (id) => {
  const lib = loadLibrary()
  lib.novels = lib.novels.filter((n) => n.id !== id)
  if (lib.currentId === id) lib.currentId = null
  localStorage.removeItem(novelKey(id))
  saveLibrary(lib)
}

export const normalizeNovelData = (parsed) => {
  // accepts a raw state object or the export wrapper
  const data = parsed?.format === 'calliope-novel' ? parsed.data : parsed
  if (!data || !Array.isArray(data.chapters) || !Array.isArray(data.codex)) return null
  if (!data.timeline) data.timeline = seedTimeline()
  if (!data.relationships) data.relationships = []
  if (!data.settings) data.settings = { theme: 'dark' }
  if (!data.novel) data.novel = { title: 'Imported Novel', author: '', wordGoal: 0 }
  return ensureHierarchyDefaults(data)
}

const loadState = (novelId) => {
  try {
    const raw = localStorage.getItem(novelKey(novelId))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.chapters && parsed.codex) {
        if (!parsed.timeline) parsed.timeline = seedTimeline()
        if (!parsed.relationships) parsed.relationships = seedRelationships(parsed.codex)
        return ensureHierarchyDefaults(parsed)
      }
    }
  } catch (e) {
    console.warn('Failed to load saved state', e)
  }
  return blankState()
}

/* ---------- reducer ---------- */

function reducer(state, action) {
  switch (action.type) {
    case 'novel/update':
      return { ...state, novel: { ...state.novel, ...action.patch } }

    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } }

    case 'chapter/add': {
      const parentId = action.groupId ?? null
      const ch = {
        id: action.id || uid(),
        title: action.title || `Chapter ${state.chapters.length + 1}`,
        groupId: parentId,
        order: siblingsAt(state.chapters, state.groups || [], parentId).length,
        content: '<p></p>',
        scenes: [],
      }
      // reuses the same "just created, jump to it" side-channel as scene/add
      return { ...state, chapters: [...state.chapters, ch], _newSceneId: ch.id }
    }
    case 'chapter/update':
      return {
        ...state,
        chapters: state.chapters.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)),
      }
    case 'chapter/delete':
      return { ...state, chapters: state.chapters.filter((c) => c.id !== action.id) }
    // Moves a chapter one step within its *unified* sibling order (acts and
    // chapters interleaved) — so moving up/down can now step past an act,
    // not just other chapters.
    case 'chapter/move': {
      const chapters = state.chapters.map((c) => ({ ...c }))
      const groups = (state.groups || []).map((g) => ({ ...g }))
      const c0 = chapters.find((c) => c.id === action.id)
      if (!c0) return state
      const list = siblingsAt(chapters, groups, c0.groupId ?? null)
      const idx = list.findIndex((x) => x.kind === 'chapter' && x.id === action.id)
      const to = idx + action.dir
      if (idx === -1 || to < 0 || to >= list.length) return state
      const rec = (x) => (x.kind === 'group' ? groups.find((g) => g.id === x.id) : chapters.find((c) => c.id === x.id))
      const ra = rec(list[idx]), rb = rec(list[to])
      ;[ra.order, rb.order] = [rb.order, ra.order]
      return { ...state, chapters, groups }
    }
    // Converts a flow-mode chapter (no scenes, written directly) into its
    // first scene, so switching to scene-mode never loses what's written.
    case 'chapter/splitToScenes':
      return {
        ...state,
        chapters: state.chapters.map((c) => {
          if (c.id !== action.id || (c.scenes && c.scenes.length)) return c
          const sc = { id: action.newSceneId || uid(), title: 'Scene 1', summary: '', status: 'draft', content: c.content || '<p></p>' }
          return { ...c, scenes: [sc], content: '<p></p>' }
        }),
      }

    // ---- groups (default UI label "Act" — a flat, self-referential grouping
    // layer above chapters; each group can optionally have a parent group,
    // so nesting further, e.g. Parts within an Act, is still possible) ----
    case 'group/add': {
      const parentId = action.parentId ?? null
      const g = {
        id: action.id || uid(),
        title: action.title || 'New Act',
        parentId,
        order: siblingsAt(state.chapters, state.groups || [], parentId).length,
      }
      return { ...state, groups: [...(state.groups || []), g] }
    }
    case 'group/update':
      return {
        ...state,
        groups: (state.groups || []).map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)),
      }
    case 'group/delete': {
      const groups = state.groups || []
      const target = groups.find((g) => g.id === action.id)
      const parentId = target ? target.parentId : null
      return {
        ...state,
        // reparent instead of cascading — nothing inside a deleted group is ever destroyed
        groups: groups.filter((g) => g.id !== action.id).map((g) => (g.parentId === action.id ? { ...g, parentId } : g)),
        chapters: state.chapters.map((c) => (c.groupId === action.id ? { ...c, groupId: parentId } : c)),
      }
    }
    // Moves an act one step within its *unified* sibling order (acts and
    // chapters interleaved) — mirrors chapter/move.
    case 'group/move': {
      const groups = (state.groups || []).map((g) => ({ ...g }))
      const chapters = state.chapters.map((c) => ({ ...c }))
      const g0 = groups.find((g) => g.id === action.id)
      if (!g0) return state
      const list = siblingsAt(chapters, groups, g0.parentId ?? null)
      const idx = list.findIndex((x) => x.kind === 'group' && x.id === action.id)
      const to = idx + action.dir
      if (idx === -1 || to < 0 || to >= list.length) return state
      const rec = (x) => (x.kind === 'group' ? groups.find((g) => g.id === x.id) : chapters.find((c) => c.id === x.id))
      const ra = rec(list[idx]), rb = rec(list[to])
      ;[ra.order, rb.order] = [rb.order, ra.order]
      return { ...state, groups, chapters }
    }
    // Drag-and-drop reorder/reparent for both acts and chapters, unified.
    // action: { id, kind: 'chapter'|'group', parentId (target, null = root),
    //           beforeId (id of the sibling to land before, or null = append) }
    case 'tree/reorder': {
      const { id, kind, beforeId } = action
      const newParentId = action.parentId ?? null
      const groups = (state.groups || []).map((g) => ({ ...g }))
      const chapters = state.chapters.map((c) => ({ ...c }))
      const moved = kind === 'group' ? groups.find((g) => g.id === id) : chapters.find((c) => c.id === id)
      if (!moved) return state

      // an act can never become its own descendant
      if (kind === 'group') {
        let p = newParentId
        while (p) {
          if (p === id) return state
          p = groups.find((g) => g.id === p)?.parentId ?? null
        }
      }

      const oldParentId = kind === 'group' ? (moved.parentId ?? null) : (moved.groupId ?? null)
      if (kind === 'group') moved.parentId = newParentId
      else moved.groupId = newParentId

      const renumber = (pid) => {
        const list = siblingsAt(chapters, groups, pid).filter((x) => x.id !== id)
        if (pid === newParentId) {
          const at = beforeId ? list.findIndex((x) => x.id === beforeId) : -1
          list.splice(at === -1 ? list.length : at, 0, { id, kind })
        }
        list.forEach((x, i) => {
          const rec = x.kind === 'group' ? groups.find((g) => g.id === x.id) : chapters.find((c) => c.id === x.id)
          if (rec) rec.order = i
        })
      }
      renumber(newParentId)
      if (oldParentId !== newParentId) renumber(oldParentId)

      return { ...state, groups, chapters }
    }

    case 'scene/add': {
      const chapter = state.chapters.find((c) => c.id === action.chapterId)
      const sc = {
        id: uid(),
        title: action.title || `Scene ${(chapter?.scenes.length || 0) + 1}`,
        summary: '',
        status: 'idea',
        content: '<p></p>',
      }
      return {
        ...state,
        chapters: state.chapters.map((c) =>
          c.id === action.chapterId ? { ...c, scenes: [...c.scenes, sc] } : c
        ),
        _newSceneId: sc.id,
      }
    }
    case 'scene/update':
      return {
        ...state,
        chapters: state.chapters.map((c) => ({
          ...c,
          scenes: c.scenes.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)),
        })),
      }
    case 'scene/delete':
      return {
        ...state,
        chapters: state.chapters.map((c) => ({
          ...c,
          scenes: c.scenes.filter((s) => s.id !== action.id),
        })),
      }
    case 'scene/move': {
      const chapters = state.chapters.map((c) => ({ ...c, scenes: [...c.scenes] }))
      const ch = chapters.find((c) => c.scenes.some((s) => s.id === action.id))
      if (!ch) return state
      const idx = ch.scenes.findIndex((s) => s.id === action.id)
      const to = idx + action.dir
      if (to < 0 || to >= ch.scenes.length) return state
      const [s] = ch.scenes.splice(idx, 1)
      ch.scenes.splice(to, 0, s)
      return { ...state, chapters }
    }

    case 'codex/add': {
      const entry = {
        id: action.id || uid(),
        type: action.entryType || 'character',
        name: action.name || 'New Entry',
        aliases: [],
        oneLiner: '',
        description: '',
        notes: '',
        color: CODEX_COLORS[state.codex.length % CODEX_COLORS.length],
        tags: [],
      }
      return { ...state, codex: [...state.codex, entry] }
    }
    case 'codex/update':
      return {
        ...state,
        codex: state.codex.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)),
      }
    case 'codex/delete':
      return {
        ...state,
        codex: state.codex.filter((e) => e.id !== action.id),
        relationships: (state.relationships || []).filter((r) => r.fromId !== action.id && r.toId !== action.id),
      }

    case 'rel/add':
      return { ...state, relationships: [...(state.relationships || []), action.rel] }
    case 'rel/update':
      return {
        ...state,
        relationships: (state.relationships || []).map((r) => (r.id === action.id ? { ...r, ...action.patch } : r)),
      }
    case 'rel/delete':
      return { ...state, relationships: (state.relationships || []).filter((r) => r.id !== action.id) }

    case 'timeline/update':
      return { ...state, timeline: { ...state.timeline, ...action.patch } }
    case 'timeline/track/add': {
      const track = { id: action.id || uid(), title: action.title || `Track ${state.timeline.tracks.length + 1}` }
      return { ...state, timeline: { ...state.timeline, tracks: [...state.timeline.tracks, track] } }
    }
    case 'timeline/track/update':
      return {
        ...state,
        timeline: {
          ...state.timeline,
          tracks: state.timeline.tracks.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)),
        },
      }
    case 'timeline/track/move': {
      const tracks = [...state.timeline.tracks]
      const idx = tracks.findIndex((t) => t.id === action.id)
      const to = idx + action.dir
      if (idx < 0 || to < 0 || to >= tracks.length) return state
      const [t] = tracks.splice(idx, 1)
      tracks.splice(to, 0, t)
      return { ...state, timeline: { ...state.timeline, tracks } }
    }
    case 'timeline/track/delete':
      return {
        ...state,
        timeline: {
          ...state.timeline,
          tracks: state.timeline.tracks.filter((t) => t.id !== action.id),
          items: state.timeline.items.filter((i) => i.trackId !== action.id),
        },
      }
    case 'timeline/item/add':
      return { ...state, timeline: { ...state.timeline, items: [...state.timeline.items, action.item] } }
    case 'timeline/item/update':
      return {
        ...state,
        timeline: {
          ...state.timeline,
          items: state.timeline.items.map((i) => (i.id === action.id ? { ...i, ...action.patch } : i)),
        },
      }
    case 'timeline/item/delete':
      return { ...state, timeline: { ...state.timeline, items: state.timeline.items.filter((i) => i.id !== action.id) } }

    case 'state/replace':
      return action.state

    default:
      return state
  }
}

/* ---------- context ---------- */

const StoreContext = createContext(null)

export function StoreProvider({ novelId, children }) {
  const [state, dispatch] = useReducer(reducer, novelId, loadState)
  const saveTimer = useRef(null)

  useEffect(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try {
        const { _newSceneId, ...toSave } = state
        localStorage.setItem(novelKey(novelId), JSON.stringify(toSave))
        updateLibraryEntry(novelId, toSave)
      } catch (e) {
        console.warn('Failed to save', e)
      }
    }, 400)
    return () => clearTimeout(saveTimer.current)
  }, [state, novelId])

  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>
}

export const useStore = () => useContext(StoreContext)

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

/* ---------- shared codex filtering/sorting ---------- */

// Same filter+sort logic used by every codex layout (cards, navigator list) so
// switching views never changes which entries show up for a given search.
export function useCodexEntries(codex, typeFilter, query) {
  return useMemo(() => {
    let list = codex
    if (typeFilter !== 'all') list = list.filter((e) => e.type === typeFilter)
    const q = (query || '').trim().toLowerCase()
    if (q) {
      list = list.filter((e) =>
        [e.name, e.oneLiner, e.description, e.notes, ...(e.aliases || []), ...(e.tags || [])]
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [codex, typeFilter, query])
}
