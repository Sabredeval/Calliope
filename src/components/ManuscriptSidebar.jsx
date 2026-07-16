import React, { useState, useRef, useEffect } from 'react'
import { useStore, sceneWords, chapterWords, SCENE_STATUSES } from '../store.jsx'

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
  const [renaming, setRenaming] = useState(null) // {kind:'chapter'|'scene', id}
  const [collapsed, setCollapsed] = useState({})
  const [outline, setOutline] = useState(false)
  const rowRefs = useRef(new Map())

  const statusColor = (id) => SCENE_STATUSES.find((s) => s.id === id)?.color || 'transparent'
  const confirmDelete = (msg) => window.confirm(msg)

  const allCollapsed = state.chapters.length > 0 && state.chapters.every((c) => collapsed[c.id])
  const toggleAll = () => {
    const next = {}
    for (const c of state.chapters) next[c.id] = !allCollapsed
    setCollapsed(next)
  }

  /* keep the active scene visible in the nav */
  useEffect(() => {
    const el = rowRefs.current.get(selectedSceneId)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selectedSceneId])

  /* auto-expand the chapter containing the active scene */
  useEffect(() => {
    const ch = state.chapters.find((c) => c.scenes.some((s) => s.id === selectedSceneId))
    if (ch && collapsed[ch.id]) setCollapsed((c) => ({ ...c, [ch.id]: false }))
  }, [selectedSceneId]) // eslint-disable-line

  const doneStats = (ch) => {
    const done = ch.scenes.filter((s) => s.status === 'done').length
    return ch.scenes.length ? `${done}/${ch.scenes.length} done` : 'empty'
  }

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
            title={allCollapsed ? 'Expand all chapters' : 'Collapse all chapters'}
            onClick={toggleAll}
          >
            {allCollapsed ? '⊞' : '⊟'}
          </button>
          <button className="mini-btn" title="Add chapter" onClick={() => dispatch({ type: 'chapter/add' })}>
            + Chapter
          </button>
        </span>
      </div>

      <div className="sidebar-scroll">
        {state.chapters.length === 0 && (
          <p className="sidebar-hint">No chapters yet. Add one to begin.</p>
        )}

        {state.chapters.map((ch, ci) => (
          <div className="chapter-block" key={ch.id}>
            <div className="chapter-row">
              <button
                className="collapse-btn"
                onClick={() => setCollapsed((c) => ({ ...c, [ch.id]: !c[ch.id] }))}
                title={collapsed[ch.id] ? 'Expand' : 'Collapse'}
              >
                {collapsed[ch.id] ? '▸' : '▾'}
              </button>

              <span className="chapter-num">{ci + 1}</span>

              {renaming?.kind === 'chapter' && renaming.id === ch.id ? (
                <InlineRename
                  value={ch.title}
                  onSave={(v) => { dispatch({ type: 'chapter/update', id: ch.id, patch: { title: v || ch.title } }); setRenaming(null) }}
                  onCancel={() => setRenaming(null)}
                />
              ) : (
                <span
                  className="chapter-title"
                  onDoubleClick={() => setRenaming({ kind: 'chapter', id: ch.id })}
                  title="Double-click to rename"
                >
                  {ch.title}
                </span>
              )}

              <span className="chapter-words">{chapterWords(ch).toLocaleString()}</span>

              <div className="row-actions">
                <button className="mini-icon" title="Move up" disabled={ci === 0} onClick={() => dispatch({ type: 'chapter/move', id: ch.id, dir: -1 })}>↑</button>
                <button className="mini-icon" title="Move down" disabled={ci === state.chapters.length - 1} onClick={() => dispatch({ type: 'chapter/move', id: ch.id, dir: 1 })}>↓</button>
                <button className="mini-icon" title="Rename" onClick={() => setRenaming({ kind: 'chapter', id: ch.id })}>✎</button>
                <button
                  className="mini-icon danger"
                  title="Delete chapter"
                  onClick={() => {
                    if (confirmDelete(`Delete "${ch.title}" and its ${ch.scenes.length} scene(s)? This cannot be undone.`))
                      dispatch({ type: 'chapter/delete', id: ch.id })
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* chapter pulse: one dot per scene, colored by status */}
            {ch.scenes.length > 0 && (
              <div className="chapter-pulse" title={doneStats(ch)}>
                {ch.scenes.map((sc) => (
                  <button
                    key={sc.id}
                    className={`pulse-dot ${sc.id === selectedSceneId ? 'current' : ''}`}
                    style={{ background: statusColor(sc.status) }}
                    title={`${sc.title} — ${SCENE_STATUSES.find((s) => s.id === sc.status)?.label}`}
                    onClick={() => onSelectScene(sc.id)}
                  />
                ))}
                <span className="pulse-stats">{doneStats(ch)}</span>
              </div>
            )}

            {!collapsed[ch.id] && (
              <div className="scene-list">
                {ch.scenes.map((sc, si) => (
                  <div
                    key={sc.id}
                    ref={(el) => { if (el) rowRefs.current.set(sc.id, el); else rowRefs.current.delete(sc.id) }}
                    className={`scene-row ${sc.id === selectedSceneId ? 'selected' : ''} ${outline ? 'outline' : ''}`}
                    onClick={() => onSelectScene(sc.id)}
                  >
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
                          {si + 1}. {sc.title}
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

                <button className="add-scene-btn" onClick={() => dispatch({ type: 'scene/add', chapterId: ch.id })}>
                  + Add scene
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}
