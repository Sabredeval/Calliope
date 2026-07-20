import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useStore, plainText, flatScenes, CODEX_TYPES } from '../../store.jsx'

function snippet(text, q, radius = 60) {
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i === -1) return text.slice(0, radius * 2)
  const start = Math.max(0, i - radius)
  const end = Math.min(text.length, i + q.length + radius)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

export default function SearchModal({ onClose, onOpenScene, onOpenCodex }) {
  const { state } = useStore()
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return []
    const out = []
    for (const sc of flatScenes(state.chapters)) {
      const body = plainText(sc.content)
      const hay = `${sc.title} ${sc.summary} ${body}`.toLowerCase()
      if (hay.includes(query)) {
        out.push({
          kind: 'scene', id: sc.id, title: sc.title,
          context: sc.isChapterFlow ? 'Chapter' : sc.chapterTitle,
          snippet: snippet(`${sc.summary} ${body}`.trim(), query),
        })
      }
    }
    for (const e of state.codex) {
      const hay = [e.name, e.oneLiner, e.description, e.notes, ...(e.aliases || []), ...(e.tags || [])].join(' ').toLowerCase()
      if (hay.includes(query)) {
        const t = CODEX_TYPES.find((c) => c.id === e.type)
        out.push({
          kind: 'codex', id: e.id, title: `${t?.icon || ''} ${e.name}`,
          context: `Codex · ${t?.label || e.type}`,
          snippet: snippet(`${e.oneLiner} ${e.description}`.trim(), query),
          color: e.color,
        })
      }
    }
    return out.slice(0, 30)
  }, [q, state])

  useEffect(() => setCursor(0), [q])

  const open = (r) => (r.kind === 'scene' ? onOpenScene(r.id) : onOpenCodex(r.id))

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && results[cursor]) open(results[cursor])
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal search-modal">
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Search scenes and codex…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="search-results">
          {q.trim() && results.length === 0 && <p className="search-empty">No results for “{q}”.</p>}
          {!q.trim() && <p className="search-empty">Type to search across your manuscript and codex. ↑↓ to navigate, Enter to open.</p>}
          {results.map((r, i) => (
            <button
              key={`${r.kind}-${r.id}`}
              className={`search-result ${i === cursor ? 'cursor' : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => open(r)}
            >
              <span className="sr-kind" style={r.color ? { background: r.color } : undefined}>
                {r.kind === 'scene' ? '📖' : '📚'}
              </span>
              <span className="sr-body">
                <span className="sr-title">{r.title}</span>
                <span className="sr-context">{r.context}</span>
                {r.snippet && <span className="sr-snippet">{r.snippet}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
