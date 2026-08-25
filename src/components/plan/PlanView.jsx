import React, { useState } from 'react'
import { useStore, chapterWords, groupWords, SCENE_STATUSES } from '../../store.jsx'

const statusOf = (id) => SCENE_STATUSES.find((s) => s.id === id) || SCENE_STATUSES[0]

function PlanCard({ ch, dragHandlers, dropClass, onOpen, dispatch }) {
  const [editingSummary, setEditingSummary] = useState(false)
  const status = statusOf(ch.status)

  return (
    <div className={`plan-card ${dropClass(ch.id)}`} style={{ '--card-accent': status.color }} {...dragHandlers(ch)}>
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
    </div>
  )
}

function PlanColumn({ title, groupId, chapters, groups, dispatch, drag, setDrag, dropHint, setDropHint, onOpen }) {
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
          <PlanCard key={ch.id} ch={ch} dragHandlers={dragHandlers} dropClass={dropClass} onOpen={onOpen} dispatch={dispatch} />
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

export default function PlanView({ onOpenScene }) {
  const { state, dispatch } = useStore()
  const [drag, setDrag] = useState(null)
  const [dropHint, setDropHint] = useState(null)

  const groups = state.groups || []
  const chapters = state.chapters

  // Only top-level acts get their own column for v1 — nested acts fold into
  // their parent's column via groupWords, matching how the sidebar already
  // treats deep nesting as an edge case rather than the common path.
  const topGroups = groups
    .filter((g) => !g.parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const columnProps = { chapters, groups, dispatch, drag, setDrag, dropHint, setDropHint, onOpen: onOpenScene }

  return (
    <div className="plan-wrap">
      <div className="plan-toolbar">
        <h2>Plan</h2>
        <span className="plan-toolbar-hint">{chapters.length} chapters across {topGroups.length || 1} {topGroups.length === 1 ? 'act' : 'acts'}</span>
        <span className="toolbar-spacer" />
        <button className="ghost-btn" onClick={() => dispatch({ type: 'group/add', title: `Act ${topGroups.length + 1}` })}>+ New act</button>
      </div>

      <div className="plan-board">
        {topGroups.map((g) => (
          <PlanColumn key={g.id} title={g.title} groupId={g.id} {...columnProps} />
        ))}
        <PlanColumn title={topGroups.length ? 'Unassigned' : 'Manuscript'} groupId={null} {...columnProps} />
      </div>
    </div>
  )
}
