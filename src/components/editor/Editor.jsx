import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import {
  useStore, uid, plainText, countWords, findMentions, novelWords, chapterWords, sceneWords,
  buildManuscriptTree, SCENE_STATUSES, CODEX_TYPES, CODEX_COLORS, SCENES_ENABLED,
} from '../../store.jsx'

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
  return t
    .split(/\n/)
    .map((p) => p.trim())
    .filter((p) => p && !PAGE_JUNK.test(p))
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

/* ---- highlights: marker colors + text-offset helpers ------------------ */
export const HL_COLORS = ['#f5d76e', '#7ed491', '#f2a1c0', '#8ab8f5']

/* map [start, end) plain-text offsets inside an element to a DOM Range
   (spans across inline formatting nodes correctly) */
const rangeFromTextOffsets = (root, start, end) => {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const r = document.createRange()
  let n
  let pos = 0
  let started = false
  while ((n = w.nextNode())) {
    const next = pos + n.length
    if (!started && start < next) {
      r.setStart(n, Math.max(0, start - pos))
      started = true
    }
    if (started && end <= next) {
      r.setEnd(n, end - pos)
      return r
    }
    pos = next
  }
  return null
}

/* caretPositionFromPoint snaps to the NEAREST text — clicks in margins and
   page gaps resolve to characters that aren't actually under the cursor.
   This verifies the resolved character really sits at the pointer. */
const caretNearPoint = (node, offset, x, y) => {
  if (!node || node.nodeType !== 3) return false
  try {
    const len = node.length
    if (!len) return false
    const i = Math.min(Math.max(0, offset), len - 1)
    const r = document.createRange()
    r.setStart(node, i)
    r.setEnd(node, i + 1)
    const rect = r.getBoundingClientRect()
    if (!rect || (!rect.width && !rect.height)) return false
    return y >= rect.top - 4 && y <= rect.bottom + 4 && x >= rect.left - 14 && x <= rect.right + 14
  } catch {
    return false
  }
}

