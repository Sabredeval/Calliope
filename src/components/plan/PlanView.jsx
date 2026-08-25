import React, { useState, useEffect } from 'react'
import { X, LayoutGrid, BarChart3, Users } from 'lucide-react'
import { useStore, chapterWords, groupWords, SCENE_STATUSES } from '../../store.jsx'
import PacingChart from './PacingChart.jsx'
import CastChart from './CastChart.jsx'

const statusOf = (id) => SCENE_STATUSES.find((s) => s.id === id) || SCENE_STATUSES[0]

function ThreadPicker({ ch, threads, dispatch, onClose }) {
  useEffect(() => {
    window.addEventListener('click', onClose)
    return () => window.removeEventListener('click', onClose)
  }, [onClose])

  return (
    <div className="plan-thread-picker" onMouseDown={(e) => e.stopPropagation()}>
      {threads.length === 0 && <p className="plan-thread-picker-empty">No threads yet — add one from the toolbar.</p>}
      {threads.map((t) => {
        const active = (ch.threadIds || []).includes(t.id)
        return (
          <button
            key={t.id}
            className={`plan-thread-option ${active ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'chapter/toggleThread', id: ch.id, threadId: t.id })}
          >
            <span className="thread-dot" style={{ background: t.color }} />
            {t.title}
            {active && <span className="plan-thread-check">✓</span>}
          </button>
        )
      })}
      <button className="plan-thread-done" onClick={onClose}>Done</button>
    </div>
  )
}

function PlanCard({ ch, threads, activeThreadId, dragHandlers, dropClass, onOpen, dispatch }) {
  const [editingSummary, setEditingSummary] = useState(false)
  const [pickingThreads, setPickingThreads] = useState(false)
  const status = statusOf(ch.status)
  const chapterThreads = threads.filter((t) => (ch.threadIds || []).includes(t.id))
  const dimmed = activeThreadId && !(ch.threadIds || []).includes(activeThreadId)

  return (
    <div className={`plan-card ${dropClass(ch.id)} ${dimmed ? 'dimmed' : ''}`} style={{ '--card-accent': status.color }} {...dragHandlers(ch)}>
      <div className="plan-card-top">
        <button
          className="plan-card-status"
          title={status.label}
          onClick={(e) => {
            e.stopPropagation()
            const idx = SCENE_STATUSES.findIndex((s) => s.id === ch.status)
            const next = SCENE_STATUSES[(idx + 1) % SCENE_STATUSES.length]
            dispatch({ type: 'chapter/update', id: ch.id, patch: { status: next.id } })
          }}
        >
          <span className="status-dot" style={{ background: status.color }} />
          {status.label}
        </button>
        <span className="plan-card-words">{chapterWords(ch).toLocaleString()}w</span>
      </div>

      <h4 className="plan-card-title" onClick={() => onOpen(ch.id)} title="Open in Write">{ch.title}</h4>

      {editingSummary ? (
        <textarea
          className="plan-card-summary-edit"
          autoFocus
          rows={4}
          defaultValue={ch.summary}
          placeholder="What happens in this chapter?"
          onBlur={(e) => { dispatch({ type: 'chapter/update', id: ch.id, patch: { summary: e.target.value } }); setEditingSummary(false) }}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditingSummary(false) }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <p
          className={`plan-card-summary ${ch.summary ? '' : 'empty'}`}
          onClick={(e) => { e.stopPropagation(); setEditingSummary(true) }}
          title="Click to edit synopsis"
        >
          {ch.summary || 'Click to add a synopsis…'}
        </p>
      )}

      <div className="plan-card-threads" onClick={(e) => { e.stopPropagation(); setPickingThreads(true) }}>
        {chapterThreads.length === 0 ? (
          <span className="plan-card-threads-empty">+ Threads</span>
        ) : (
          chapterThreads.map((t) => (
            <span key={t.id} className="thread-chip" style={{ '--thread-color': t.color }}>{t.title}</span>
          ))
        )}
      </div>
      {pickingThreads && <ThreadPicker ch={ch} threads={threads} dispatch={dispatch} onClose={() => setPickingThreads(false)} />}
    </div>
  )
}

function PlanColumn({ title, groupId, chapters, groups, threads, activeThreadId, dispatch, drag, setDrag, dropHint, setDropHint, onOpen }) {
  const words = groups ? groupWords(groupId, chapters, groups) : chapters.filter((c) => (c.groupId ?? null) === (groupId ?? null)).reduce((n, c) => n + chapterWords(c), 0)
  const list = chapters
    .filter((c) => (c.groupId ?? null) === (groupId ?? null))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const clearDrag = () => { setDrag(null); setDropHint(null) }

  const dragHandlers = (ch) => ({
    draggable: true,
    onDragStart: (e) => {
      e.stopPropagation()
      setDrag(ch.id)
      e.dataTransfer.effectAllowed = 'move'
      try { e.dataTransfer.setData('text/plain', ch.id) } catch { /* noop */ }
    },
    onDragEnd: clearDrag,
    onDragOver: (e) => {
      if (!drag || drag === ch.id) return
      e.preventDefault()
      e.stopPropagation()
      const rect = e.currentTarget.getBoundingClientRect()
      const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
      setDropHint({ id: ch.id, pos })
    },
    onDrop: (e) => {
      if (!drag) return
      e.preventDefault()
      e.stopPropagation()
      const pos = dropHint?.id === ch.id ? dropHint.pos : 'after'
      const siblings = list.filter((c) => c.id !== drag)
      const idx = siblings.findIndex((c) => c.id === ch.id)
      const beforeId = pos === 'before' ? ch.id : (siblings[idx + 1]?.id ?? null)
      dispatch({ type: 'tree/reorder', id: drag, kind: 'chapter', parentId: groupId, beforeId })
      clearDrag()
    },
  })

  const dropClass = (id) => {
    const cls = [drag === id ? 'dragging' : '']
    if (dropHint?.id === id) cls.push(`drop-${dropHint.pos}`)
    return cls.filter(Boolean).join(' ')
  }

  return (
    <div
      className="plan-column"
      onDragOver={(e) => { if (drag) e.preventDefault() }}
      onDrop={(e) => {
        if (!drag) return
        e.preventDefault()
        // dropped on empty column space (past the last card) -> append at end
        if (!dropHint || dropHint.id === drag) {
          dispatch({ type: 'tree/reorder', id: drag, kind: 'chapter', parentId: groupId, beforeId: null })
        }
        clearDrag()
      }}
    >
      <div className="plan-column-head">
        <h3>{title}</h3>
        <span className="plan-column-meta">{list.length} {list.length === 1 ? 'chapter' : 'chapters'} · {words.toLocaleString()}w</span>
      </div>

      <div className="plan-column-cards">
        {list.map((ch) => (
          <PlanCard key={ch.id} ch={ch} threads={threads} activeThreadId={activeThreadId} dragHandlers={dragHandlers} dropClass={dropClass} onOpen={onOpen} dispatch={dispatch} />
        ))}

        <button
          className="plan-add-card"
          onClick={() => dispatch({ type: 'chapter/add', groupId })}
        >
          + New chapter
        </button>
      </div>
    </div>
  )
}

function ThreadLegend({ threads, activeThreadId, setActiveThreadId, dispatch }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const addThread = () => {
    const title = draft.trim()
    if (title) dispatch({ type: 'thread/add', title })
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="plan-thread-legend">
      {threads.map((t) => (
        <span key={t.id} className={`thread-chip legend ${activeThreadId === t.id ? 'active' : ''}`} style={{ '--thread-color': t.color }}>
          <button className="thread-chip-label" onClick={() => setActiveThreadId(activeThreadId === t.id ? null : t.id)} title={`Highlight "${t.title}"`}>
            {t.title}
          </button>
          <button
            className="thread-chip-remove"
            title="Delete thread"
            onClick={() => { if (window.confirm(`Delete thread "${t.title}"? It will be removed from every chapter.`)) dispatch({ type: 'thread/delete', id: t.id }) }}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          className="plan-thread-add-input"
          autoFocus
          value={draft}
          placeholder="Thread name…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addThread(); if (e.key === 'Escape') { setDraft(''); setAdding(false) } }}
          onBlur={addThread}
        />
      ) : (
        <button className="ghost-btn slim" onClick={() => setAdding(true)}>+ Thread</button>
      )}
    </div>
  )
}

export default function PlanView({ onOpenScene, onOpenCodexEntry }) {
  const { state, dispatch } = useStore()
  const [drag, setDrag] = useState(null)
  const [dropHint, setDropHint] = useState(null)
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [mode, setMode] = useState('board') // 'board' | 'pacing' | 'cast'

  const groups = state.groups || []
  const chapters = state.chapters
  const threads = state.threads || []

  // Only top-level acts get their own column for v1 — nested acts fold into
  // their parent's column via groupWords, matching how the sidebar already
  // treats deep nesting as an edge case rather than the common path.
  const topGroups = groups
    .filter((g) => !g.parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const columnProps = { chapters, groups, threads, activeThreadId, dispatch, drag, setDrag, dropHint, setDropHint, onOpen: onOpenScene }

  return (
    <div className="plan-wrap">
      <div className="plan-toolbar">
        <h2>Plan</h2>
        <span className="plan-toolbar-hint">{chapters.length} chapters across {topGroups.length || 1} {topGroups.length === 1 ? 'act' : 'acts'}</span>
        {mode === 'board' && <ThreadLegend threads={threads} activeThreadId={activeThreadId} setActiveThreadId={setActiveThreadId} dispatch={dispatch} />}
        <span className="toolbar-spacer" />
        <div className="plan-mode-toggle" aria-label="Plan view">
          <button className={mode === 'board' ? 'active' : ''} title="Corkboard" aria-pressed={mode === 'board'} onClick={() => setMode('board')}><LayoutGrid size={14} /></button>
          <button className={mode === 'pacing' ? 'active' : ''} title="Pacing" aria-pressed={mode === 'pacing'} onClick={() => setMode('pacing')}><BarChart3 size={14} /></button>
          <button className={mode === 'cast' ? 'active' : ''} title="Cast presence" aria-pressed={mode === 'cast'} onClick={() => setMode('cast')}><Users size={14} /></button>
        </div>
        {mode === 'board' && (
          <button className="ghost-btn" onClick={() => dispatch({ type: 'group/add', title: `Act ${topGroups.length + 1}` })}>+ New act</button>
        )}
      </div>

      {mode === 'board' ? (
        <div className="plan-board">
          {topGroups.map((g) => (
            <PlanColumn key={g.id} title={g.title} groupId={g.id} {...columnProps} />
          ))}
          <PlanColumn title={topGroups.length ? 'Unassigned' : 'Manuscript'} groupId={null} {...columnProps} />
        </div>
      ) : mode === 'pacing' ? (
        <PacingChart state={state} />
      ) : (
        <CastChart state={state} onOpenScene={onOpenScene} onOpenCodexEntry={onOpenCodexEntry} />
      )}
    </div>
  )
}
