import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import {
  useStore, uid, plainText, countWords, findMentions, novelWords, chapterWords,
  buildManuscriptTree, CODEX_TYPES, CODEX_COLORS, SCENE_STATUSES,
} from '../../store.jsx'
import { HL_COLORS, caretNearPoint, rangeFromTextOffsets, textOffsetOf } from './editorUtils.js'
import EditorInspector from './EditorInspector.jsx'
import { CodexHoverCard, CodexSelectionPopover, CodexToast, HighlightPopover } from './EditorOverlays.jsx'
import EditorToolbar from './EditorToolbar.jsx'
import ManuscriptDocument from './ManuscriptDocument.jsx'

export { HL_COLORS } from './editorUtils.js'

const requestFrame = typeof window !== 'undefined' && window.requestAnimationFrame
  ? window.requestAnimationFrame.bind(window)
  : (callback) => setTimeout(callback, 0)
const cancelFrame = typeof window !== 'undefined' && window.cancelAnimationFrame
  ? window.cancelAnimationFrame.bind(window)
  : clearTimeout

export default function Editor({ activeSceneId, onActiveSceneChange, scrollReq, onOpenCodexEntry, focusMode, onToggleFocus }) {
  const { state, dispatch } = useStore()
  const scrollRef = useRef(null)
  const sectionRefs = useRef(new Map())
  const textCache = useRef(new Map())
  const spyLockUntil = useRef(0)
  const [showMentions, setShowMentions] = useState(true)
  const [panelEntryId, setPanelEntryId] = useState(null) // read-only entry open in the right panel
  const [inspectorTab, setInspectorTab] = useState('codex') // 'codex' | 'highlights' | 'scene'
  const [selWords, setSelWords] = useState(0)
  const [, setTextTick] = useState(0)
  const [selPop, setSelPop] = useState(null) // { x, y, text }
  const [toast, setToast] = useState(null)   // { id, name }
  const [hoverCard, setHoverCard] = useState(null) // { entry, x, y }
  const selTimer = useRef(null)
  const toastTimer = useRef(null)
  const hoverThrottle = useRef(0)
  const hoverHide = useRef(null)

  /* hover-card lifetime: never hide instantly — give the mouse time to
     travel from the underlined word onto the card */
  const cancelHoverHide = () => {
    clearTimeout(hoverHide.current)
    hoverHide.current = null
  }
  const scheduleHoverHide = (ms = 350) => {
    if (hoverHide.current) return
    hoverHide.current = setTimeout(() => {
      hoverHide.current = null
      setHoverCard(null)
    }, ms)
  }

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

  const applyUserHLRef = useRef(null) // latest applyUserHighlights, avoids stale closures

  const clearHighlights = () => {
    for (let i = 0; i < CODEX_COLORS.length; i++) CSS.highlights.delete(`codex-c${i}`)
    CSS.highlights.delete('codex-mention')
    for (let i = 0; i < HL_COLORS.length; i++) CSS.highlights.delete(`user-hl-${i}`)
  }

  const applyHighlights = useCallback(() => {
    if (typeof CSS === 'undefined' || !('highlights' in CSS)) return
    clearHighlights()
    const root = scrollRef.current
    if (!root) return

    // codex mention underlines (gated by the A toggle)
    if (highlightOn && needleList.length) {
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
    }

    applyUserHLRef.current?.()
  }, [needleList, highlightOn]) // eslint-disable-line

  /* user highlights are cheap (only the scenes that carry them get walked),
     so they apply INSTANTLY on change — unlike the debounced full-document
     mention scan above */
  const applyUserHighlights = useCallback(() => {
    if (typeof CSS === 'undefined' || !('highlights' in CSS)) return
    for (let i = 0; i < HL_COLORS.length; i++) CSS.highlights.delete(`user-hl-${i}`)
    const hlBuckets = new Map()
    for (const h of (state.highlights || [])) {
      const sec = sectionRefs.current.get(h.sceneId)
      const prose = sec?.querySelector('.ms-prose')
      if (!prose || !h.quote) continue
      const idx = (prose.textContent || '').indexOf(h.quote)
      if (idx === -1) continue
      const r = rangeFromTextOffsets(prose, idx, idx + h.quote.length)
      if (!r) continue
      const ci = Math.max(0, HL_COLORS.indexOf(h.color))
      if (!hlBuckets.has(ci)) hlBuckets.set(ci, [])
      hlBuckets.get(ci).push(r)
    }
    for (const [ci, ranges] of hlBuckets) {
      CSS.highlights.set(`user-hl-${ci}`, new Highlight(...ranges))
    }
  }, [state.highlights])

  applyUserHLRef.current = applyUserHighlights

  useEffect(() => {
    applyUserHighlights() // no debounce: color/comment edits reflect immediately
  }, [applyUserHighlights])

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
        ) return { entry, node, start: i, end: i + s.length }
        i = lower.indexOf(s, i + s.length)
      }
    }
    return null
  }

  const onProseMouseMove = (e) => {
    if (!highlightOn) return
    if (e.target.closest?.('.ms-tick')) { scheduleHoverHide(); return }
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
    if (!caretNearPoint(node, offset, e.clientX, e.clientY)) { scheduleHoverHide(); return }
    const hit = findMentionAt(node, offset)
    if (hit) {
      cancelHoverHide()
      setHoverCard((h) => {
        if (h && h.entry.id === hit.entry.id) return h // same word: keep position stable
        // anchor the card to the mention text itself, not the cursor
        const r = document.createRange()
        r.setStart(hit.node, hit.start)
        r.setEnd(hit.node, hit.end)
        const rect = r.getBoundingClientRect()
        const above = rect.bottom + 280 > window.innerHeight // flip near the bottom edge
        return { entry: hit.entry, x: rect.left, y: above ? rect.top : rect.bottom, above }
      })
    } else {
      scheduleHoverHide()
    }
  }

  /* left-click on an underlined mention opens the entry read-only in the
     right panel — but never when the user is selecting text or double-
     clicking to select a word */
  const onProseClick = (e) => {
    if (!highlightOn || e.detail > 1) return
    if (e.target.closest?.('.ms-tick')) return // page lines are inert
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) return
    let node = null, offset = null
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(e.clientX, e.clientY)
      node = p?.offsetNode; offset = p?.offset
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(e.clientX, e.clientY)
      node = r?.startContainer; offset = r?.startOffset
    }
    if (!caretNearPoint(node, offset, e.clientX, e.clientY)) return
    // a click on a user highlight opens its comment; mentions come second
    const hl = findHighlightAt(node, offset)
    if (hl) {
      popAtRect(hl.id, highlightRange(hl)?.getBoundingClientRect())
      cancelHoverHide()
      setHoverCard(null)
      return
    }
    const hit = findMentionAt(node, offset)
    if (hit) {
      setShowMentions(true)
      setInspectorTab('codex')
      setPanelEntryId(hit.entry.id)
      cancelHoverHide()
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
  const tickFrame = useRef(null)
  const gapStyle = useRef(null)
  const lastGapCss = useRef('')
  const blockWordCache = useRef(new WeakMap())
  const pageMarks = state.settings.pageMarks || 'ticks'

  useEffect(() => {
    const el = document.createElement('style')
    document.head.appendChild(el)
    gapStyle.current = el
    return () => {
      if (tickFrame.current !== null) cancelFrame(tickFrame.current)
      el.remove()
    }
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
    const chaptersWithContent = new Set() // to suppress lines at chapter starts
    let words = 0
    let nextPage = 2 // page 1 is the top of the manuscript
    for (const prose of doc.querySelectorAll('.ms-prose')) {
      const pid = prose.dataset.prose
      const chapterEl = prose.closest('.ms-chapter')
      let childIdx = 0
      for (const block of prose.children) {
        childIdx += 1
        const text = block.textContent || ''
        const cached = blockWordCache.current.get(block)
        const w = cached?.text === text ? cached.words : countWords(text)
        if (!cached || cached.text !== text) blockWordCache.current.set(block, { text, words: w })
        if (!w) continue
        // book convention: a chapter always starts on a fresh page — round
        // the word count up to the next page boundary at each chapter start.
        // Its heading acts as the page break, so no line/gap is drawn there.
        const atChapterStart = chapterEl && !chaptersWithContent.has(chapterEl)
        if (chapterEl) chaptersWithContent.add(chapterEl)
        if (atChapterStart && words > 0) {
          words = Math.ceil(words / WORDS_PER_PAGE) * WORDS_PER_PAGE
          nextPage = words / WORDS_PER_PAGE + 1
        }
        const after = words + w
        let stack = 0
        let crossed = false
        while (after >= (nextPage - 1) * WORDS_PER_PAGE) {
          // a long paragraph can contain several page starts: the first gets
          // the block-top line+gap, the rest sit proportionally where the
          // page really begins inside the block (as small mid-block ticks)
          const frac = stack === 0 ? 0 : Math.min(0.96, ((nextPage - 1) * WORDS_PER_PAGE - words) / w)
          tickDefs.push({ n: nextPage, el: block, frac, mid: stack > 0, hidden: atChapterStart && stack === 0 })
          crossed = true
          nextPage += 1
          stack += 1
        }
        if (crossed && pid && !atChapterStart) {
          rules.push(`.ms-doc [data-prose="${pid}"] > *:nth-child(${childIdx}) { margin-top: var(--pg-gap, 48px) !important; }`)
        }
        words = after
      }
    }

    const nextGapCss = pageMarks === 'lines' ? rules.join('\n') : ''
    if (gapStyle.current && lastGapCss.current !== nextGapCss) {
      gapStyle.current.textContent = nextGapCss
      lastGapCss.current = nextGapCss
    }

    // pass 2 — measure tick positions after the gaps have reflowed
    const docTop = doc.getBoundingClientRect().top
    const rects = new Map()
    const ticks = tickDefs.map((d) => {
      let r = rects.get(d.el)
      if (!r) {
        r = d.el.getBoundingClientRect()
        rects.set(d.el, r)
      }
      return {
        n: d.n,
        y: Math.round(r.top - docTop + d.frac * r.height),
        mid: d.mid || false,
        hidden: d.hidden || false,
      }
    })
    ticksRef.current = ticks
    setMsTicks((previous) => {
      const unchanged = previous.length === ticks.length && previous.every((tick, index) => {
        const next = ticks[index]
        return tick.n === next.n && tick.y === next.y && tick.mid === next.mid && tick.hidden === next.hidden
      })
      return unchanged ? previous : ticks
    })
  }, [pageMarks])

  const scheduleTickComputation = useCallback(() => {
    if (tickFrame.current !== null) cancelFrame(tickFrame.current)
    tickFrame.current = requestFrame(() => {
      tickFrame.current = null
      computeTicks()
    })
  }, [computeTicks])

  useEffect(() => {
    scheduleTickComputation()
  }, [scheduleTickComputation, state.chapters, state.groups, state.settings.fontSize, state.settings.align, state.settings.para, state.settings.marginX, state.settings.pageSize, state.settings.pageMarkPadding])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(scheduleTickComputation)
    ro.observe(el)
    return () => ro.disconnect()
  }, [scheduleTickComputation])

  // each chapter starts a fresh page, so totals are per-chapter ceilings
  const totalMsPages = Math.max(
    1,
    state.chapters.reduce((n, ch) => n + Math.ceil(chapterWords(ch) / WORDS_PER_PAGE), 0)
  )

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

  /* ---- highlights: marked passages with comments, anchored to the text -- */
  const [hlPop, setHlPop] = useState(null) // { id, x, y, above } — comment editor
  const highlights = state.highlights || []

  /* the comment popover dismisses on outside click, Escape, and scroll —
     clicks inside it are shielded by its own stopPropagation */
  useEffect(() => {
    if (!hlPop) return
    const onDown = () => setHlPop(null)
    const onKey = (e) => { if (e.key === 'Escape') setHlPop(null) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [hlPop])

  const highlightRange = (h) => {
    const sec = sectionRefs.current.get(h.sceneId)
    const prose = sec?.querySelector('.ms-prose')
    if (!prose || !h.quote) return null
    const idx = (prose.textContent || '').indexOf(h.quote)
    if (idx === -1) return null
    return rangeFromTextOffsets(prose, idx, idx + h.quote.length)
  }

  const popAtRect = (id, rect) => {
    if (!rect || !rect.height) return
    const above = rect.bottom + 230 > window.innerHeight
    setHlPop({ id, x: rect.left, y: above ? rect.top : rect.bottom, above })
  }

  const addHighlight = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const el = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement
    const prose = el?.closest('.ms-prose')
    if (!prose) return
    const quote = sel.toString().trim()
    if (!quote || quote.length > 500) return
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    const id = uid()
    dispatch({
      type: 'hl/add',
      hl: { id, sceneId: prose.dataset.prose, quote, comment: '', color: HL_COLORS[0], createdAt: Date.now() },
    })
    sel.removeAllRanges()
    setSelPop(null)
    popAtRect(id, rect)
  }

  const findHighlightAt = (node, offset) => {
    if (!node || node.nodeType !== 3) return null
    const prose = node.parentElement?.closest('.ms-prose')
    if (!prose) return null
    const off = textOffsetOf(prose, node, offset)
    if (off < 0) return null
    const text = prose.textContent || ''
    for (const h of highlights) {
      if (h.sceneId !== prose.dataset.prose || !h.quote) continue
      const idx = text.indexOf(h.quote)
      if (idx !== -1 && off >= idx && off <= idx + h.quote.length) return h
    }
    return null
  }

  const jumpToHighlight = (h) => {
    const sec = sectionRefs.current.get(h.sceneId)
    const cont = scrollRef.current
    if (!sec || !cont) return
    spyLockUntil.current = Date.now() + 900
    const rect = highlightRange(h)?.getBoundingClientRect()
    if (rect && rect.height) {
      cont.scrollTo({ top: cont.scrollTop + rect.top - cont.getBoundingClientRect().top - 160, behavior: 'smooth' })
    } else {
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    sec.classList.add('flash')
    setTimeout(() => sec.classList.remove('flash'), 1400)
    onActiveSceneChange(h.sceneId)
  }

  const sceneTitleOf = (id) => {
    for (const c of state.chapters) {
      if (c.id === id) return c.title
      for (const s of c.scenes) if (s.id === id) return s.title
    }
    return 'missing scene'
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
  const statusOf = (s) => SCENE_STATUSES.find((x) => x.id === s.status)

  const tree = useMemo(() => buildManuscriptTree(state.chapters, state.groups), [state.chapters, state.groups])

  /* manuscript-order index for every writable location (scene or flow chapter) */
  const sceneOrder = useMemo(() => {
    const m = new Map()
    let i = 0
    const walk = (nodes) => {
      for (const n of nodes) {
        if (n.type === 'chapter') {
          if (n.chapter.scenes.length) for (const s of n.chapter.scenes) m.set(s.id, i++)
          else m.set(n.chapter.id, i++)
        } else {
          walk(n.children)
        }
      }
    }
    walk(tree)
    return m
  }, [tree])
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

        <HighlightPopover dispatch={dispatch} highlights={highlights} hlPop={hlPop} setHlPop={setHlPop} />

        <div
          className={`ms-scroll`}
          ref={scrollRef}
          onScroll={() => { onScroll(); updateCurPage(); setSelPop(null); setHlPop(null); cancelHoverHide(); setHoverCard(null) }}
          onMouseMove={onProseMouseMove}
          onClick={onProseClick}
          onMouseLeave={() => scheduleHoverHide(300)}
        >
          <div className="ms-doc">
            {msTicks.filter((t) => !t.hidden).map((t) => (
              <div className={`ms-tick ${t.mid ? 'ms-tick--mid' : ''}`} key={t.n} style={{ top: t.y }} aria-hidden="true">
                <span>{t.n}</span>
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

        <CodexSelectionPopover existingEntry={existingEntry} onOpenCodexEntry={onOpenCodexEntry} quickAdd={quickAdd} selPop={selPop} setSelPop={setSelPop} />
        <CodexHoverCard
          cancelHoverHide={cancelHoverHide}
          hoverCard={hoverCard}
          onOpenCodexEntry={onOpenCodexEntry}
          scheduleHoverHide={scheduleHoverHide}
          setHoverCard={setHoverCard}
          state={state}
        />
        <CodexToast onOpenCodexEntry={onOpenCodexEntry} setToast={setToast} toast={toast} />

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
