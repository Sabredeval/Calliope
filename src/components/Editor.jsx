import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import {
  useStore, uid, plainText, countWords, findMentions, novelWords, chapterWords, sceneWords,
  buildManuscriptTree, SCENE_STATUSES, CODEX_TYPES, CODEX_COLORS, SCENES_ENABLED,
} from '../store.jsx'

const TOOLS = [
  { cmd: 'bold', icon: 'B', title: 'Bold (Ctrl+B)', style: { fontWeight: 700 } },
  { cmd: 'italic', icon: 'I', title: 'Italic (Ctrl+I)', style: { fontStyle: 'italic' } },
  { cmd: 'underline', icon: 'U', title: 'Underline (Ctrl+U)', style: { textDecoration: 'underline' } },
  { cmd: 'strikeThrough', icon: 'S', title: 'Strikethrough', style: { textDecoration: 'line-through' } },
]

/* ---- clean paste ------------------------------------------------------
   Default contentEditable paste imports the source's full HTML — styled
   spans, layout divs, fonts — which pollutes the manuscript and breaks
   measurements. We take plain text only, but rebuild paragraph structure:
   blank-line-separated text (books, Gutenberg) keeps its paragraphs with
   hard-wrapped lines rejoined; otherwise each line becomes a paragraph. */
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const toParagraphs = (text) => {
  const t = text.replace(/\r/g, '')
  if (/\n[ \t]*\n/.test(t)) {
    return t
      .split(/\n[ \t]*\n+/)
      .map((p) => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  }
  return t.split(/\n/).map((p) => p.trim()).filter(Boolean)
}

const handleProsePaste = (e) => {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain')
  if (!text) return
  const paras = toParagraphs(text)
  if (!paras.length) return
  if (paras.length === 1) {
    // single paragraph: insert inline so it doesn't split the current one
    document.execCommand('insertText', false, paras[0])
  } else {
    document.execCommand('insertHTML', false, paras.map((p) => `<p>${escapeHtml(p)}</p>`).join(''))
  }
}

/* Uncontrolled contentEditable — mounted once per scene (or per flow-mode
   chapter, when kind='chapter'), commits upward */
const SceneProse = React.memo(function SceneProse({ sceneId, initialContent, onCommit, onFocusScene, kind = 'scene' }) {
  const ref = useRef(null)
  // Placeholder visibility is tracked with a real class instead of CSS :empty
  // tricks — browsers sometimes drop typed text NEXT to the empty <p> rather
  // than inside it, which kept the :empty selector matching forever.
  const syncEmpty = () => {
    const el = ref.current
    if (el) el.classList.toggle('is-empty', !(el.textContent || '').trim())
  }
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = initialContent || '<p></p>'
      syncEmpty()
    }
  }, []) // eslint-disable-line
  return (
    <div
      ref={ref}
      className="prose ms-prose"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      data-prose={sceneId}
      data-placeholder="Write this scene…"
      onFocus={() => onFocusScene(sceneId)}
      onPaste={handleProsePaste}
      onInput={() => { syncEmpty(); onCommit(sceneId, ref.current.innerHTML, ref.current.textContent, kind) }}
      onBlur={() => { syncEmpty(); onCommit(sceneId, ref.current.innerHTML, ref.current.textContent, kind) }}
    />
  )
}, (prev, next) => prev.sceneId === next.sceneId) // never re-render for content changes; DOM owns the text

