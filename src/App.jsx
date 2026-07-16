import React, { useState, useEffect } from 'react'
import { StoreProvider, useStore, novelWords, loadLibrary, saveLibrary } from './store.jsx'
import LibraryView from './components/LibraryView.jsx'
import ManuscriptSidebar from './components/ManuscriptSidebar.jsx'
import Editor from './components/Editor.jsx'
import CodexView from './components/CodexView.jsx'
import TimelineView from './components/TimelineView.jsx'
import SearchModal from './components/SearchModal.jsx'
import ExportModal from './components/ExportModal.jsx'
import NovelSettingsModal from './components/NovelSettingsModal.jsx'

function Shell({ onLibrary }) {
  const { state, dispatch } = useStore()
  const [view, setView] = useState('write') // 'write' | 'codex' | 'timeline'
  const [selectedSceneId, setSelectedSceneId] = useState(null)
  const [selectedCodexId, setSelectedCodexId] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [scrollReq, setScrollReq] = useState(null)

  const theme = state.settings.theme || 'dark'

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // select first scene on load
  useEffect(() => {
    if (!selectedSceneId) {
      const first = state.chapters.find((c) => c.scenes.length)?.scenes[0]
      if (first) setSelectedSceneId(first.id)
    }
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
        setFocusMode(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const totalWords = novelWords(state.chapters)
  const goal = Number(state.novel.wordGoal) || 0
  const pct = goal ? Math.min(100, Math.round((totalWords / goal) * 100)) : null

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
    <div className={`app ${focusMode ? 'focus-mode' : ''}`}>
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-btn" title="Back to library" onClick={onLibrary}>⌂</button>
          <div className="novel-meta" onClick={() => setSettingsOpen(true)} title="Novel settings">
            <span className="novel-title">{state.novel.title || 'Untitled Novel'}</span>
            <span className="novel-author">{state.novel.author ? `by ${state.novel.author}` : 'click to set details'}</span>
          </div>
        </div>

        <nav className="view-tabs">
          <button className={view === 'write' ? 'active' : ''} onClick={() => setView('write')}>
            <span className="tab-icon">📖</span> Write
          </button>
          <button className={view === 'codex' ? 'active' : ''} onClick={() => setView('codex')}>
            <span className="tab-icon">📚</span> Codex
          </button>
          <button className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}>
            <span className="tab-icon">🕰️</span> Timeline
          </button>
        </nav>

        <div className="topbar-right">
          <div className="word-progress" title={goal ? `${totalWords.toLocaleString()} / ${goal.toLocaleString()} words` : `${totalWords.toLocaleString()} words`}>
            <span className="wp-count">{totalWords.toLocaleString()} words</span>
            {pct !== null && (
              <div className="wp-bar"><div className="wp-fill" style={{ width: `${pct}%` }} /></div>
            )}
          </div>
          <button className="icon-btn" title="Search (Ctrl+K)" onClick={() => setSearchOpen(true)}>🔍</button>
          <button className="icon-btn" title="Export manuscript" onClick={() => setExportOpen(true)}>⇩</button>
          <button
            className="icon-btn"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => dispatch({ type: 'settings/update', patch: { theme: theme === 'dark' ? 'light' : 'dark' } })}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

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

      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onOpenScene={(id) => { openScene(id); setSearchOpen(false) }}
          onOpenCodex={(id) => { openCodexEntry(id); setSearchOpen(false) }}
        />
      )}
      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}
      {settingsOpen && <NovelSettingsModal onClose={() => setSettingsOpen(false)} />}
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