/* plain-text offset of a (node, offset) caret position within root */
const textOffsetOf = (root, node, offset) => {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let n
  let pos = 0
  while ((n = w.nextNode())) {
    if (n === node) return pos + offset
    pos += n.length
  }
  return -1
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
    const chaptersWithContent = new Set() // to suppress lines at chapter starts
    let words = 0
    let nextPage = 2 // page 1 is the top of the manuscript
    for (const prose of doc.querySelectorAll('.ms-prose')) {
      const pid = prose.dataset.prose
      const chapterEl = prose.closest('.ms-chapter')
      let childIdx = 0
      for (const block of prose.children) {
        childIdx += 1
        const w = countWords(block.textContent || '')
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

    if (gapStyle.current) {
      gapStyle.current.textContent = pageMarks === 'lines' ? rules.join('\n') : ''
    }

    // pass 2 — measure tick positions after the gaps have reflowed
    const docTop = doc.getBoundingClientRect().top
    const ticks = tickDefs.map((d) => {
      const r = d.el.getBoundingClientRect()
      return {
        n: d.n,
        y: Math.round(r.top - docTop + d.frac * r.height),
        mid: d.mid || false,
        hidden: d.hidden || false,
      }
    })
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

  const MarkerIcon = () => (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
      <path d="m12.2 3.2 4.6 4.6-7.6 7.6H4.6v-4.6z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m10.4 5 4.6 4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 17.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
          <button className="tool-btn" title="Highlight selection & add comment" onMouseDown={(e) => e.preventDefault()} onClick={addHighlight}>
            <MarkerIcon />
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

        {hlPop && (() => {
          const h = highlights.find((x) => x.id === hlPop.id)
          if (!h) return null
          return (
            <div
              className="hl-pop"
              style={{
                left: Math.max(12, Math.min(hlPop.x, window.innerWidth - 320)),
                top: hlPop.above ? hlPop.y - 8 : hlPop.y + 8,
                transform: hlPop.above ? 'translateY(-100%)' : undefined,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="hl-pop-head">
                {HL_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`color-dot ${h.color === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => dispatch({ type: 'hl/update', id: h.id, patch: { color: c } })}
                  />
                ))}
                <span className="foot-spacer" />
                <button
                  className="mini-icon danger"
                  title="Delete highlight"
                  onClick={() => { dispatch({ type: 'hl/delete', id: h.id }); setHlPop(null) }}
                >
                  ✕
                </button>
                <button className="mini-icon" title="Close" onClick={() => setHlPop(null)}>—</button>
              </div>
              <textarea
                className="hl-comment"
                rows={3}
                autoFocus
                placeholder="Comment…"
                value={h.comment || ''}
                onChange={(e) => dispatch({ type: 'hl/update', id: h.id, patch: { comment: e.target.value } })}
              />
            </div>
          )
        })()}

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
                left: Math.max(12, Math.min(hoverCard.x, window.innerWidth - 340)),
                top: hoverCard.above ? hoverCard.y - 8 : hoverCard.y + 8,
                transform: hoverCard.above ? 'translateY(-100%)' : undefined,
                '--hc-accent': e.color,
              }}
              onMouseEnter={cancelHoverHide}
              onMouseLeave={() => scheduleHoverHide(250)}
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

      {showMentions && !focusMode && (() => {
        const panelEntry = state.codex.find((e) => e.id === panelEntryId)

        const inspTabs = (
          <div className="insp-tabs">
            <button className={inspectorTab === 'codex' ? 'active' : ''} onClick={() => setInspectorTab('codex')}>Codex</button>
            <button className={inspectorTab === 'highlights' ? 'active' : ''} onClick={() => setInspectorTab('highlights')}>Highlights</button>
            <button className={inspectorTab === 'scene' ? 'active' : ''} onClick={() => setInspectorTab('scene')}>Scene</button>
          </div>
        )

        if (inspectorTab === 'highlights') {
          const sorted = [...highlights].sort(
            (a, b) =>
              (sceneOrder.get(a.sceneId) ?? 999) - (sceneOrder.get(b.sceneId) ?? 999) ||
              (a.createdAt || 0) - (b.createdAt || 0)
          )
          return (
            <aside className="mentions-panel inspector">
              {inspTabs}
              {sorted.length === 0 ? (
                <p className="mentions-empty">
                  No highlights yet. Select a passage in the manuscript and press the marker button in the toolbar — then click the highlighted text to comment.
                </p>
              ) : (
                <div className="insp-hl-list">
                  {sorted.map((h) => (
                    <div className="bm-row" key={h.id}>
                      <span className="hl-swatch" style={{ background: h.color }} />
                      <button className="bm-jump" onClick={() => jumpToHighlight(h)} title={h.quote}>
                        <span className="bm-name">“{h.quote.length > 40 ? `${h.quote.slice(0, 40)}…` : h.quote}”</span>
                        {h.comment && <span className="bm-comment">{h.comment}</span>}
                        <span className="bm-context">{sceneTitleOf(h.sceneId)}</span>
                      </button>
                      <button
                        className="mini-icon danger"
                        title="Delete highlight"
                        onClick={() => dispatch({ type: 'hl/delete', id: h.id })}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          )
        }

        if (inspectorTab === 'scene') {
          return (
            <aside className="mentions-panel inspector">
              {inspTabs}
              {!active ? (
                <p className="mentions-empty">Click into a scene to inspect it.</p>
              ) : (
                <div className="insp-scene">
                  <label className="field">
                    <span className="field-label">{active.kind === 'scene' ? 'Scene title' : 'Chapter title'}</span>
                    <input
                      value={activeTitle}
                      onChange={(e) =>
                        dispatch({
                          type: active.kind === 'scene' ? 'scene/update' : 'chapter/update',
                          id: activeId,
                          patch: { title: e.target.value },
                        })
                      }
                    />
                  </label>

                  {active.kind === 'scene' && (
                    <>
                      <label className="field">
                        <span className="field-label">Status</span>
                        <select
                          value={active.scene.status}
                          onChange={(e) => dispatch({ type: 'scene/update', id: activeId, patch: { status: e.target.value } })}
                        >
                          {SCENE_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </label>

                      <label className="field">
                        <span className="field-label">Summary</span>
                        <textarea
                          rows={5}
                          value={active.scene.summary || ''}
                          placeholder="What happens here? Used in the outline and export."
                          onChange={(e) => dispatch({ type: 'scene/update', id: activeId, patch: { summary: e.target.value } })}
                        />
                      </label>
                    </>
                  )}

                  <p className="insp-meta">
                    {activeWords.toLocaleString()} words
                    {active.kind === 'scene' ? <> · in <strong>{active.chapter.title}</strong></> : ' · written as flowing chapter'}
                  </p>
                </div>
              )}
            </aside>
          )
        }

        if (panelEntry) {
          const panelRels = (state.relationships || []).filter(
            (r) => r.fromId === panelEntry.id || r.toId === panelEntry.id
          )
          const nameOf = (id) => state.codex.find((e) => e.id === id)?.name || '?'
          const typeMeta = CODEX_TYPES.find((t) => t.id === panelEntry.type)
          return (
            <aside className="mentions-panel inspector">
              {inspTabs}
              <div className="panel-entry-head">
                <button className="mini-btn" onClick={() => setPanelEntryId(null)}>← Back</button>
                <span className="foot-spacer" />
                <button
                  className="mini-btn"
                  onClick={() => { setPanelEntryId(null); onOpenCodexEntry(panelEntry.id) }}
                >
                  Edit in codex →
                </button>
              </div>

              <div className="detail-hero" style={{ '--hero': panelEntry.color }}>
                <span className="hero-type">{typeIcon(panelEntry.type)} {typeMeta?.label}</span>
                <h2 className="hero-name">{panelEntry.name}</h2>
                {panelEntry.aliases?.length > 0 && (
                  <p className="hero-aliases">also known as {panelEntry.aliases.join(' · ')}</p>
                )}
              </div>

              <div className="detail-read">
                {panelEntry.oneLiner && <p className="read-lede">{panelEntry.oneLiner}</p>}
                {panelEntry.description ? (
                  panelEntry.description.split(/\n+/).map((p, i) => <p key={i} className="read-para">{p}</p>)
                ) : (
                  <p className="read-empty">No description yet.</p>
                )}
                {panelEntry.notes && (
                  <div className="read-notes">
                    <span className="read-notes-label">Private notes</span>
                    {panelEntry.notes.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}
                  </div>
                )}
                {panelEntry.tags?.length > 0 && (
                  <div className="card-tags">
                    {panelEntry.tags.map((t) => <span key={t} className="tag-chip small">{t}</span>)}
                  </div>
                )}
                {panelRels.length > 0 && (
                  <div className="field">
                    <span className="field-label">Relationships</span>
                    <div className="rel-list">
                      {panelRels.map((r) => {
                        const outgoing = r.fromId === panelEntry.id
                        const otherId = outgoing ? r.toId : r.fromId
                        return (
                          <div key={r.id} className="rel-row">
                            <span className="rel-dir">{r.directed ? (outgoing ? '→' : '←') : '—'}</span>
                            <button className="rel-name" onClick={() => setPanelEntryId(otherId)} title="Read entry">
                              {nameOf(otherId)}
                            </button>
                            <span className="rel-label">{r.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          )
        }
        return (
        <aside className="mentions-panel inspector">
          {inspTabs}
          <div className="mentions-head">
            <span>In this scene</span>
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
                <button key={entry.id} className="mention-card" onClick={() => setPanelEntryId(entry.id)} title="Read here">
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
        )
      })()}
    </div>
  )
}
