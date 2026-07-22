import { CODEX_COLORS, uid } from './model.js'
import { siblingsAt } from './selectors.js'

/* ---------- reducer ---------- */

export function reducer(state, action) {
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

    case 'hl/add':
      return { ...state, highlights: [...(state.highlights || []), action.hl] }
    case 'hl/update':
      return {
        ...state,
        highlights: (state.highlights || []).map((h) => (h.id === action.id ? { ...h, ...action.patch } : h)),
      }
    case 'hl/delete':
      return { ...state, highlights: (state.highlights || []).filter((h) => h.id !== action.id) }

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

