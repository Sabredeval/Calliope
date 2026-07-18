import React, { useState, useRef, useEffect } from 'react'
import { useStore, uid, sceneWords, chapterWords, groupWords, SCENE_STATUSES, SCENES_ENABLED } from '../store.jsx'

// Small monochrome line-icons, inspired by Scrivener's binder (folder =
// container, page = document) but kept muted/single-tone to match the rest
// of the app's decluttered look rather than Scrivener's full color set.
function Chevron({ open }) {
  return (
    <svg className={`chevron ${open ? 'open' : ''}`} viewBox="0 0 16 16" width="9" height="9" aria-hidden="true">
      <path d="M5 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg className="tree-icon folder" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path
        d="M1.5 4.2a1 1 0 0 1 1-1h3.3l1.3 1.4h6.4a1 1 0 0 1 1 1v6.7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"
        fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
      />
    </svg>
  )
}

function DocIcon() {
  return (
    <svg className="tree-icon doc" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="M3.5 1.6h5.7l3.3 3.3v9.1a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-11.4a1 1 0 0 1 1-1z"
        fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
      />
      <path d="M9.1 1.6v3.3h3.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

function InlineRename({ value, onSave, onCancel }) {
  const [v, setV] = useState(value)
  return (
    <input
      className="inline-rename"
      value={v}
      autoFocus
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onSave(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSave(v)
        if (e.key === 'Escape') onCancel()
      }}
      onClick={(e) => e.stopPropagation()}
    />
  )
}


export default function ManuscriptSidebar({ selectedSceneId, onSelectScene }) {
  const { state, dispatch } = useStore()
  const [renaming, setRenaming] = useState(null) // {kind:'chapter'|'scene'|'group', id}
  const [collapsed, setCollapsed] = useState({})
  const [outline, setOutline] = useState(false)
  const [drag, setDrag] = useState(null) // { id, kind: 'chapter'|'group' } — item currently being dragged
  const [dropHint, setDropHint] = useState(null) // { id, kind, pos: 'before'|'after'|'inside' }
  const rowRefs = useRef(new Map())
  const expandTimer = useRef(null)

  const groups = state.groups || []
  const statusColor = (id) => SCENE_STATUSES.find((s) => s.id === id)?.color || 'transparent'
  const confirmDelete = (msg) => window.confirm(msg)

  const childGroups = (parentId) => groups.filter((g) => (g.parentId ?? null) === (parentId ?? null))
  const chaptersOf = (groupId) => state.chapters.filter((c) => (c.groupId ?? null) === (groupId ?? null))

  // Acts and chapters interleaved, Scrivener-binder style — the single
  // source of truth for "what's next to what" at a given level, used for
  // both rendering order and drag-and-drop position math.
  const orderedChildren = (parentId) => {
    const gs = childGroups(parentId).map((g) => ({ kind: 'group', item: g }))
    const cs = chaptersOf(parentId).map((c) => ({ kind: 'chapter', item: c }))
    return [...gs, ...cs].sort((a, b) => (a.item.order ?? 0) - (b.item.order ?? 0))
  }

  const isDescendantGroup = (ancestorId, groupId) => {
    let p = groupId
    while (p) {
      if (p === ancestorId) return true
      p = groups.find((g) => g.id === p)?.parentId ?? null
    }
    return false
  }

  const clearDrag = () => {
    setDrag(null)
    setDropHint(null)
    clearTimeout(expandTimer.current?.t)
    expandTimer.current = null
  }

  // Hovering a collapsed act mid-drag for a moment opens it, so you can drop
  // something inside without having to expand it by hand first.
  const scheduleAutoExpand = (groupId) => {
    if (expandTimer.current?.id === groupId) return
    clearTimeout(expandTimer.current?.t)
    const t = setTimeout(() => setCollapsed((c) => ({ ...c, [groupId]: false })), 550)
    expandTimer.current = { id: groupId, t }
  }

  const resolveDrop = (targetKind, targetItem, pos) => {
    if (pos === 'inside') return { parentId: targetItem.id, beforeId: null }
    const parentId = targetKind === 'group' ? (targetItem.parentId ?? null) : (targetItem.groupId ?? null)
    const list = orderedChildren(parentId).filter((x) => x.item.id !== drag.id)
    const idx = list.findIndex((x) => x.item.id === targetItem.id)
    if (pos === 'before') return { parentId, beforeId: targetItem.id }
    const next = list[idx + 1]
    return { parentId, beforeId: next ? next.item.id : null }
  }

  // Spread onto a chapter-row or group-row to make it a drag source and a
  // drop target in one go — top/bottom thirds of the row mean "before"/
  // "after" it, the middle third of an act row means "nest inside it".
  const dragHandlers = (kind, item) => ({
    draggable: true,
    onDragStart: (e) => {
      e.stopPropagation()
      setDrag({ id: item.id, kind })
      e.dataTransfer.effectAllowed = 'move'
      try { e.dataTransfer.setData('text/plain', item.id) } catch { /* noop */ }
    },
    onDragEnd: () => clearDrag(),
    onDragOver: (e) => {
      if (!drag || drag.id === item.id) return
      if (kind === 'group' && drag.kind === 'group' && isDescendantGroup(drag.id, item.id)) return
      e.preventDefault()
      e.stopPropagation()
      const rect = e.currentTarget.getBoundingClientRect()
      const frac = (e.clientY - rect.top) / rect.height
      let pos = frac < 0.3 ? 'before' : frac > 0.7 ? 'after' : 'inside'
      if (pos === 'inside' && kind !== 'group') pos = frac < 0.5 ? 'before' : 'after'
      setDropHint({ id: item.id, kind, pos })
      if (pos === 'inside' && kind === 'group' && collapsed[item.id]) scheduleAutoExpand(item.id)
    },
    onDrop: (e) => {
      if (!drag || drag.id === item.id) { clearDrag(); return }
      e.preventDefault()
      e.stopPropagation()
      const pos = dropHint?.id === item.id ? dropHint.pos : 'after'
      const { parentId, beforeId } = resolveDrop(kind, item, pos)
      dispatch({ type: 'tree/reorder', id: drag.id, kind: drag.kind, parentId, beforeId })
      clearDrag()
    },
  })
  const dropClass = (kind, id) => {
    const cls = [drag?.id === id ? 'dragging' : '']
    if (dropHint?.id === id && dropHint.kind === kind) cls.push(`drop-${dropHint.pos}`)
    return cls.filter(Boolean).join(' ')
  }

  const allCollapsed =
    (state.chapters.length > 0 || groups.length > 0) &&
    state.chapters.every((c) => collapsed[c.id]) &&
    groups.every((g) => collapsed[g.id])
  const toggleAll = () => {
    const next = {}
    for (const c of state.chapters) next[c.id] = !allCollapsed
    for (const g of groups) next[g.id] = !allCollapsed
    setCollapsed(next)
  }

  /* keep the active scene (or active flow-chapter) visible in the nav */
  useEffect(() => {
    const el = rowRefs.current.get(selectedSceneId)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selectedSceneId])

  /* auto-expand the chapter (and every ancestor act) containing the active item */
  useEffect(() => {
    const ch = state.chapters.find((c) => c.id === selectedSceneId || c.scenes.some((s) => s.id === selectedSceneId))
    if (!ch) return
    const toOpen = new Set()
    if (collapsed[ch.id]) toOpen.add(ch.id)
    let gid = ch.groupId
    while (gid) {
      if (collapsed[gid]) toOpen.add(gid)
      gid = groups.find((g) => g.id === gid)?.parentId ?? null
    }
    if (toOpen.size) setCollapsed((c) => { const next = { ...c }; for (const id of toOpen) next[id] = false; return next })
  }, [selectedSceneId]) // eslint-disable-line

  const renderChapter = (ch) => {
    const list = orderedChildren(ch.groupId ?? null)
    const idx = list.findIndex((x) => x.kind === 'chapter' && x.id === ch.id)
    const isFlow = ch.scenes.length === 0
    const isSelected = isFlow && ch.id === selectedSceneId
    const expanded = isFlow ? true : !collapsed[ch.id]

    return (
      <div className="chapter-block" key={ch.id}>
        <div
          className={`chapter-row ${isSelected ? 'selected' : ''} ${dropClass('chapter', ch.id)}`}
          ref={(el) => { if (el) rowRefs.current.set(ch.id, el); else rowRefs.current.delete(ch.id) }}
          onClick={() => { if (isFlow) onSelectScene(ch.id) }}
          style={isFlow ? { cursor: 'pointer' } : undefined}
          {...dragHandlers('chapter', ch)}
        >
          {isFlow ? (
            <span className="collapse-btn placeholder" aria-hidden="true" />
          ) : (
            <button
              className="collapse-btn"
              onClick={(e) => { e.stopPropagation(); setCollapsed((c) => ({ ...c, [ch.id]: !c[ch.id] })) }}
              title={expanded ? 'Collapse' : 'Expand'}
            >
              <Chevron open={expanded} />
            </button>
          )}

          {isFlow ? <DocIcon /> : <FolderIcon />}

          {renaming?.kind === 'chapter' && renaming.id === ch.id ? (
            <InlineRename
              value={ch.title}
              onSave={(v) => { dispatch({ type: 'chapter/update', id: ch.id, patch: { title: v || ch.title } }); setRenaming(null) }}
              onCancel={() => setRenaming(null)}
            />
          ) : (
            <span
              className="chapter-title"
              onDoubleClick={(e) => { e.stopPropagation(); setRenaming({ kind: 'chapter', id: ch.id }) }}
              title="Double-click to rename"
            >
              {ch.title}
            </span>
          )}

          <span className="chapter-words">{chapterWords(ch).toLocaleString()}</span>

          <div className="row-actions">
            <button className="mini-icon" title="Move up" disabled={idx === 0} onClick={(e) => { e.stopPropagation(); dispatch({ type: 'chapter/move', id: ch.id, dir: -1 }) }}>↑</button>
            <button className="mini-icon" title="Move down" disabled={idx === list.length - 1} onClick={(e) => { e.stopPropagation(); dispatch({ type: 'chapter/move', id: ch.id, dir: 1 }) }}>↓</button>
            <button className="mini-icon" title="Rename" onClick={(e) => { e.stopPropagation(); setRenaming({ kind: 'chapter', id: ch.id }) }}>✎</button>
            <button
              className="mini-icon danger"
              title="Delete chapter"
              onClick={(e) => {
                e.stopPropagation()
                if (confirmDelete(`Delete "${ch.title}"${ch.scenes.length ? ` and its ${ch.scenes.length} scene(s)` : ''}? This cannot be undone.`))
                  dispatch({ type: 'chapter/delete', id: ch.id })
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {expanded && (
          <div className="scene-list">
            {ch.scenes.map((sc, si) => (
              <div
                key={sc.id}
                ref={(el) => { if (el) rowRefs.current.set(sc.id, el); else rowRefs.current.delete(sc.id) }}
                className={`scene-row ${sc.id === selectedSceneId ? 'selected' : ''} ${outline ? 'outline' : ''}`}
                onClick={() => onSelectScene(sc.id)}
              >
                <DocIcon />
                <span className="status-dot" style={{ background: statusColor(sc.status) }} title={SCENE_STATUSES.find((s) => s.id === sc.status)?.label} />

                <div className="scene-cell">
                  {renaming?.kind === 'scene' && renaming.id === sc.id ? (
                    <InlineRename
                      value={sc.title}
                      onSave={(v) => { dispatch({ type: 'scene/update', id: sc.id, patch: { title: v || sc.title } }); setRenaming(null) }}
                      onCancel={() => setRenaming(null)}
                    />
                  ) : (
                    <span className="scene-title" onDoubleClick={(e) => { e.stopPropagation(); setRenaming({ kind: 'scene', id: sc.id }) }}>
                      {sc.title}
                    </span>
                  )}
                  {outline && sc.summary && <span className="scene-outline">{sc.summary}</span>}
                </div>

                <span className="scene-words">{sceneWords(sc).toLocaleString()}</span>

                <div className="row-actions">
                  <button className="mini-icon" title="Move up" disabled={si === 0} onClick={(e) => { e.stopPropagation(); dispatch({ type: 'scene/move', id: sc.id, dir: -1 }) }}>↑</button>
                  <button className="mini-icon" title="Move down" disabled={si === ch.scenes.length - 1} onClick={(e) => { e.stopPropagation(); dispatch({ type: 'scene/move', id: sc.id, dir: 1 }) }}>↓</button>
                  <button
                    className="mini-icon danger"
                    title="Delete scene"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirmDelete(`Delete scene "${sc.title}"? This cannot be undone.`))
                        dispatch({ type: 'scene/delete', id: sc.id })
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}

            {SCENES_ENABLED && (
              <button
                className="add-scene-btn"
                onClick={() => {
                  if (isFlow) {
                    const newId = uid()
                    dispatch({ type: 'chapter/splitToScenes', id: ch.id, newSceneId: newId })
                    onSelectScene(newId)
                  } else {
                    dispatch({ type: 'scene/add', chapterId: ch.id })
                  }
                }}
              >
                {isFlow ? 'Split into scenes' : '+ Add scene'}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderGroup = (g, depth) => {
    const list = orderedChildren(g.parentId ?? null)
    const idx = list.findIndex((x) => x.kind === 'group' && x.id === g.id)
    const words = groupWords(g.id, state.chapters, groups)
    const hasContent = childGroups(g.id).length > 0 || chaptersOf(g.id).length > 0
    const expanded = hasContent ? !collapsed[g.id] : true

    return (
      <div className="group-block" key={g.id} style={{ '--depth': depth }}>
        <div className={`group-row ${dropClass('group', g.id)}`} {...dragHandlers('group', g)}>
          {hasContent ? (
            <button
              className="collapse-btn"
              onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
              title={expanded ? 'Collapse' : 'Expand'}
            >
              <Chevron open={expanded} />
            </button>
          ) : (
            <span className="collapse-btn placeholder" aria-hidden="true" />
          )}

          <FolderIcon />

          {renaming?.kind === 'group' && renaming.id === g.id ? (
            <InlineRename
              value={g.title}
              onSave={(v) => { dispatch({ type: 'group/update', id: g.id, patch: { title: v || g.title } }); setRenaming(null) }}
              onCancel={() => setRenaming(null)}
            />
          ) : (
            <span className="group-title" onDoubleClick={() => setRenaming({ kind: 'group', id: g.id })} title="Double-click to rename">
              {g.title}
            </span>
          )}

          <span className="chapter-words">{words.toLocaleString()}</span>

          <div className="row-actions">
            <button className="mini-icon" title="Move up" disabled={idx === 0} onClick={() => dispatch({ type: 'group/move', id: g.id, dir: -1 })}>↑</button>
            <button className="mini-icon" title="Move down" disabled={idx === list.length - 1} onClick={() => dispatch({ type: 'group/move', id: g.id, dir: 1 })}>↓</button>
            <button className="mini-icon" title="Rename" onClick={() => setRenaming({ kind: 'group', id: g.id })}>✎</button>
            <button
              className="mini-icon danger"
              title="Delete act"
              onClick={() => {
                if (confirmDelete(`Delete "${g.title}"? Its chapters and any nested acts move up a level — nothing inside it is deleted.`))
                  dispatch({ type: 'group/delete', id: g.id })
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {expanded && (
          <div className="group-children">
            {renderChildren(g.id, depth + 1)}
            <div className="group-add-row">
              <button className="mini-btn" onClick={() => dispatch({ type: 'group/add', parentId: g.id, title: 'New Act' })}>+ Act</button>
              <button className="mini-btn" onClick={() => dispatch({ type: 'chapter/add', groupId: g.id })}>+ Chapter</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderChildren = (parentId, depth) =>
    orderedChildren(parentId).map(({ kind, item }) =>
      kind === 'group' ? renderGroup(item, depth) : renderChapter(item)
    )

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Manuscript</span>
        <span className="sidebar-tools">
          <button
            className={`mini-icon ${outline ? 'toggled' : ''}`}
            title={outline ? 'Hide scene summaries' : 'Show scene summaries (outline)'}
            onClick={() => setOutline((v) => !v)}
          >
            ☰
          </button>
          <button
            className="mini-icon"
            title={allCollapsed ? 'Expand all' : 'Collapse all'}
            onClick={toggleAll}
          >
            {allCollapsed ? '⊞' : '⊟'}
          </button>
          <button className="mini-btn" title="Add a top-level act (optional)" onClick={() => dispatch({ type: 'group/add', parentId: null, title: 'New Act' })}>
            + Act
          </button>
          <button className="mini-btn" title="Add chapter" onClick={() => dispatch({ type: 'chapter/add' })}>
            + Chapter
          </button>
        </span>
      </div>

      <div className="sidebar-scroll">
        {state.chapters.length === 0 && groups.length === 0 && (
          <p className="sidebar-hint">No chapters yet. Add one to begin.</p>
        )}

        {renderChildren(null, 0)}

        {drag && (
          <div
            className={`root-drop-zone ${dropHint?.id === '__root__' ? 'drop-after' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDropHint({ id: '__root__', kind: 'root', pos: 'after' }) }}
            onDrop={(e) => {
              e.preventDefault()
              dispatch({ type: 'tree/reorder', id: drag.id, kind: drag.kind, parentId: null, beforeId: null })
              clearDrag()
            }}
            title="Drop here to move to the top level"
          />
        )}
      </div>
    </aside>
  )
}
