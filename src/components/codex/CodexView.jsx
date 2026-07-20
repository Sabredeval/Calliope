import React, { useState, useMemo } from 'react'
import { useStore, CODEX_TYPES, uid, useCodexEntries, mentionsByEntry } from '../../store.jsx'
import RelationGraph from './RelationGraph.jsx'
import CodexNavigator from './CodexNavigator.jsx'
import CodexArticle from './CodexArticle.jsx'
import {
  RelationshipsSection, EntryTypeColorFields, EntryOverviewEdit, EntryOverviewRead,
  EntryNotesEdit, EntryNotesRead, typeMetaOf,
} from './CodexShared.jsx'

function CodexDetail({ entry, onClose, onSelectEntry }) {
  const { dispatch } = useStore()
  const patch = (p) => dispatch({ type: 'codex/update', id: entry.id, patch: p })
  // fresh entries open ready to fill in; established ones open as a wiki article
  const [editing, setEditing] = useState(!entry.oneLiner && !entry.description)
  const typeMeta = typeMetaOf(entry.type)

  if (!editing) {
    return (
      <aside className="codex-detail">
        <div className="detail-hero" style={{ '--hero': entry.color }}>
          <div className="hero-top">
            <span className="hero-type">{typeMeta?.icon} {typeMeta?.label}</span>
            <span className="hero-actions">
              <button className="mini-btn" onClick={() => setEditing(true)}>✎ Edit</button>
              <button className="icon-btn" title="Close" onClick={onClose}>✕</button>
            </span>
          </div>
          <h2 className="hero-name">{entry.name}</h2>
          {entry.aliases?.length > 0 && (
            <p className="hero-aliases">also known as {entry.aliases.join(' · ')}</p>
          )}
        </div>

        <div className="detail-read">
          <EntryOverviewRead entry={entry} />
          <EntryNotesRead entry={entry} />
          <RelationshipsSection entry={entry} onSelectEntry={onSelectEntry} readOnly />
        </div>
      </aside>
    )
  }

  return (
    <aside className="codex-detail">
      <div className="detail-head">
        <span className="detail-swatch" style={{ background: entry.color }} />
        <input
          className="detail-name"
          value={entry.name}
          placeholder="Name"
          onChange={(e) => patch({ name: e.target.value })}
        />
        <button className="mini-btn" title="Done editing" onClick={() => setEditing(false)}>Done</button>
        <button className="icon-btn" title="Close" onClick={onClose}>✕</button>
      </div>

      <div className="detail-body">
        <EntryTypeColorFields entry={entry} patch={patch} />
        <EntryOverviewEdit entry={entry} patch={patch} />
        <EntryNotesEdit entry={entry} patch={patch} />
        <RelationshipsSection entry={entry} onSelectEntry={onSelectEntry} />

        <button
          className="danger-btn"
          onClick={() => {
            if (window.confirm(`Delete "${entry.name}" from the codex? This cannot be undone.`)) {
              dispatch({ type: 'codex/delete', id: entry.id })
              onClose()
            }
          }}
        >
          Delete entry
        </button>
      </div>
    </aside>
  )
}

