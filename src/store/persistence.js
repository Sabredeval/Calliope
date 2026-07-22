import { novelWords, seedRelationships, seedState, seedTimeline, uid, withSeedRelationships } from './model.js'

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

export const loadState = (novelId) => {
  try {
    const raw = localStorage.getItem(novelKey(novelId))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.chapters && parsed.codex) {
        if (!parsed.timeline) parsed.timeline = seedTimeline()
        if (!parsed.relationships) parsed.relationships = seedRelationships(parsed.codex)
        if (!parsed.highlights) {
          // migrate old bookmarks: they become highlights, name → comment
          parsed.highlights = (parsed.bookmarks || [])
            .filter((b) => b.quote)
            .map((b) => ({
              id: b.id,
              sceneId: b.sceneId,
              quote: b.quote,
              comment: b.name || '',
              color: '#f5d76e',
              createdAt: b.createdAt,
            }))
        }
        delete parsed.bookmarks
        return ensureHierarchyDefaults(parsed)
      }
    }
  } catch (e) {
    console.warn('Failed to load saved state', e)
  }
  return blankState()
}

