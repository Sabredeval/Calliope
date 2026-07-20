import React from 'react'
import { CODEX_TYPES } from '../../store.jsx'

const SECTIONS = [
  { id: 'browse', label: 'Browse', icon: '▦', hint: 'Explore codex entries' },
  { id: 'relations', label: 'Relations', icon: '🕸', hint: 'Map entry relationships' },
]

function NavigationToggleIcon({ expanded }) {
  const chevron = expanded ? 'M13 7.25 10.25 10l2.75 2.75' : 'M10 7.25 12.75 10 10 12.75'
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3.5" width="14" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 4v12" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d={chevron} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SectionToggle({ section, setSection, compact = false }) {
  return (
    <div className={`codex-section-toggle ${compact ? 'compact' : ''}`} role="tablist" aria-label="Codex section">
      {SECTIONS.map((item) => (
        <button
          key={item.id}
          className={section === item.id ? 'active' : ''}
          onClick={() => setSection(item.id)}
          title={item.hint}
          role="tab"
          aria-selected={section === item.id}
        >
          <span aria-hidden="true">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function CodexCompactNavigation({ counts, onExpand, section, setSection, typeFilter, setTypeFilter }) {
  return (
    <div className="codex-compact-navigation">
      <button className="codex-navigation-expand" onClick={onExpand} title="Show Codex navigator" aria-label="Show Codex navigator"><NavigationToggleIcon expanded={false} /></button>
      <SectionToggle compact section={section} setSection={setSection} />
      {section === 'browse' && (
        <select className="codex-compact-type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter by entry type">
          <option value="all">All entries · {counts.all}</option>
          {CODEX_TYPES.map((type) => <option key={type.id} value={type.id}>{type.plural} · {counts[type.id]}</option>)}
        </select>
      )}
    </div>
  )
}

export default function CodexNavigation({ counts, onCollapse, relationshipCount, section, setSection, typeFilter, setTypeFilter }) {
  return (
    <aside className="codex-navigation">
      <div className="codex-navigation-head">
        <div className="codex-navigation-copy">
          <span className="codex-navigation-kicker">Story reference</span>
          <h2>Codex</h2>
        </div>
        <button className="codex-navigation-collapse" onClick={onCollapse} title="Hide Codex navigator" aria-label="Hide Codex navigator"><NavigationToggleIcon expanded /></button>
      </div>

      <SectionToggle section={section} setSection={setSection} />

      {section === 'browse' ? (
        <nav className="codex-type-list" aria-label="Entry type">
          <span className="codex-type-list-label">Entry types</span>
          <button className={`codex-type-filter ${typeFilter === 'all' ? 'active' : ''}`} onClick={() => setTypeFilter('all')}>
            <span className="codex-type-filter-label"><span className="codex-type-icon all" aria-hidden="true">✦</span>All entries</span>
            <span className="codex-type-count">{counts.all}</span>
          </button>
          {CODEX_TYPES.map((type) => (
            <button key={type.id} className={`codex-type-filter ${typeFilter === type.id ? 'active' : ''}`} onClick={() => setTypeFilter(type.id)}>
              <span className="codex-type-filter-label"><span className="codex-type-icon" aria-hidden="true">{type.icon}</span>{type.plural}</span>
              <span className="codex-type-count">{counts[type.id]}</span>
            </button>
          ))}
        </nav>
      ) : (
        <p className="codex-relations-summary">
          <strong>{relationshipCount}</strong> {relationshipCount === 1 ? 'relationship' : 'relationships'}<br />
          between {counts.all} {counts.all === 1 ? 'entry' : 'entries'}
        </p>
      )}
    </aside>
  )
}
