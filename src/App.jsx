import React, { useState, useEffect } from 'react'
import { StoreProvider, useStore, novelWords, loadLibrary, saveLibrary, buildManuscriptTree } from './store.jsx'
import LibraryView from './components/LibraryView.jsx'
import ManuscriptSidebar from './components/ManuscriptSidebar.jsx'
import Editor from './components/Editor.jsx'
import CodexView from './components/CodexView.jsx'
import TimelineView from './components/TimelineView.jsx'
import SearchModal from './components/SearchModal.jsx'
import ExportModal from './components/ExportModal.jsx'
import NovelSettingsModal from './components/NovelSettingsModal.jsx'
import AppSettingsModal from './components/AppSettingsModal.jsx'

/* VS Code-style activity bar icons — monochrome, stroke-based */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }
const Icons = {
  home: (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path {...S} d="M3.5 9.5 10 3.5l6.5 6v6.5a1 1 0 0 1-1 1H12v-4.5H8V17H4.5a1 1 0 0 1-1-1z" />
    </svg>
  ),
  write: (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path {...S} d="M10 5C8.4 3.8 6 3.3 3 3.6v12c3-.3 5.4.2 7 1.4 1.6-1.2 4-1.7 7-1.4v-12c-3-.3-5.4.2-7 1.4z" />
      <path {...S} d="M10 5v12" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <circle {...S} cx="9" cy="9" r="5.2" />
      <path {...S} d="m13 13 4 4" />
    </svg>
  ),
  export: (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path {...S} d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5" />
      <path {...S} d="M3.5 14.5v2a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-2" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path {...S} d="M3 6h14M3 10h14M3 14h14" />
      <circle cx="7" cy="6" r="1.7" fill="var(--bg-panel)" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="13" cy="10" r="1.7" fill="var(--bg-panel)" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="14" r="1.7" fill="var(--bg-panel)" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <circle {...S} cx="10" cy="10" r="7" />
      <path {...S} d="M10 9.2v4.3" />
      <circle cx="10" cy="6.4" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
}

function Shell({ onLibrary }) {
  const { state, dispatch } = useStore()
  const [view, setView] = useState('write') // 'write' | 'codex' | 'timeline'
  const [selectedSceneId, setSelectedSceneId] = useState(null)
  const [selectedCodexId, setSelectedCodexId] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [scrollReq, setScrollReq] = useState(null)

  const theme = state.settings.theme || 'dark'
  const nextTheme = (value) => (value === 'dark' ? 'light' : value === 'light' ? 'parchment' : 'dark')
  const themeButton = {
    dark: { title: 'Switch to light mode', icon: '☀️' },
    light: { title: 'Switch to parchment mode', icon: '📜' },
    parchment: { title: 'Switch to dark mode', icon: '🌙' },
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // select the first writable location on load — a scene if that chapter has
  // them, otherwise the flow-mode chapter itself. "First" here follows the
  // actual binder order (acts and chapters interleaved), not raw array order.
  useEffect(() => {
    if (selectedSceneId || !state.chapters.length) return
    const firstChapter = (nodes) => {
      for (const n of nodes) {
        if (n.type === 'chapter') return n.chapter
        const found = firstChapter(n.children)
        if (found) return found
      }
      return null
    }
    const first = firstChapter(buildManuscriptTree(state.chapters, state.groups))
    if (first) setSelectedSceneId(first.scenes.length ? first.scenes[0].id : first.id)
  }, []) // eslint-disable-line

  // when a scene is added, jump to it
  useEffect(() => {
    if (state._newSceneId) {
      setSelectedSceneId(state._newSceneId)
      setView('write')
      setScrollReq((r) => ({ id: state._newSceneId, n: (r?.n || 0) + 1 }))
    }
  }, [state._newSceneId])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setExportOpen(false)
        setSettingsOpen(false)
        setDetailsOpen(false)
        setFocusMode(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const totalWords = novelWords(state.chapters)
  const goal = Number(state.novel.wordGoal) || 0
  const pct = goal ? Math.min(100, Math.round((totalWords / goal) * 100)) : null

  const navStyle = state.settings.navStyle || 'activitybar'
  const isBookSize = (state.settings.pageSize || 'a4') === 'book'
  const marginX = Math.max(24, Number(state.settings.marginX) || (isBookSize ? 60 : 92))
  const marginY = Math.max(24, Number(state.settings.marginY) || (isBookSize ? 68 : 88))
  const pageMarkPaddingValue = Number.isFinite(Number(state.settings.pageMarkPadding))
    ? Math.max(0, Number(state.settings.pageMarkPadding))
    : 5
  const appearance = [
    `nav-${navStyle}`,
    `fs-${state.settings.fontSize || 'medium'}`,
    `align-${state.settings.align || 'justify'}`,
    `page-${state.settings.page || 'paper'}`,
    `para-${state.settings.para || 'book'}`,
    `layout-${state.settings.layout || 'continuous'}`,
    `size-${state.settings.pageSize || 'a4'}`,
    `marks-${state.settings.pageMarks || 'ticks'}`,
  ].join(' ')

  const openScene = (id) => {
    setSelectedSceneId(id)
    setView('write')
    setScrollReq((r) => ({ id, n: (r?.n || 0) + 1 }))
  }
  const openCodexEntry = (id) => {
    setSelectedCodexId(id)
    setView('codex')
  }

  return (
    <div
      className={`app ${appearance} ${focusMode ? 'focus-mode' : ''}`}
      style={{
        '--m-x': `${marginX}px`,
        '--m-y': `${marginY}px`,
        '--page-mark-padding': `${pageMarkPaddingValue}px`,
      }}
    >
      {navStyle === 'topbar' && (
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn" title="Back to library" onClick={onLibrary}>{Icons.home}</button>
            <div className="novel-meta" onClick={() => setDetailsOpen(true)} title="Novel details">
              <span className="novel-title">{state.novel.title || 'Untitled Novel'}</span>
              <span className="novel-author">{state.novel.author ? `by ${state.novel.author}` : 'click to set details'}</span>
            </div>
          </div>

          <nav className="view-tabs">
            <button className={view === 'write' ? 'active' : ''} onClick={() => setView('write')}>Write</button>
            <button className={view === 'codex' ? 'active' : ''} onClick={() => setView('codex')}>Codex</button>
            <button className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}>Timeline</button>
          </nav>

          <div className="topbar-right">
            <div className="word-progress" title={goal ? `${totalWords.toLocaleString()} / ${goal.toLocaleString()} words` : `${totalWords.toLocaleString()} words`}>
              <span className="wp-count">{totalWords.toLocaleString()} words</span>
              {pct !== null && (
                <div className="wp-bar"><div className="wp-fill" style={{ width: `${pct}%` }} /></div>
              )}
            </div>
            <button className="icon-btn" title="Search (Ctrl+K)" onClick={() => setSearchOpen(true)}>{Icons.search}</button>
            <button className="icon-btn" title="Export manuscript" onClick={() => setExportOpen(true)}>{Icons.export}</button>
            <button
              className="icon-btn"
              title={themeButton[theme]?.title || 'Switch theme'}
              onClick={() => dispatch({ type: 'settings/update', patch: { theme: nextTheme(theme) } })}
            >
              {themeButton[theme]?.icon || '☀️'}
            </button>
            <button className="icon-btn" title="Settings" onClick={() => setSettingsOpen(true)}>{Icons.settings}</button>
          </div>
        </header>
      )}

      {navStyle === 'activitybar' && (
      <aside className="activitybar">
        <button className="ab-btn" title="Back to library" onClick={onLibrary}>{Icons.home}</button>
        <div className="ab-sep" />

        <button className={`ab-btn ${view === 'write' ? 'active' : ''}`} title="Write" onClick={() => setView('write')}>
          {Icons.write}
        </button>
        <button className={`ab-btn ${view === 'codex' ? 'active' : ''}`} title="Codex" onClick={() => setView('codex')}>
          <img className="ab-img" src="/codex-icon-small.png" alt="" />
        </button>
        <button className={`ab-btn ${view === 'timeline' ? 'active' : ''}`} title="Timeline" onClick={() => setView('timeline')}>
          <img className="ab-img" src="/timeline.png" alt="" />
        </button>

        <div className="ab-spacer" />

        <button className="ab-btn" title="Search (Ctrl+K)" onClick={() => setSearchOpen(true)}>{Icons.search}</button>
        <button className="ab-btn" title="Export manuscript" onClick={() => setExportOpen(true)}>{Icons.export}</button>
        <button
          className="ab-btn"
          title={`${state.novel.title || 'Untitled Novel'} — novel details`}
          onClick={() => setDetailsOpen(true)}
        >
          {Icons.info}
        </button>
        <button
          className="ab-btn ab-theme"
          title={themeButton[theme]?.title || 'Switch theme'}
          onClick={() => dispatch({ type: 'settings/update', patch: { theme: nextTheme(theme) } })}
        >
          {themeButton[theme]?.icon || '☀️'}
        </button>
        <button className="ab-btn" title="Settings" onClick={() => setSettingsOpen(true)}>
          {Icons.settings}
        </button>
      </aside>
      )}

      <div className="app-main">
        <div
          className="goal-line"
          title={goal ? `${totalWords.toLocaleString()} / ${goal.toLocaleString()} words (${pct}%)` : `${totalWords.toLocaleString()} words`}
        >
          {pct !== null && <div className="goal-line-fill" style={{ width: `${pct}%` }} />}
        </div>

        <div className="body">
        {view === 'write' && (
          <>
            <ManuscriptSidebar selectedSceneId={selectedSceneId} onSelectScene={openScene} />
            <Editor
              activeSceneId={selectedSceneId}
              onActiveSceneChange={setSelectedSceneId}
              scrollReq={scrollReq}
              onOpenCodexEntry={openCodexEntry}
              focusMode={focusMode}
              onToggleFocus={() => setFocusMode((v) => !v)}
            />
          </>
        )}
        {view === 'codex' && (
          <CodexView selectedId={selectedCodexId} onSelect={setSelectedCodexId} onOpenScene={openScene} />
        )}
        {view === 'timeline' && (
          <TimelineView onOpenScene={openScene} onOpenCodexEntry={openCodexEntry} />
        )}
        </div>
      </div>

      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onOpenScene={(id) => { openScene(id); setSearchOpen(false) }}
          onOpenCodex={(id) => { openCodexEntry(id); setSearchOpen(false) }}
        />
      )}
      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}
      {settingsOpen && <AppSettingsModal onClose={() => setSettingsOpen(false)} />}
      {detailsOpen && <NovelSettingsModal onClose={() => setDetailsOpen(false)} />}
    </div>
  )
}

export default function App() {
  // always start at the library (home)
  const [openId, setOpenId] = useState(null)

  const openNovel = (id) => {
    const lib = loadLibrary()
    lib.currentId = id
    saveLibrary(lib)
    setOpenId(id)
  }

  const goLibrary = () => {
    const lib = loadLibrary()
    lib.currentId = null
    saveLibrary(lib)
    setOpenId(null)
  }

  if (!openId) return <LibraryView onOpen={openNovel} />

  return (
    <StoreProvider key={openId} novelId={openId}>
      <Shell onLibrary={goLibrary} />
    </StoreProvider>
  )
}