export default function CodexView({ selectedId, onSelect, onOpenScene }) {
  const { state, dispatch } = useStore()
  const [typeFilter, setTypeFilter] = useState('all')
  const [query, setQuery] = useState('')

  // persisted per-novel so the layout choice survives reload, same mechanism as theme
  const layout = state.settings.codexLayout || 'gallery' // 'gallery' | 'navigator' | 'graph'
  const setLayout = (v) => dispatch({ type: 'settings/update', patch: { codexLayout: v } })

  const galleryEntries = useCodexEntries(state.codex, typeFilter, query)
  const mentionsMap = useMemo(() => mentionsByEntry(state.chapters, state.codex), [state.chapters, state.codex])

  const selected = state.codex.find((e) => e.id === selectedId)

  const counts = useMemo(() => {
    const m = { all: state.codex.length }
    for (const t of CODEX_TYPES) m[t.id] = state.codex.filter((e) => e.type === t.id).length
    return m
  }, [state.codex])

  const addEntry = () => {
    const id = uid()
    dispatch({ type: 'codex/add', id, entryType: typeFilter === 'all' ? 'character' : typeFilter })
    onSelect(id)
  }

  return (
    <div className="codex-wrap">
      <div className="codex-main">
        <div className="codex-toolbar">
          <div className="mode-toggle">
            <button className={layout === 'gallery' ? 'active' : ''} onClick={() => setLayout('gallery')} title="Card gallery">▦ Gallery</button>
            <button className={layout === 'navigator' ? 'active' : ''} onClick={() => setLayout('navigator')} title="List navigator">☰ Navigator</button>
            <button className={layout === 'graph' ? 'active' : ''} onClick={() => setLayout('graph')} title="Relationship graph">🕸 Relations</button>
          </div>
          {layout === 'gallery' && (
            <div className="codex-filters">
              <button className={typeFilter === 'all' ? 'active' : ''} onClick={() => setTypeFilter('all')}>
                All <span className="count">{counts.all}</span>
              </button>
              {CODEX_TYPES.map((t) => (
                <button key={t.id} className={typeFilter === t.id ? 'active' : ''} onClick={() => setTypeFilter(t.id)}>
                  {t.icon} {t.plural} <span className="count">{counts[t.id]}</span>
                </button>
              ))}
            </div>
          )}
          {layout === 'graph' && (
            <span className="graph-toolbar-hint">
              {(state.relationships || []).length} relationships between {state.codex.length} entries
            </span>
          )}
          {layout === 'navigator' && <div className="codex-filters" />}
          <input
            className="codex-search"
            placeholder={layout === 'graph' ? 'Highlight in graph…' : 'Filter codex…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="primary-btn" onClick={addEntry}>+ New entry</button>
        </div>

        {layout === 'graph' && <RelationGraph selectedId={selectedId} onSelect={onSelect} query={query} />}

        {layout === 'gallery' && (
          galleryEntries.length === 0 ? (
            <div className="codex-empty">
              <h3>Nothing here yet</h3>
              <p>
                The codex is your story bible — characters, locations, items, lore, and organizations.
                Entries you create are automatically detected when their names appear in your scenes.
              </p>
              <button className="primary-btn" onClick={addEntry}>Create your first entry</button>
            </div>
          ) : (
            <div className="codex-grid">
              {galleryEntries.map((e) => {
                const t = typeMetaOf(e.type)
                return (
                  <button
                    key={e.id}
                    className={`codex-card ${e.id === selectedId ? 'selected' : ''}`}
                    style={{ '--card-accent': e.color }}
                    onClick={() => onSelect(e.id)}
                  >
                    <div className="card-top">
                      <span className="card-type">{t?.icon} {t?.label}</span>
                    </div>
                    <h4 className="card-name">{e.name}</h4>
                    {e.aliases?.length > 0 && (
                      <p className="card-aliases">aka {e.aliases.join(', ')}</p>
                    )}
                    <p className="card-desc">{e.oneLiner || e.description || <em>No description yet.</em>}</p>
                    {e.tags?.length > 0 && (
                      <div className="card-tags">
                        {e.tags.map((t) => <span key={t} className="tag-chip small">{t}</span>)}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )
        )}

        {layout === 'navigator' && (
          state.codex.length === 0 ? (
            <div className="codex-empty">
              <h3>Nothing here yet</h3>
              <p>
                The codex is your story bible — characters, locations, items, lore, and organizations.
                Entries you create are automatically detected when their names appear in your scenes.
              </p>
              <button className="primary-btn" onClick={addEntry}>Create your first entry</button>
            </div>
          ) : (
            <div className="codex-nav-wrap">
              <CodexNavigator codex={state.codex} query={query} selectedId={selectedId} onSelect={onSelect} />
              {selected ? (
                <CodexArticle
                  key={selected.id}
                  entry={selected}
                  onSelectEntry={onSelect}
                  onDeleted={() => onSelect(null)}
                  mentions={mentionsMap[selected.id] || []}
                  onOpenScene={onOpenScene}
                />
              ) : (
                <div className="codex-article-empty">Select an entry to view it here.</div>
              )}
            </div>
          )
        )}
      </div>

      {layout === 'gallery' && selected && (
        <CodexDetail key={selected.id} entry={selected} onClose={() => onSelect(null)} onSelectEntry={onSelect} />
      )}
    </div>
  )
}
