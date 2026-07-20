import React from 'react'
import { typeMetaOf } from './CodexShared.jsx'

const plural = (count, singular, pluralForm = `${singular}s`) => `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`

function locationSummary(appearances) {
  if (!appearances.length) return 'Not yet in the manuscript'
  const chapters = [...new Set(appearances.map((appearance) => appearance.chapterTitle).filter(Boolean))]
  const flowCount = appearances.filter((appearance) => appearance.isChapterFlow).length
  const locationKind = flowCount === appearances.length ? 'chapter' : flowCount === 0 ? 'scene' : 'location'
  const locations = plural(appearances.length, locationKind)
  if (!chapters.length) return locations
  if (chapters.length === 1) return `${locations} · ${chapters[0]}`
  return `${locations} · ${chapters[0]} +${chapters.length - 1}`
}

function CodexCard({ entry, mentions, onSelect, relationshipCount, selected }) {
  const type = typeMetaOf(entry.type)
  const mentionCount = mentions.reduce((total, mention) => total + mention.count, 0)
  const shownAliases = (entry.aliases || []).slice(0, 2)
  const hiddenAliasCount = Math.max(0, (entry.aliases || []).length - shownAliases.length)
  const shownTags = (entry.tags || []).slice(0, 3)
  const hiddenTagCount = Math.max(0, (entry.tags || []).length - shownTags.length)

  return (
    <button
      className={`codex-card ${selected ? 'selected' : ''}`}
      style={{ '--card-accent': entry.color }}
      onClick={() => onSelect(entry.id)}
      aria-label={`Open ${entry.name}, ${type?.label || 'codex entry'}`}
    >
      <span className="card-accent" aria-hidden="true" />
      <div className="card-top">
        <span className="card-glyph" aria-hidden="true">{type?.icon || '📄'}</span>
        <span className="card-type">{type?.label || 'Entry'}</span>
      </div>

      <div className="card-heading">
        <h4 className="card-name">{entry.name}</h4>
        {shownAliases.length > 0 && (
          <p className="card-aliases">
            also {shownAliases.join(' · ')}{hiddenAliasCount > 0 ? ` +${hiddenAliasCount}` : ''}
          </p>
        )}
      </div>

      <p className={`card-desc ${entry.oneLiner || entry.description ? '' : 'empty'}`}>
        {entry.oneLiner || entry.description || 'No description yet.'}
      </p>

      <div className="card-tags" aria-label="Tags">
        {shownTags.map((tag) => <span key={tag} className="tag-chip small">{tag}</span>)}
        {hiddenTagCount > 0 && <span className="tag-chip small tag-more">+{hiddenTagCount}</span>}
      </div>

      <div className="card-atlas-meta">
        <div className="card-stats">
          <span title="Manuscript mentions">⌁ {plural(mentionCount, 'mention')}</span>
          <span title="Codex relationships">↔ {plural(relationshipCount, 'relation')}</span>
        </div>
        <span className={`card-locations ${mentions.length ? '' : 'empty'}`}>{locationSummary(mentions)}</span>
      </div>
    </button>
  )
}

export default function CodexGallery({ entries, mentionsMap, onSelect, relationshipCounts, selectedId }) {
  return (
    <div className="codex-grid">
      {entries.map((entry) => (
        <CodexCard
          key={entry.id}
          entry={entry}
          mentions={mentionsMap[entry.id] || []}
          onSelect={onSelect}
          relationshipCount={relationshipCounts.get(entry.id) || 0}
          selected={entry.id === selectedId}
        />
      ))}
    </div>
  )
}
