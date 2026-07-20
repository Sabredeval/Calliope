import React, { useState, useMemo } from 'react'
import { useStore, CODEX_TYPES, uid, useCodexEntries, mentionsByEntry } from '../../store.jsx'
import RelationGraph from './RelationGraph.jsx'
import CodexNavigator from './CodexNavigator.jsx'
import CodexArticle from './CodexArticle.jsx'
import CodexGallery from './CodexGallery.jsx'
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
  const [gallerySort, setGallerySort] = useState('name')

  // persisted per-novel so the layout choice survives reload, same mechanism as theme
  const layout = state.settings.codexLayout || 'gallery' // 'gallery' | 'navigator' | 'graph'
  const setLayout = (v) => dispatch({ type: 'settings/update', patch: { codexLayout: v } })
  const density = state.settings.codexDensity || 'comfortable'
  const setDensity = (v) => dispatch({ type: 'settings/update', patch: { codexDensity: v } })

  const filteredGalleryEntries = useCodexEntries(state.codex, typeFilter, query)
  const mentionsMap = useMemo(() => mentionsByEntry(state.chapters, state.codex), [state.chapters, state.codex])

  const relationshipCounts = useMemo(() => {
    const counts = new Map()
    for (const relationship of state.relationships || []) {
      counts.set(relationship.fromId, (counts.get(relationship.fromId) || 0) + 1)
      counts.set(relationship.toId, (counts.get(relationship.toId) || 0) + 1)
    }
    return counts
  }, [state.relationships])

  const galleryEntries = useMemo(() => {
    const entries = [...filteredGalleryEntries]
    const mentionCount = (entry) => (mentionsMap[entry.id] || []).reduce((total, mention) => total + mention.count, 0)
    const typeOrder = new Map(CODEX_TYPES.map((type, index) => [type.id, index]))
    if (gallerySort === 'mentions') return entries.sort((a, b) => mentionCount(b) - mentionCount(a) || a.name.localeCompare(b.name))
    if (gallerySort === 'relationships') return entries.sort((a, b) => (relationshipCounts.get(b.id) || 0) - (relationshipCounts.get(a.id) || 0) || a.name.localeCompare(b.name))
    if (gallerySort === 'type') return entries.sort((a, b) => (typeOrder.get(a.type) ?? 999) - (typeOrder.get(b.type) ?? 999) || a.name.localeCompare(b.name))
    return entries
  }, [filteredGalleryEntries, gallerySort, mentionsMap, relationshipCounts])

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
          {layout === 'gallery' && (
            <>
              <select className="codex-sort" value={gallerySort} onChange={(e) => setGallerySort(e.target.value)} aria-label="Sort gallery">
                <option value="name">Sort: Name</option>
                <option value="type">Sort: Type</option>
                <option value="mentions">Sort: Mentions</option>
                <option value="relationships">Sort: Relations</option>
              </select>
              <div className="density-toggle" aria-label="Gallery density">
                <button className={density === 'comfortable' ? 'active' : ''} title="Comfortable cards" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}>▦</button>
                <button className={density === 'compact' ? 'active' : ''} title="Compact cards" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}>☷</button>
              </div>
            </>
          )}
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
            <div className={`codex-gallery density-${density}`}>
              <div className="codex-gallery-intro">
                <div>
                  <span className="codex-gallery-eyebrow">Story atlas</span>
                  <h2>{typeFilter === 'all' ? 'All entries' : CODEX_TYPES.find((type) => type.id === typeFilter)?.plural}</h2>
                </div>
                <p>{galleryEntries.length} {galleryEntries.length === 1 ? 'entry' : 'entries'} · manuscript-linked world reference</p>
              </div>
              <CodexGallery
                entries={galleryEntries}
                mentionsMap={mentionsMap}
                onSelect={onSelect}
                relationshipCounts={relationshipCounts}
                selectedId={selectedId}
              />
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
