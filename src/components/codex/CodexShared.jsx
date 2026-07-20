import React, { useState } from 'react'
import { useStore, CODEX_TYPES, CODEX_COLORS, uid } from '../../store.jsx'

/* Building blocks shared by both codex layouts — the card-grid + narrow
   detail panel (CodexDetail, in CodexView.jsx) and the list navigator +
   full-width article (CodexNavigator / CodexArticle). Keeping the field
   markup here means editing a codex entry looks and behaves identically
   no matter which layout you're browsing in. */

export function TagInput({ values, onChange, placeholder }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setDraft('')
  }
  return (
    <div className="tag-input">
      {values.map((t) => (
        <span className="tag-chip" key={t}>
          {t}
          <button onClick={() => onChange(values.filter((x) => x !== t))} title="Remove">×</button>
        </span>
      ))}
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
          if (e.key === 'Backspace' && !draft && values.length) onChange(values.slice(0, -1))
        }}
        onBlur={add}
      />
    </div>
  )
}

export function RelationshipsSection({ entry, onSelectEntry, readOnly = false }) {
  const { state, dispatch } = useStore()
  const rels = (state.relationships || []).filter((r) => r.fromId === entry.id || r.toId === entry.id)
  const [targetId, setTargetId] = useState('')
  const [label, setLabel] = useState('')

  const others = state.codex.filter((e) => e.id !== entry.id)
  const nameOf = (id) => state.codex.find((e) => e.id === id)?.name || '?'

  const add = () => {
    if (!targetId) return
    dispatch({
      type: 'rel/add',
      rel: { id: uid(), fromId: entry.id, toId: targetId, label: label.trim() || 'related to', directed: true },
    })
    setTargetId('')
    setLabel('')
  }

  return (
    <div className="field">
      <span className="field-label">Relationships</span>
      {rels.length === 0 && <p className="rel-empty">No connections yet.</p>}
      <div className="rel-list">
        {rels.map((r) => {
          const outgoing = r.fromId === entry.id
          const otherId = outgoing ? r.toId : r.fromId
          return (
            <div key={r.id} className="rel-row">
              <span className="rel-dir" title={r.directed ? (outgoing ? 'outgoing' : 'incoming') : 'mutual'}>
                {r.directed ? (outgoing ? '→' : '←') : '—'}
              </span>
              <button className="rel-name" onClick={() => onSelectEntry(otherId)} title="Open entry">
                {nameOf(otherId)}
              </button>
              <span className="rel-label">{r.label}</span>
              {!readOnly && (
                <button className="mini-icon danger" title="Remove relationship" onClick={() => dispatch({ type: 'rel/delete', id: r.id })}>✕</button>
              )}
            </div>
          )
        })}
      </div>
      {!readOnly && (
        <div className="rel-add">
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Connect to…</option>
            {others.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <input
            value={label}
            placeholder="label (e.g. mentor of)"
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          />
          <button className="mini-btn" onClick={add} disabled={!targetId}>Add</button>
        </div>
      )}
    </div>
  )
}

export function EntryTypeColorFields({ entry, patch }) {
  return (
    <>
      <label className="field">
        <span className="field-label">Type</span>
        <select value={entry.type} onChange={(e) => patch({ type: e.target.value })}>
          {CODEX_TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">Color</span>
        <div className="color-row">
          {CODEX_COLORS.map((c) => (
            <button
              key={c}
              className={`color-dot ${entry.color === c ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => patch({ color: c })}
              title={c}
            />
          ))}
        </div>
      </label>
    </>
  )
}

export function EntryOverviewEdit({ entry, patch }) {
  return (
    <>
      <label className="field">
        <span className="field-label">One-liner</span>
        <input
          value={entry.oneLiner}
          placeholder="A single sentence that captures this entry"
          onChange={(e) => patch({ oneLiner: e.target.value })}
        />
      </label>

      <label className="field">
        <span className="field-label">Aliases <em>(also detected in scenes)</em></span>
        <TagInput
          values={entry.aliases || []}
          onChange={(aliases) => patch({ aliases })}
          placeholder="Add alias, press Enter"
        />
      </label>

      <label className="field">
        <span className="field-label">Description</span>
        <textarea
          rows={6}
          value={entry.description}
          placeholder="Who or what is this? Appearance, history, personality, significance…"
          onChange={(e) => patch({ description: e.target.value })}
        />
      </label>

      <label className="field">
        <span className="field-label">Tags</span>
        <TagInput
          values={entry.tags || []}
          onChange={(tags) => patch({ tags })}
          placeholder="Add tag, press Enter"
        />
      </label>
    </>
  )
}

export function EntryOverviewRead({ entry }) {
  return (
    <>
      {entry.oneLiner && <p className="read-lede">{entry.oneLiner}</p>}

      {entry.description ? (
        entry.description.split(/\n+/).map((p, i) => <p key={i} className="read-para">{p}</p>)
      ) : (
        <p className="read-empty">No description yet — hit Edit to write one.</p>
      )}

      {entry.tags?.length > 0 && (
        <div className="card-tags read-tags">
          {entry.tags.map((t) => <span key={t} className="tag-chip small">{t}</span>)}
        </div>
      )}
    </>
  )
}

export function EntryNotesEdit({ entry, patch }) {
  return (
    <label className="field">
      <span className="field-label">Private notes</span>
      <textarea
        rows={4}
        value={entry.notes}
        placeholder="Spoilers, plans, secrets — things only you should know."
        onChange={(e) => patch({ notes: e.target.value })}
      />
    </label>
  )
}

export function EntryNotesRead({ entry }) {
  if (!entry.notes) return <p className="read-empty">No private notes.</p>
  return (
    <div className="read-notes">
      <span className="read-notes-label">🔒 Private notes</span>
      {entry.notes.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}
    </div>
  )
}

export function typeMetaOf(type) {
  return CODEX_TYPES.find((t) => t.id === type)
}
