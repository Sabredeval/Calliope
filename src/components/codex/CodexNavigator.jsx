import React, { useState } from 'react'
import { CODEX_TYPES, useCodexEntries } from '../../store.jsx'

// Persistent list navigator, grouped by type — the codex equivalent of
// ManuscriptSidebar. Always visible, so you never lose your place scanning
// entries the way you can with the card grid once the detail panel opens.
export default function CodexNavigator({ codex, query, selectedId, onSelect, typeFilter = 'all' }) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  const entries = useCodexEntries(codex, typeFilter, query)

  const toggle = (typeId) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(typeId)) next.delete(typeId)
      else next.add(typeId)
      return next
    })
  }

  const groups = CODEX_TYPES
    .map((t) => ({ type: t, items: entries.filter((e) => e.type === t.id) }))
    .filter((g) => g.items.length > 0)

  if (entries.length === 0) {
    return (
      <nav className="codex-nav">
        <p className="codex-nav-empty">{query.trim() ? 'No matches.' : 'No entries yet.'}</p>
      </nav>
    )
  }

  return (
    <nav className="codex-nav">
      {groups.map((g) => (
        <div className="codex-nav-group" key={g.type.id}>
          <button className="codex-nav-group-head" onClick={() => toggle(g.type.id)}>
            <span className={`codex-nav-caret ${collapsed.has(g.type.id) ? 'collapsed' : ''}`}>▾</span>
            <span>{g.type.icon} {g.type.plural}</span>
            <span className="count">{g.items.length}</span>
          </button>
          {!collapsed.has(g.type.id) && (
            <div className="codex-nav-rows">
              {g.items.map((e) => (
                <button
                  key={e.id}
                  className={`codex-nav-row ${e.id === selectedId ? 'selected' : ''}`}
                  onClick={() => onSelect(e.id)}
                  title={e.name}
                >
                  <span className="codex-nav-dot" style={{ background: e.color }} />
                  <span className="codex-nav-row-text">
                    <span className="codex-nav-name">{e.name}</span>
                    {(e.oneLiner || e.description) && (
                      <span className="codex-nav-sub">{e.oneLiner || e.description}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  )
}
