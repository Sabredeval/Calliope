import React from 'react'
import { CODEX_TYPES } from '../../store.jsx'
import { HL_COLORS } from './editorUtils.js'

export function HighlightPopover({ dispatch, highlights, hlPop, setHlPop }) {
  if (!hlPop) return null
  const highlight = highlights.find((entry) => entry.id === hlPop.id)
  if (!highlight) return null

  return (
    <div
      className="hl-pop"
      style={{
        left: Math.max(12, Math.min(hlPop.x, window.innerWidth - 320)),
        top: hlPop.above ? hlPop.y - 8 : hlPop.y + 8,
        transform: hlPop.above ? 'translateY(-100%)' : undefined,
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="hl-pop-head">
        {HL_COLORS.map((color) => <button key={color} className={`color-dot ${highlight.color === color ? 'selected' : ''}`} style={{ background: color }} onClick={() => dispatch({ type: 'hl/update', id: highlight.id, patch: { color } })} />)}
        <span className="foot-spacer" />
        <button className="mini-icon danger" title="Delete highlight" onClick={() => { dispatch({ type: 'hl/delete', id: highlight.id }); setHlPop(null) }}>✕</button>
        <button className="mini-icon" title="Close" onClick={() => setHlPop(null)}>—</button>
      </div>
      <textarea className="hl-comment" rows={3} autoFocus placeholder="Comment…" value={highlight.comment || ''} onChange={(event) => dispatch({ type: 'hl/update', id: highlight.id, patch: { comment: event.target.value } })} />
    </div>
  )
}

export function CodexSelectionPopover({ addHighlight, existingEntry, onOpenCodexEntry, quickAdd, selPop, setSelPop }) {
  if (!selPop) return null
  return (
    <div className="sel-popover" style={{ left: selPop.x, top: selPop.y }} onMouseDown={(event) => event.preventDefault()}>
      {selPop.mode === 'highlight' ? (
        <button className="sel-highlight" onClick={addHighlight}>
          <span className="sel-highlight-mark" aria-hidden="true" />
          <span className="sel-highlight-copy">
            <strong>Highlight selection</strong>
            <small>{selPop.wordCount.toLocaleString()} {selPop.wordCount === 1 ? 'word' : 'words'}</small>
          </span>
        </button>
      ) : existingEntry ? (
        <button className="sel-open" onClick={() => { setSelPop(null); onOpenCodexEntry(existingEntry.id) }}>
          <span className="mention-swatch" style={{ background: existingEntry.color }} />
          {CODEX_TYPES.find((type) => type.id === existingEntry.type)?.icon} {existingEntry.name} — open in codex
        </button>
      ) : (
        <>
          <span className="sel-label">Add “{selPop.text}” as</span>
          {CODEX_TYPES.map((type) => <button key={type.id} className="sel-type" title={type.label} onClick={() => quickAdd(type.id)}>{type.icon}</button>)}
        </>
      )}
    </div>
  )
}

export function CodexHoverCard({ cancelHoverHide, hoverCard, onOpenCodexEntry, scheduleHoverHide, setHoverCard, state }) {
  if (!hoverCard) return null
  const entry = hoverCard.entry
  const type = CODEX_TYPES.find((item) => item.id === entry.type)
  const relationshipCount = (state.relationships || []).filter((relationship) => relationship.fromId === entry.id || relationship.toId === entry.id).length
  return (
    <div
      className="codex-hovercard"
      style={{
        left: Math.max(12, Math.min(hoverCard.x, window.innerWidth - 340)),
        top: hoverCard.above ? hoverCard.y - 8 : hoverCard.y + 8,
        transform: hoverCard.above ? 'translateY(-100%)' : undefined,
        '--hc-accent': entry.color,
      }}
      onMouseEnter={cancelHoverHide}
      onMouseLeave={() => scheduleHoverHide(250)}
    >
      <div className="hc-head"><span className="hc-icon">{type?.icon}</span><span className="hc-name">{entry.name}</span><span className="hc-type">{type?.label}</span></div>
      {entry.aliases?.length > 0 && <p className="hc-aliases">also: {entry.aliases.join(', ')}</p>}
      {entry.oneLiner && <p className="hc-lede">{entry.oneLiner}</p>}
      {entry.description && <p className="hc-desc">{entry.description}</p>}
      <div className="hc-foot">
        {relationshipCount > 0 && <span className="hc-rels">{relationshipCount} relationship{relationshipCount === 1 ? '' : 's'}</span>}
        <span className="foot-spacer" />
        <button onClick={() => { setHoverCard(null); onOpenCodexEntry(entry.id) }}>Open in codex →</button>
      </div>
    </div>
  )
}

export function CodexToast({ onOpenCodexEntry, setToast, toast }) {
  if (!toast) return null
  return (
    <div className="sel-toast">
      <span>{toast.icon} “{toast.name}” added to codex</span>
      <button onClick={() => { setToast(null); onOpenCodexEntry(toast.id) }}>Edit entry →</button>
      <button className="toast-x" onClick={() => setToast(null)}>✕</button>
    </div>
  )
}
