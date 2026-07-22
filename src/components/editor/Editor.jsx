import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  useStore, uid, plainText, countWords, findMentions, novelWords,
  buildManuscriptTree, CODEX_TYPES, SCENE_STATUSES,
} from '../../store.jsx'
import EditorInspector from './EditorInspector.jsx'
import { CodexHoverCard, CodexSelectionPopover, CodexToast, HighlightPopover } from './EditorOverlays.jsx'
import EditorToolbar from './EditorToolbar.jsx'
import ManuscriptDocument from './ManuscriptDocument.jsx'
import useEditorDecorations from './useEditorDecorations.js'
import useEditorHighlights from './useEditorHighlights.js'
import useEditorSelection from './useEditorSelection.js'
import useManuscriptScroll from './useManuscriptScroll.js'

export { HL_COLORS } from './editorUtils.js'

export default function Editor({
  activeSceneId,
  onActiveSceneChange,
  scrollReq,
  onOpenCodexEntry,
  focusMode,
  onToggleFocus,
}) {
  const { state, dispatch } = useStore()
  const scrollRef = useRef(null)
  const progressRef = useRef(null)
  const sectionRefs = useRef(new Map())
  const textCache = useRef(new Map())
  const spyLockUntil = useRef(0)
  const toastTimer = useRef(null)

  const [showMentions, setShowMentions] = useState(true)
  const [panelEntryId, setPanelEntryId] = useState(null)
  const [inspectorTab, setInspectorTab] = useState('codex')
  const [toast, setToast] = useState(null)
  const [, setTextTick] = useState(0)

  const active = useMemo(() => {
    for (const chapter of state.chapters) {
      for (const scene of chapter.scenes) {
        if (scene.id === activeSceneId) return { kind: 'scene', scene, chapter }
      }
    }
    const flowChapter = state.chapters.find(
      (chapter) => chapter.scenes.length === 0 && chapter.id === activeSceneId
    )
    return flowChapter ? { kind: 'chapter', chapter: flowChapter } : null
  }, [state.chapters, activeSceneId])

  const commit = useCallback((id, html, text, kind = 'scene') => {
    dispatch({ type: kind === 'chapter' ? 'chapter/update' : 'scene/update', id, patch: { content: html } })
    textCache.current.set(id, text || '')
    setTextTick((tick) => tick + 1)
  }, [dispatch])

  const exec = (command, value = null) => {
    document.execCommand(command, false, value)
  }

  const formatBlock = (tag) => {
    const current = document.queryCommandValue('formatBlock')
    exec('formatBlock', current?.toLowerCase() === tag ? '<p>' : `<${tag}>`)
  }

  const { selPop, selWords, setSelPop } = useEditorSelection()
  const highlightOn = state.settings.highlightCodex !== false

  const {
    addHighlight,
    findHighlightAt,
    highlights,
    hlPop,
    jumpToHighlight,
    popAtRect,
    sceneTitleOf,
    setHlPop,
  } = useEditorHighlights({
    dispatch,
    onActiveSceneChange,
    scrollRef,
    sectionRefs,
    setSelPop,
    spyLockUntil,
    state,
  })

  const {
    cancelHoverHide,
    hoverCard,
    onProseClick,
    onProseMouseMove,
    scheduleHoverHide,
    setHoverCard,
  } = useEditorDecorations({
    findHighlightAt,
    highlightOn,
    popAtRect,
    scrollRef,
    sectionRefs,
    setInspectorTab,
    setPanelEntryId,
    setShowMentions,
    state,
  })

  const {
    curPage,
    msTicks,
    onScroll,
    promptGoToPage,
    registerSection,
    totalMsPages,
    updateCurPage,
  } = useManuscriptScroll({
    activeSceneId,
    onActiveSceneChange,
    progressRef,
    scrollRef,
    scrollReq,
    sectionRefs,
    spyLockUntil,
    state,
  })

  const normalizeName = (text) => text.toLowerCase()
  const existingEntry = selPop?.mode === 'codex'
    ? state.codex.find(
        (entry) =>
          normalizeName(entry.name) === normalizeName(selPop.text) ||
          (entry.aliases || []).some((alias) => normalizeName(alias) === normalizeName(selPop.text))
      )
    : null

  const quickAdd = (type) => {
    if (!selPop || selPop.mode !== 'codex') return
    const id = uid()
    dispatch({ type: 'codex/add', id, entryType: type, name: selPop.text })
    setSelPop(null)
    window.getSelection()?.removeAllRanges()
    setToast({ id, name: selPop.text, icon: CODEX_TYPES.find((item) => item.id === type)?.icon })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  const activeId = active ? (active.kind === 'scene' ? active.scene.id : active.chapter.id) : null
  const activeContent = active ? (active.kind === 'scene' ? active.scene.content : active.chapter.content) : ''
  const activeTitle = active ? (active.kind === 'scene' ? active.scene.title : active.chapter.title) : ''
  const activeText = active ? (textCache.current.get(activeId) ?? plainText(activeContent)) : ''
  const mentions = useMemo(
    () => findMentions(activeText, state.codex),
    [activeText, state.codex]
  )

  const totalWords = novelWords(state.chapters)
  const activeWords = countWords(activeText)
  const statusOf = (scene) => SCENE_STATUSES.find((status) => status.id === scene.status)
  const tree = useMemo(
    () => buildManuscriptTree(state.chapters, state.groups),
    [state.chapters, state.groups]
  )

  const sceneOrder = useMemo(() => {
    const order = new Map()
    let index = 0
    const walk = (nodes) => {
      for (const node of nodes) {
        if (node.type === 'chapter') {
          if (node.chapter.scenes.length) {
            for (const scene of node.chapter.scenes) order.set(scene.id, index++)
          } else {
            order.set(node.chapter.id, index++)
          }
        } else {
          walk(node.children)
        }
      }
    }
    walk(tree)
    return order
  }, [tree])

  const handleScroll = () => {
    onScroll()
    updateCurPage()
    setSelPop(null)
    setHlPop(null)
    cancelHoverHide()
    setHoverCard(null)
  }

  return (
    <div className="editor-wrap">
      <div className="editor-main">
        <EditorToolbar
          active={active}
          activeTitle={activeTitle}
          addHighlight={addHighlight}
          dispatch={dispatch}
          focusMode={focusMode}
          formatBlock={formatBlock}
          highlightOn={highlightOn}
          onToggleFocus={onToggleFocus}
          onToggleMentions={() => setShowMentions((visible) => !visible)}
          showMentions={showMentions}
          statusOf={statusOf}
        />

        <HighlightPopover
          dispatch={dispatch}
          highlights={highlights}
          hlPop={hlPop}
          setHlPop={setHlPop}
        />

        <div className="ms-reading-progress" aria-hidden="true">
          <span ref={progressRef} />
        </div>

        <div
          className="ms-scroll"
          ref={scrollRef}
          onScroll={handleScroll}
          onMouseMove={onProseMouseMove}
          onClick={onProseClick}
          onMouseLeave={() => scheduleHoverHide(300)}
        >
          <div className="ms-doc">
            {msTicks.filter((tick) => !tick.hidden).map((tick) => (
              <div
                className={`ms-tick ${tick.mid ? 'ms-tick--mid' : ''}`}
                key={tick.n}
                style={{ top: tick.y }}
                aria-hidden="true"
              >
                <span>{tick.n}</span>
              </div>
            ))}
            <ManuscriptDocument
              activeSceneId={activeSceneId}
              chapters={state.chapters}
              commit={commit}
              dispatch={dispatch}
              novelTitle={state.novel.title}
              onActiveSceneChange={onActiveSceneChange}
              registerSection={registerSection}
              statusOf={statusOf}
              tree={tree}
              uid={uid}
            />
            <div className="ms-doc-tail" />
          </div>
        </div>

        <CodexSelectionPopover
          addHighlight={addHighlight}
          existingEntry={existingEntry}
          onOpenCodexEntry={onOpenCodexEntry}
          quickAdd={quickAdd}
          selPop={selPop}
          setSelPop={setSelPop}
        />
        <CodexHoverCard
          cancelHoverHide={cancelHoverHide}
          hoverCard={hoverCard}
          onOpenCodexEntry={onOpenCodexEntry}
          scheduleHoverHide={scheduleHoverHide}
          setHoverCard={setHoverCard}
          state={state}
        />
        <CodexToast
          onOpenCodexEntry={onOpenCodexEntry}
          setToast={setToast}
          toast={toast}
        />

        <footer className="editor-foot ms-foot">
          {active && (
            <span className="ms-crumb">
              {active.kind === 'scene' ? (
                <>{active.chapter.title} <span className="foot-dim">›</span> {active.scene.title}</>
              ) : (
                active.chapter.title
              )}
            </span>
          )}
          {active && (
            <span className="foot-dim">
              · {activeWords.toLocaleString()} words {active.kind === 'scene' ? 'in scene' : 'in chapter'}
            </span>
          )}
          {selWords > 0 && <span className="foot-sel">· {selWords} selected</span>}
          <span className="foot-spacer" />
          <button
            className="foot-page"
            title="Go to manuscript page… (250 words = 1 page)"
            onClick={promptGoToPage}
          >
            p. {curPage} / {totalMsPages}
          </button>
          <span className="foot-dim">·</span>
          <span>{totalWords.toLocaleString()} total</span>
          <span className="foot-dim">· autosaved</span>
        </footer>
      </div>

      {showMentions && !focusMode && (
        <EditorInspector
          active={active}
          activeId={activeId}
          activeTitle={activeTitle}
          activeWords={activeWords}
          dispatch={dispatch}
          highlights={highlights}
          inspectorTab={inspectorTab}
          jumpToHighlight={jumpToHighlight}
          mentions={mentions}
          onOpenCodexEntry={onOpenCodexEntry}
          panelEntryId={panelEntryId}
          sceneOrder={sceneOrder}
          sceneTitleOf={sceneTitleOf}
          setInspectorTab={setInspectorTab}
          setPanelEntryId={setPanelEntryId}
          state={state}
        />
      )}
    </div>
  )
}