export default function Editor({ activeSceneId, onActiveSceneChange, scrollReq, onOpenCodexEntry, focusMode, onToggleFocus }) {
  const { state, dispatch } = useStore()
  const scrollRef = useRef(null)
  const sectionRefs = useRef(new Map())
  const textCache = useRef(new Map())
  const spyLockUntil = useRef(0)
  const [showMentions, setShowMentions] = useState(true)
  const [selWords, setSelWords] = useState(0)
  const [, setTextTick] = useState(0)
  const [selPop, setSelPop] = useState(null) // { x, y, text }
  const [toast, setToast] = useState(null)   // { id, name }
  const [hoverCard, setHoverCard] = useState(null) // { entry, x, y }
  const selTimer = useRef(null)
  const toastTimer = useRef(null)
  const hoverThrottle = useRef(0)

  // A scene match wins; otherwise activeSceneId may point at a flow-mode
  // chapter (written directly, no scenes) — those act as their own "scene"
  // for the purposes of the toolbar, footer, and mentions panel.
  const active = useMemo(() => {
    for (const c of state.chapters)
      for (const s of c.scenes) if (s.id === activeSceneId) return { kind: 'scene', scene: s, chapter: c }
    const flowChapter = state.chapters.find((c) => c.scenes.length === 0 && c.id === activeSceneId)
    if (flowChapter) return { kind: 'chapter', chapter: flowChapter }
    return null
  }, [state.chapters, activeSceneId])

  const commit = useCallback((id, html, text, kind = 'scene') => {
    dispatch({ type: kind === 'chapter' ? 'chapter/update' : 'scene/update', id, patch: { content: html } })
    textCache.current.set(id, text || '')
    setTextTick((t) => t + 1)
  }, [dispatch])

  const exec = (cmd, value = null) => {
    document.execCommand(cmd, false, value)
  }
  const formatBlock = (tag) => {
    const current = document.queryCommandValue('formatBlock')
    exec('formatBlock', current?.toLowerCase() === tag ? '<p>' : `<${tag}>`)
  }

  /* selection word count */
  /* selection: word count + quick "add to codex" popover */
  useEffect(() => {
    const maybeShowPopover = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) { setSelPop(null); return }
      const raw = sel.toString()
      const text = raw.trim().replace(/\s+/g, ' ')
      if (!text || text.length > 60 || text.split(' ').length > 6 || /\n/.test(raw.trim())) {
        setSelPop(null)
        return
      }
      const node = sel.anchorNode
      const el = node?.nodeType === 1 ? node : node?.parentElement
      if (!el?.closest('.ms-prose')) { setSelPop(null); return }
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      if (!rect.width && !rect.height) { setSelPop(null); return }
      setSelPop({ x: rect.left + rect.width / 2, y: rect.top, text })
    }
    const onSel = () => {
      const sel = window.getSelection()
      setSelWords(sel && !sel.isCollapsed ? countWords(sel.toString()) : 0)
      clearTimeout(selTimer.current)
      selTimer.current = setTimeout(maybeShowPopover, 250)
    }
    document.addEventListener('selectionchange', onSel)
    return () => {
      document.removeEventListener('selectionchange', onSel)
      clearTimeout(selTimer.current)
    }
  }, [])

  /* dotted-underline highlighting of codex mentions (CSS Custom Highlight API) */
  const highlightOn = state.settings.highlightCodex !== false
  const isWordChar = (c) => !!c && /[\p{L}\p{N}]/u.test(c)

  /* name/alias → entry lookup, longest first so specific names win */
  const needleList = useMemo(() => {
    const list = []
    for (const e of state.codex) {
      for (const n of [e.name, ...(e.aliases || [])]) {
        const s = (n || '').trim().toLowerCase()
        if (s.length >= 3 && !list.some((x) => x.s === s)) list.push({ s, entry: e })
      }
    }
    return list.sort((a, b) => b.s.length - a.s.length)
  }, [state.codex])

  const clearHighlights = () => {
    for (let i = 0; i < CODEX_COLORS.length; i++) CSS.highlights.delete(`codex-c${i}`)
    CSS.highlights.delete('codex-mention')
  }

  const applyHighlights = useCallback(() => {
    if (typeof CSS === 'undefined' || !('highlights' in CSS)) return
    clearHighlights()
    if (!highlightOn) return
    const root = scrollRef.current
    if (!needleList.length || !root) return
    const buckets = new Map() // color index (or -1) -> ranges
    for (const prose of root.querySelectorAll('.ms-prose')) {
      const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT)
      let node
      while ((node = walker.nextNode())) {
        const lower = node.data.toLowerCase()
        for (const { s: needle, entry } of needleList) {
          let i = lower.indexOf(needle)
          while (i !== -1) {
            if (!isWordChar(lower[i - 1]) && !isWordChar(lower[i + needle.length])) {
              const r = document.createRange()
              r.setStart(node, i)
              r.setEnd(node, i + needle.length)
              const ci = CODEX_COLORS.indexOf(entry.color)
              if (!buckets.has(ci)) buckets.set(ci, [])
              buckets.get(ci).push(r)
            }
            i = lower.indexOf(needle, i + needle.length)
          }
        }
      }
    }
    for (const [ci, ranges] of buckets) {
      const name = ci >= 0 ? `codex-c${ci}` : 'codex-mention'
      CSS.highlights.set(name, new Highlight(...ranges))
    }
  }, [needleList, highlightOn])

  useEffect(() => {
    const t = setTimeout(applyHighlights, 350)
    return () => clearTimeout(t)
  }, [applyHighlights, state.chapters])

  useEffect(() => () => {
    if (typeof CSS !== 'undefined' && 'highlights' in CSS) clearHighlights()
  }, []) // eslint-disable-line

  /* wiki hover card over underlined mentions */
  const findMentionAt = (node, offset) => {
    if (!node || node.nodeType !== 3 || offset == null) return null
    if (!node.parentElement?.closest('.ms-prose')) return null
    const lower = node.data.toLowerCase()
    for (const { s, entry } of needleList) {
      let i = lower.indexOf(s)
      while (i !== -1) {
        if (
          offset >= i && offset <= i + s.length &&
          !isWordChar(lower[i - 1]) && !isWordChar(lower[i + s.length])
        ) return entry
        i = lower.indexOf(s, i + s.length)
      }
    }
    return null
  }

  const onProseMouseMove = (e) => {
    if (!highlightOn) return
    const now = Date.now()
    if (now - hoverThrottle.current < 80) return
    hoverThrottle.current = now
    let node = null, offset = null
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(e.clientX, e.clientY)
      node = p?.offsetNode; offset = p?.offset
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(e.clientX, e.clientY)
      node = r?.startContainer; offset = r?.startOffset
    }
    const entry = findMentionAt(node, offset)
    if (entry) {
      setHoverCard((h) => (h && h.entry.id === entry.id ? h : { entry, x: e.clientX, y: e.clientY }))
    } else {
      setHoverCard(null)
    }
  }

  const normName = (t) => t.toLowerCase()
  const existingEntry = selPop
    ? state.codex.find(
        (e) =>
          normName(e.name) === normName(selPop.text) ||
          (e.aliases || []).some((a) => normName(a) === normName(selPop.text))
      )
    : null

  const quickAdd = (type) => {
    if (!selPop) return
    const id = uid()
    dispatch({ type: 'codex/add', id, entryType: type, name: selPop.text })
    setSelPop(null)
    window.getSelection()?.removeAllRanges()
    setToast({ id, name: selPop.text, icon: CODEX_TYPES.find((t) => t.id === type)?.icon })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  /* scroll to scene on request (sidebar click / search) */
  useEffect(() => {
    if (!scrollReq?.id) return
    const el = sectionRefs.current.get(scrollReq.id)
    if (!el) return
    spyLockUntil.current = Date.now() + 900
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.add('flash')
    const t = setTimeout(() => el.classList.remove('flash'), 1400)
    return () => clearTimeout(t)
  }, [scrollReq])

  /* scrollspy: active scene follows the viewport */
  const onScroll = () => {
    if (Date.now() < spyLockUntil.current) return
    const cont = scrollRef.current
    if (!cont) return
    const probe = cont.getBoundingClientRect().top + 130
    let best = null
    for (const [id, el] of sectionRefs.current) {
      const r = el.getBoundingClientRect()
      if (r.top <= probe && r.bottom > probe - 40) { best = id; break }
      if (r.top <= probe) best = id
    }
    if (best && best !== activeSceneId) onActiveSceneChange(best)
  }

  const registerSection = (id) => (el) => {
    if (el) sectionRefs.current.set(id, el)
    else sectionRefs.current.delete(id)
  }

  /* ---- manuscript pages: a stable word-based coordinate system ---------
     250 words = 1 manuscript page (the trade convention). Tick marks are
     margin decorations derived purely from word counts — identical on any
     screen, font size, or theme, and they barely drift when earlier text
     is edited. */
  const WORDS_PER_PAGE = 250
  const [msTicks, setMsTicks] = useState([])
  const [curPage, setCurPage] = useState(1)
  const ticksRef = useRef([])
  const tickTimer = useRef(null)
  const gapStyle = useRef(null)
  const pageMarks = state.settings.pageMarks || 'ticks'

  useEffect(() => {
    const el = document.createElement('style')
    document.head.appendChild(el)
    gapStyle.current = el
    return () => el.remove()
  }, [])

  const computeTicks = useCallback(() => {
    const doc = scrollRef.current?.querySelector('.ms-doc')
    if (!doc) return

    // pass 1 — pure word arithmetic: find the block where each page begins.
    // In "lines" mode those blocks get a real margin-top (via a generated
    // stylesheet keyed by nth-child, so the saved text is never touched),
    // physically separating the pages.
    const rules = []
    const tickDefs = []
    let words = 0
    let nextPage = 2 // page 1 is the top of the manuscript
    for (const prose of doc.querySelectorAll('.ms-prose')) {
      const pid = prose.dataset.prose
      let childIdx = 0
      for (const block of prose.children) {
        childIdx += 1
        const w = countWords(block.textContent || '')
        if (!w) continue
        const after = words + w
        let stack = 0
        let crossed = false
        while (after >= (nextPage - 1) * WORDS_PER_PAGE) {
          tickDefs.push({ n: nextPage, el: block, stack })
          crossed = true
          nextPage += 1
          stack += 1
        }
        if (crossed && pid) {
          rules.push(`.ms-doc [data-prose="${pid}"] > *:nth-child(${childIdx}) { margin-top: var(--pg-gap, 48px) !important; }`)
        }
        words = after
      }
    }

    if (gapStyle.current) {
      gapStyle.current.textContent = pageMarks === 'lines' ? rules.join('\n') : ''
    }

    // pass 2 — measure tick positions after the gaps have reflowed
    const docTop = doc.getBoundingClientRect().top
    const ticks = tickDefs.map((d) => ({
      n: d.n,
      y: Math.round(d.el.getBoundingClientRect().top - docTop) + d.stack * 18,
    }))
    ticksRef.current = ticks
    setMsTicks((prev) => (JSON.stringify(prev) === JSON.stringify(ticks) ? prev : ticks))
  }, [pageMarks])

  useEffect(() => {
    clearTimeout(tickTimer.current)
    tickTimer.current = setTimeout(computeTicks, 300)
    return () => clearTimeout(tickTimer.current)
  }, [computeTicks, state.chapters, state.groups, state.settings.fontSize, state.settings.align, state.settings.para, state.settings.marginX, state.settings.pageSize, state.settings.pageMarkPadding])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      clearTimeout(tickTimer.current)
      tickTimer.current = setTimeout(computeTicks, 250)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [computeTicks])

  const totalMsPages = Math.max(1, Math.ceil(novelWords(state.chapters) / WORDS_PER_PAGE))

  const updateCurPage = () => {
    const cont = scrollRef.current
    const doc = cont?.querySelector('.ms-doc')
    if (!cont || !doc) return
    const probe = cont.getBoundingClientRect().top + 150 - doc.getBoundingClientRect().top
    let page = 1
    for (const t of ticksRef.current) {
      if (t.y <= probe) page = t.n
      else break
    }
    setCurPage(page)
  }

  const goToPage = (n) => {
    const cont = scrollRef.current
    const doc = cont?.querySelector('.ms-doc')
    if (!cont || !doc) return
    spyLockUntil.current = Date.now() + 900
    if (n <= 1) { cont.scrollTo({ top: 0, behavior: 'smooth' }); return }
    const tick = ticksRef.current.find((t) => t.n === n) || ticksRef.current[ticksRef.current.length - 1]
    if (!tick) return
    const docTopInScroll = doc.getBoundingClientRect().top - cont.getBoundingClientRect().top + cont.scrollTop
    cont.scrollTo({ top: docTopInScroll + tick.y - 130, behavior: 'smooth' })
  }

  const promptGoToPage = () => {
    const v = window.prompt(`Go to manuscript page (1–${totalMsPages})`, String(curPage))
    if (!v) return
    const n = parseInt(v, 10)
    if (Number.isFinite(n)) goToPage(Math.max(1, Math.min(totalMsPages, n)))
  }

  /* ---- bookmarks: named anchors that travel with the text --------------- */
  const [bmOpen, setBmOpen] = useState(false)
  const bookmarks = state.bookmarks || []

  useEffect(() => {
    if (!bmOpen) return
    const close = () => setBmOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [bmOpen])

  const addBookmark = () => {
    if (!active) return
    const sel = window.getSelection()
    let quote = ''
    if (sel && !sel.isCollapsed) {
      quote = sel.toString().trim().replace(/\s+/g, ' ').slice(0, 90)
    } else if (sel?.anchorNode) {
      const el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement
      const block = el?.closest('.ms-prose') ? el.closest('p,h1,h2,h3,blockquote,li') : null
      quote = (block?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90)
    }
    const name = window.prompt('Bookmark name', quote.slice(0, 48) || activeTitle || 'Bookmark')
    if (name === null) return
    dispatch({
      type: 'bookmark/add',
      bm: {
        id: uid(),
        name: name.trim() || quote.slice(0, 48) || 'Bookmark',
        sceneId: activeId,
        quote,
        createdAt: Date.now(),
      },
    })
  }

  const jumpToBookmark = (bm) => {
    setBmOpen(false)
    const sec = sectionRefs.current.get(bm.sceneId)
    const cont = scrollRef.current
    if (!sec || !cont) return
    spyLockUntil.current = Date.now() + 900
    let rect = null
    if (bm.quote) {
      const prose = sec.querySelector('.ms-prose')
      const idx = prose ? (prose.textContent || '').indexOf(bm.quote) : -1
      if (prose && idx !== -1) {
        let rem = idx
        const w = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT)
        let n
        while ((n = w.nextNode())) {
          if (rem < n.length) {
            const r = document.createRange()
            r.setStart(n, rem)
            r.setEnd(n, Math.min(rem + Math.min(bm.quote.length, 30), n.length))
            rect = r.getBoundingClientRect()
            break
          }
          rem -= n.length
        }
      }
    }
    if (rect && rect.height) {
      cont.scrollTo({ top: cont.scrollTop + rect.top - cont.getBoundingClientRect().top - 160, behavior: 'smooth' })
    } else {
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    sec.classList.add('flash')
    setTimeout(() => sec.classList.remove('flash'), 1400)
    onActiveSceneChange(bm.sceneId)
  }

  const sceneTitleOf = (id) => {
    for (const c of state.chapters) {
      if (c.id === id) return c.title
      for (const s of c.scenes) if (s.id === id) return s.title
    }
    return 'missing scene'
  }

  const BookmarkIcon = ({ plus = false }) => (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
      <path
        d="M5.5 2.5h9v15l-4.5-3.6L5.5 17.5z"
        fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
      />
      {plus && <path d="M10 6v4M8 8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />}
    </svg>
  )

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
  const typeIcon = (t) => CODEX_TYPES.find((c) => c.id === t)?.icon || '📄'
  const statusOf = (s) => SCENE_STATUSES.find((x) => x.id === s.status)

  const tree = useMemo(() => buildManuscriptTree(state.chapters, state.groups), [state.chapters, state.groups])
  const chapterSiblings = (groupId) => state.chapters.filter((c) => (c.groupId ?? null) === (groupId ?? null))

  // Walks the Act/Part/.../Chapter tree in display order. Groups render as a
  // heading wrapping their children; a chapter with scenes renders each scene
  // as before, while a flow-mode chapter (no scenes) renders one continuous
  // prose block bound directly to its own content.
  const renderNode = (node, depth) => {
    if (node.type === 'group') {
      return (
        <div className="ms-group" key={node.group.id} data-depth={depth}>
          <div className="ms-group-head">
            <input
              className="ms-group-title"
              value={node.group.title}
              placeholder="Act title"
              onChange={(e) => dispatch({ type: 'group/update', id: node.group.id, patch: { title: e.target.value } })}
            />
          </div>
          {node.children.map((child) => renderNode(child, depth + 1))}
        </div>
      )
    }

    const ch = node.chapter
    const siblings = chapterSiblings(ch.groupId)
    const ci = siblings.findIndex((c) => c.id === ch.id)
    const isFlow = ch.scenes.length === 0
    const flowActive = isFlow && ch.id === activeSceneId

    return (
      <div className="ms-chapter" key={ch.id}>
        <div className="ms-chapter-head">
          <span className="ms-chapter-kicker">
            Chapter {ci + 1}
            {isFlow ? (
              ` · ${chapterWords(ch).toLocaleString()} words`
            ) : (
              <>
                {' · '}{`${ch.scenes.length} scene${ch.scenes.length === 1 ? '' : 's'}`}{' · '}{chapterWords(ch).toLocaleString()} words
              </>
            )}
          </span>
          <input
            className="ms-chapter-title"
            value={ch.title}
            placeholder="Chapter title"
            onChange={(e) => dispatch({ type: 'chapter/update', id: ch.id, patch: { title: e.target.value } })}
          />
        </div>

        {isFlow ? (
          <section
            className={`ms-scene ${flowActive ? 'active' : ''}`}
            ref={registerSection(ch.id)}
            onClick={() => { if (!flowActive) onActiveSceneChange(ch.id) }}
          >
            <SceneProse
              sceneId={ch.id}
              initialContent={ch.content}
              onCommit={commit}
              onFocusScene={onActiveSceneChange}
              kind="chapter"
            />
          </section>
        ) : (
          ch.scenes.map((sc, si) => {
            const isActive = sc.id === activeSceneId
            return (
              <React.Fragment key={sc.id}>
                {si > 0 && <div className="ms-divider" aria-hidden="true">⁂</div>}
                <section
                  className={`ms-scene ${isActive ? 'active' : ''}`}
                  ref={registerSection(sc.id)}
                  onClick={() => { if (!isActive) onActiveSceneChange(sc.id) }}
                >
                  <div className="ms-scene-head">
                    <span className="status-dot" style={{ background: statusOf(sc)?.color }} title={statusOf(sc)?.label} />
                    <input
                      className="ms-scene-title"
                      value={sc.title}
                      placeholder="Scene title"
                      onFocus={() => onActiveSceneChange(sc.id)}
                      onChange={(e) => dispatch({ type: 'scene/update', id: sc.id, patch: { title: e.target.value } })}
                    />
                    <span className="ms-scene-words">{sceneWords(sc).toLocaleString()} w</span>
                  </div>
                  <SceneProse
                    sceneId={sc.id}
                    initialContent={sc.content}
                    onCommit={commit}
                    onFocusScene={onActiveSceneChange}
                  />
                </section>
              </React.Fragment>
            )
          })
        )}

        {SCENES_ENABLED && (
          <button
            className="ms-add-scene"
            onClick={() => {
              if (isFlow) {
                const newId = uid()
                dispatch({ type: 'chapter/splitToScenes', id: ch.id, newSceneId: newId })
                onActiveSceneChange(newId)
              } else {
                dispatch({ type: 'scene/add', chapterId: ch.id })
              }
            }}
          >
            {isFlow ? `Split "${ch.title || 'this chapter'}" into scenes` : `+ Add scene to ${ch.title || `Chapter ${ci + 1}`}`}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="editor-wrap">
      <div className="editor-main">
        <div className="toolbar ms-toolbar">
          {TOOLS.map((t) => (
            <button key={t.cmd} className="tool-btn" title={t.title} style={t.style}
              onMouseDown={(e) => e.preventDefault()} onClick={() => exec(t.cmd)}>
              {t.icon}
            </button>
          ))}
          <span className="tool-sep" />
          <button className="tool-btn" title="Heading" onMouseDown={(e) => e.preventDefault()} onClick={() => formatBlock('h2')}>H</button>
          <button className="tool-btn" title="Blockquote" onMouseDown={(e) => e.preventDefault()} onClick={() => formatBlock('blockquote')}>❝</button>
          <button className="tool-btn" title="Scene break (horizontal rule)" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertHorizontalRule')}>—</button>
          <button className="tool-btn" title="New chapter" onMouseDown={(e) => e.preventDefault()} onClick={() => dispatch({ type: 'chapter/add' })}>+</button>
          <span className="tool-sep" />
          <button className="tool-btn" title="Undo (Ctrl+Z)" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('undo')}>↩</button>
          <button className="tool-btn" title="Redo (Ctrl+Y)" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('redo')}>↪</button>
          <button className="tool-btn" title="Clear formatting" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('removeFormat')}>⌫</button>

          <span className="toolbar-spacer" />

          {active && (
            <>
              <span className="ms-here" title="Where you are">
                {active.kind === 'scene' && <span className="status-dot" style={{ background: statusOf(active.scene)?.color }} />}
                {activeTitle}
              </span>
              {active.kind === 'scene' && (
                <select
                  className="status-select"
                  value={active.scene.status}
                  onChange={(e) => dispatch({ type: 'scene/update', id: active.scene.id, patch: { status: e.target.value } })}
                  title="Status of the current scene"
                >
                  {SCENE_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              )}
            </>
          )}
          <button className="tool-btn" title="Bookmark this spot (uses selection or current paragraph)" onMouseDown={(e) => e.preventDefault()} onClick={addBookmark}>
            <BookmarkIcon plus />
          </button>
          <button
            className={`tool-btn ${bmOpen ? 'toggled' : ''}`}
            title="Bookmarks"
            onClick={(e) => { e.stopPropagation(); setBmOpen((v) => !v) }}
          >
            <BookmarkIcon />
          </button>
          <button
            className={`tool-btn ${highlightOn ? 'toggled' : ''}`}
            title={highlightOn ? 'Hide codex mention underlines' : 'Underline codex mentions in the text'}
            onClick={() => dispatch({ type: 'settings/update', patch: { highlightCodex: !highlightOn } })}
          >
            <span className="hl-icon">A</span>
          </button>
          <button className="tool-btn" title={focusMode ? 'Exit focus mode (Esc)' : 'Focus mode'} onClick={onToggleFocus}>
            {focusMode ? '⤡' : '⤢'}
          </button>
          <button className="tool-btn" title={showMentions ? 'Hide codex panel' : 'Show codex panel'} onClick={() => setShowMentions((v) => !v)}>
            📚
          </button>
        </div>

        {bmOpen && (
          <div className="bm-menu" onClick={(e) => e.stopPropagation()}>
            <div className="bm-menu-head">Bookmarks</div>
            {bookmarks.length === 0 ? (
              <p className="bm-empty">
                No bookmarks yet. Select a passage (or just click into it) and press the ribbon-plus button to pin the moment — bookmarks follow the text through edits.
              </p>
            ) : (
              bookmarks.map((bm) => (
                <div className="bm-row" key={bm.id}>
                  <button className="bm-jump" onClick={() => jumpToBookmark(bm)} title={bm.quote || bm.name}>
                    <span className="bm-name">{bm.name}</span>
                    <span className="bm-context">{sceneTitleOf(bm.sceneId)}</span>
                  </button>
                  <button
                    className="mini-icon danger"
                    title="Delete bookmark"
                    onClick={() => dispatch({ type: 'bookmark/delete', id: bm.id })}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <div
          className={`ms-scroll`}
          ref={scrollRef}
          onScroll={() => { onScroll(); updateCurPage(); setSelPop(null); setHoverCard(null) }}
          onMouseMove={onProseMouseMove}
          onMouseLeave={() => setHoverCard(null)}
        >
          <div className="ms-doc">
            {msTicks.map((t) => (
              <div className="ms-tick" key={t.n} style={{ top: t.y }} aria-hidden="true">
                <span>{t.n}</span>
              </div>
            ))}
            {state.chapters.length === 0 && (
              <div className="ms-doc-empty">
                <h2>{state.novel.title || 'Your novel'}</h2>
                <p>The manuscript is empty. Add a chapter from the panel on the left, and start writing.</p>
              </div>
            )}

            {tree.map((node) => renderNode(node, 0))}

            {state.chapters.length > 0 && (
              <button className="ms-add-chapter" onClick={() => dispatch({ type: 'chapter/add' })}>
                + New chapter
              </button>
            )}
            <div className="ms-doc-tail" />
          </div>
        </div>

        {selPop && (
          <div
            className="sel-popover"
            style={{ left: selPop.x, top: selPop.y }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {existingEntry ? (
              <button className="sel-open" onClick={() => { setSelPop(null); onOpenCodexEntry(existingEntry.id) }}>
                <span className="mention-swatch" style={{ background: existingEntry.color }} />
                {CODEX_TYPES.find((t) => t.id === existingEntry.type)?.icon} {existingEntry.name} — open in codex
              </button>
            ) : (
              <>
                <span className="sel-label">Add “{selPop.text}” as</span>
                {CODEX_TYPES.map((t) => (
                  <button key={t.id} className="sel-type" title={t.label} onClick={() => quickAdd(t.id)}>
                    {t.icon}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {hoverCard && (() => {
          const e = hoverCard.entry
          const t = CODEX_TYPES.find((c) => c.id === e.type)
          const relCount = (state.relationships || []).filter((r) => r.fromId === e.id || r.toId === e.id).length
          return (
            <div
              className="codex-hovercard"
              style={{
                left: Math.min(hoverCard.x, window.innerWidth - 340),
                top: Math.min(hoverCard.y + 20, window.innerHeight - 240),
                '--hc-accent': e.color,
              }}
              onMouseLeave={() => setHoverCard(null)}
            >
              <div className="hc-head">
                <span className="hc-icon">{t?.icon}</span>
                <span className="hc-name">{e.name}</span>
                <span className="hc-type">{t?.label}</span>
              </div>
              {e.aliases?.length > 0 && <p className="hc-aliases">also: {e.aliases.join(', ')}</p>}
              {e.oneLiner && <p className="hc-lede">{e.oneLiner}</p>}
              {e.description && <p className="hc-desc">{e.description}</p>}
              <div className="hc-foot">
                {relCount > 0 && <span className="hc-rels">{relCount} relationship{relCount === 1 ? '' : 's'}</span>}
                <span className="foot-spacer" />
                <button onClick={() => { setHoverCard(null); onOpenCodexEntry(e.id) }}>Open in codex →</button>
              </div>
            </div>
          )
        })()}

        {toast && (
          <div className="sel-toast">
            <span>{toast.icon} “{toast.name}” added to codex</span>
            <button onClick={() => { setToast(null); onOpenCodexEntry(toast.id) }}>Edit entry →</button>
            <button className="toast-x" onClick={() => setToast(null)}>✕</button>
          </div>
        )}

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
          {active && <span className="foot-dim">· {activeWords.toLocaleString()} words {active.kind === 'scene' ? 'in scene' : 'in chapter'}</span>}
          {selWords > 0 && <span className="foot-sel">· {selWords} selected</span>}
          <span className="foot-spacer" />
          <button className="foot-page" title="Go to manuscript page… (250 words = 1 page)" onClick={promptGoToPage}>
            p. {curPage} / {totalMsPages}
          </button>
          <span className="foot-dim">·</span>
          <span>{totalWords.toLocaleString()} total</span>
          <span className="foot-dim">· autosaved</span>
        </footer>
      </div>

      {showMentions && !focusMode && (
        <aside className="mentions-panel">
          <div className="mentions-head">
            <span>Codex in this scene</span>
          </div>
          {!active ? (
            <p className="mentions-empty">Click into a scene to see which codex entries appear in it.</p>
          ) : mentions.length === 0 ? (
            <p className="mentions-empty">
              No codex entries detected in “{activeTitle}” yet. As you write names from your codex (or their aliases), they'll appear here.
            </p>
          ) : (
            <div className="mentions-list">
              {mentions.map(({ entry, count }) => (
                <button key={entry.id} className="mention-card" onClick={() => onOpenCodexEntry(entry.id)} title="Open in codex">
                  <span className="mention-swatch" style={{ background: entry.color }} />
                  <span className="mention-body">
                    <span className="mention-name">{typeIcon(entry.type)} {entry.name}</span>
                    {entry.oneLiner && <span className="mention-desc">{entry.oneLiner}</span>}
                  </span>
                  <span className="mention-count">×{count}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
      )}
    </div>
  )
}
