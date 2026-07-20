import React, { useState } from 'react'
import { useStore } from '../../store.jsx'
import {
  RelationshipsSection, EntryTypeColorFields, EntryOverviewEdit, EntryOverviewRead,
  EntryNotesEdit, EntryNotesRead, typeMetaOf,
} from './CodexShared.jsx'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'appearances', label: 'Appearances' },
  { id: 'notes', label: 'Notes' },
]

// Full-width, tabbed detail view paired with CodexNavigator. Opens to a
// clean read view — same read/edit split as CodexDetail in Gallery mode —
// so glancing at an entry never looks like a form waiting to be filled in.
// Hit Edit to switch the whole article into editable fields.
export default function CodexArticle({ entry, onSelectEntry, onDeleted, mentions, onOpenScene }) {
  const { dispatch } = useStore()
  const [tab, setTab] = useState('overview')
  // fresh entries open ready to fill in; established ones open to read
  const [editing, setEditing] = useState(!entry.oneLiner && !entry.description)
  const typeMeta = typeMetaOf(entry.type)
  const patch = (p) => dispatch({ type: 'codex/update', id: entry.id, patch: p })

  const del = () => {
    if (window.confirm(`Delete "${entry.name}" from the codex? This cannot be undone.`)) {
      dispatch({ type: 'codex/delete', id: entry.id })
      onDeleted?.()
    }
  }

  return (
    <article className="codex-article" key={entry.id}>
      {editing ? (
        <div className="article-head">
          <span className="detail-swatch" style={{ background: entry.color }} />
          <input
            className="detail-name"
            value={entry.name}
            placeholder="Name"
            onChange={(e) => patch({ name: e.target.value })}
          />
          <span className="article-type">{typeMeta?.icon} {typeMeta?.label}</span>
          <button className="mini-btn" title="Done editing" onClick={() => setEditing(false)}>Done</button>
          <button className="danger-btn article-delete" onClick={del}>Delete</button>
        </div>
      ) : (
        <div className="detail-hero" style={{ '--hero': entry.color }}>
          <div className="hero-top">
            <span className="hero-type">{typeMeta?.icon} {typeMeta?.label}</span>
            <button className="mini-btn" onClick={() => setEditing(true)}>✎ Edit</button>
          </div>
          <h2 className="hero-name">{entry.name}</h2>
          {entry.aliases?.length > 0 && (
            <p className="hero-aliases">also known as {entry.aliases.join(' · ')}</p>
          )}
        </div>
      )}

      <div className="codex-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`codex-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'appearances' && mentions.length > 0 && <span className="count">{mentions.length}</span>}
          </button>
        ))}
      </div>

      <div className="codex-tab-pane">
        {tab === 'overview' && (
          editing ? (
            <>
              <div className="article-type-row">
                <EntryTypeColorFields entry={entry} patch={patch} />
              </div>
              <EntryOverviewEdit entry={entry} patch={patch} />
            </>
          ) : (
            <EntryOverviewRead entry={entry} />
          )
        )}

        {tab === 'relationships' && (
          <RelationshipsSection entry={entry} onSelectEntry={onSelectEntry} readOnly={!editing} />
        )}

        {tab === 'appearances' && (
          mentions.length === 0 ? (
            <p className="read-empty">Not mentioned in any scene yet — add it to a scene's prose, or use its name/alias in your manuscript.</p>
          ) : (
            <div className="appearance-list">
              {mentions.map((m) => (
                <button key={m.locationId} className="appearance-row" onClick={() => onOpenScene(m.locationId)}>
                  <span className="appearance-scene">{m.sceneTitle}</span>
                  <span className="appearance-chapter">{m.chapterTitle || 'chapter'}</span>
                  <span className="mention-count">{m.count} mention{m.count === 1 ? '' : 's'}</span>
                </button>
              ))}
            </div>
          )
        )}

        {tab === 'notes' && (
          editing ? <EntryNotesEdit entry={entry} patch={patch} /> : <EntryNotesRead entry={entry} />
        )}
      </div>
    </article>
  )
}
