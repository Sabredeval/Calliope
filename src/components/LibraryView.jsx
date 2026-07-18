import React, { useState, useRef, useEffect } from 'react'
import {
  loadLibrary, saveLibrary, createNovel, duplicateNovel, deleteNovel,
  normalizeNovelData, novelKey, CODEX_COLORS,
} from '../store.jsx'

const spineColor = (title) => {
  let h = 0
  for (const c of title || '') h = (h * 31 + c.charCodeAt(0)) >>> 0
  return CODEX_COLORS[h % CODEX_COLORS.length]
}

const fmtDate = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay
    ? `today at ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function LibraryView({ onOpen }) {
  const [lib, setLib] = useState(loadLibrary)
  const [menuFor, setMenuFor] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    document.documentElement.dataset.theme = lib.theme || 'dark'
  }, [lib.theme])

  useEffect(() => {
    const close = () => setMenuFor(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  const refresh = () => setLib(loadLibrary())
  const nextTheme = (value) => (value === 'dark' ? 'light' : value === 'light' ? 'parchment' : 'dark')
  const themeButton = {
    dark: { title: 'Switch to light mode', icon: '☀️' },
    light: { title: 'Switch to parchment mode', icon: '📜' },
    parchment: { title: 'Switch to dark mode', icon: '🌙' },
  }

  const toggleTheme = () => {
    const next = { ...lib, theme: nextTheme(lib.theme || 'dark') }
    saveLibrary(next)
    setLib(next)
  }

  const handleNew = () => {
    const id = createNovel()
    onOpen(id)
  }

  const handleDuplicate = (id) => {
    duplicateNovel(id)
    refresh()
  }

  const handleDelete = (n) => {
    if (window.confirm(`Delete “${n.title}” forever? This removes the whole novel — manuscript, codex, timeline. It cannot be undone.`)) {
      deleteNovel(n.id)
      refresh()
    }
  }

  const handleExport = (n) => {
    const raw = localStorage.getItem(novelKey(n.id))
    if (!raw) return
    const payload = JSON.stringify({ format: 'calliope-novel', version: 1, exportedAt: new Date().toISOString(), data: JSON.parse(raw) }, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(n.title || 'novel').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.calliope.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const data = normalizeNovelData(JSON.parse(await file.text()))
      if (!data) throw new Error('not a novel file')
      const id = createNovel(data)
      refresh()
      onOpen(id)
    } catch {
      window.alert('That file doesn’t look like a Calliope novel export (.calliope.json).')
    }
  }

  const novels = [...lib.novels].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

  return (
    <div className="library">
      <header className="lib-header">
        <div className="lib-brand">
          <img className="lib-avatar" src="/avatar.png" alt="Author avatar" />
          <div>
            <h1>Calliope</h1>
            <p>King Magdeley's library — every novel lives in its own slot, exportable as a file.</p>
          </div>
        </div>
        <div className="lib-actions">
          <button className="ghost-btn" onClick={() => fileRef.current?.click()}>⇪ Import</button>
          <button className="primary-btn" onClick={handleNew}>+ New novel</button>
          <button className="icon-btn" title={themeButton[lib.theme]?.title || 'Switch theme'} onClick={toggleTheme}>
            {themeButton[lib.theme]?.icon || '☀️'}
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={handleImportFile} />
        </div>
      </header>

      {novels.length === 0 ? (
        <div className="lib-empty">
          <h2>No novels yet</h2>
          <p>Start a new novel, or import a <code>.calliope.json</code> file you exported earlier.</p>
          <button className="primary-btn" onClick={handleNew}>+ Start your first novel</button>
        </div>
      ) : (
        <div className="shelf">
          {novels.map((n) => (
            <div className="book-wrap" key={n.id}>
              <div
                className="book"
                style={{ '--cover': spineColor(n.title) }}
                onClick={() => onOpen(n.id)}
                title={`Open “${n.title}”`}
              >
                <span className="book-pages" aria-hidden="true" />
                <h3 className="book-title">{n.title}</h3>
                {n.author && <p className="book-author">{n.author}</p>}
                <button
                  className="book-menu-btn"
                  title="More"
                  onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === n.id ? null : n.id) }}
                >
                  ⋯
                </button>
                {menuFor === n.id && (
                  <div className="lib-menu" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { setMenuFor(null); onOpen(n.id) }}>Open</button>
                    <button onClick={() => { setMenuFor(null); handleDuplicate(n.id) }}>Duplicate</button>
                    <button onClick={() => { setMenuFor(null); handleExport(n) }}>Export file (.json)</button>
                    <button className="menu-danger" onClick={() => { setMenuFor(null); handleDelete(n) }}>Delete…</button>
                  </div>
                )}
              </div>
              <div className="book-caption">
                <span>{(n.words || 0).toLocaleString()} words</span>
                <span className="book-caption-dim">edited {fmtDate(n.updatedAt)}</span>
              </div>
            </div>
          ))}

          <div className="book-wrap">
            <button className="book book-new" onClick={handleNew} title="New novel">
              <span className="lib-new-plus">+</span>
              <span>New novel</span>
            </button>
            <div className="book-caption">&nbsp;</div>
          </div>
        </div>
      )}

      <footer className="lib-foot"></footer>
    </div>
  )
}
