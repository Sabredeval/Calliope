import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CODEX_COLORS } from '../../store.jsx'
import { caretNearPoint, highlightIndex, HL_COLORS, rangeFromTextOffsets } from './editorUtils.js'

const isWordChar = (character) => !!character && /[\p{L}\p{N}]/u.test(character)

export default function useEditorDecorations({
  findHighlightAt,
  highlightOn,
  popAtRect,
  scrollRef,
  sectionRefs,
  setInspectorTab,
  setPanelEntryId,
  setShowMentions,
  state,
}) {
  const [hoverCard, setHoverCard] = useState(null)
  const hoverThrottle = useRef(0)
  const hoverHide = useRef(null)
  const applyUserHighlightsRef = useRef(null)

  const cancelHoverHide = () => {
    clearTimeout(hoverHide.current)
    hoverHide.current = null
  }

  const scheduleHoverHide = (milliseconds = 350) => {
    if (hoverHide.current) return
    hoverHide.current = setTimeout(() => {
      hoverHide.current = null
      setHoverCard(null)
    }, milliseconds)
  }

  const needleList = useMemo(() => {
    const list = []
    for (const entry of state.codex) {
      for (const name of [entry.name, ...(entry.aliases || [])]) {
        const normalized = (name || '').trim().toLowerCase()
        if (normalized.length >= 3 && !list.some((item) => item.s === normalized)) {
          list.push({ s: normalized, entry })
        }
      }
    }
    return list.sort((a, b) => b.s.length - a.s.length)
  }, [state.codex])

  const clearHighlights = useCallback(() => {
    for (let i = 0; i < CODEX_COLORS.length; i++) CSS.highlights.delete(`codex-c${i}`)
    CSS.highlights.delete('codex-mention')
    for (let i = 0; i < HL_COLORS.length; i++) CSS.highlights.delete(`user-hl-${i}`)
  }, [])

  const applyHighlights = useCallback(() => {
    if (typeof CSS === 'undefined' || !('highlights' in CSS)) return
    clearHighlights()
    const root = scrollRef.current
    if (!root) return

    if (highlightOn && needleList.length) {
      const buckets = new Map()
      for (const prose of root.querySelectorAll('.ms-prose')) {
        const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT)
        let node
        while ((node = walker.nextNode())) {
          const lower = node.data.toLowerCase()
          for (const { s: needle, entry } of needleList) {
            let index = lower.indexOf(needle)
            while (index !== -1) {
              if (!isWordChar(lower[index - 1]) && !isWordChar(lower[index + needle.length])) {
                const range = document.createRange()
                range.setStart(node, index)
                range.setEnd(node, index + needle.length)
                const colorIndex = CODEX_COLORS.indexOf(entry.color)
                if (!buckets.has(colorIndex)) buckets.set(colorIndex, [])
                buckets.get(colorIndex).push(range)
              }
              index = lower.indexOf(needle, index + needle.length)
            }
          }
        }
      }
      for (const [colorIndex, ranges] of buckets) {
        const name = colorIndex >= 0 ? `codex-c${colorIndex}` : 'codex-mention'
        CSS.highlights.set(name, new Highlight(...ranges))
      }
    }

    applyUserHighlightsRef.current?.()
  }, [clearHighlights, highlightOn, needleList, scrollRef])

  const applyUserHighlights = useCallback(() => {
    if (typeof CSS === 'undefined' || !('highlights' in CSS)) return
    for (let i = 0; i < HL_COLORS.length; i++) CSS.highlights.delete(`user-hl-${i}`)
    const buckets = new Map()
    for (const highlight of (state.highlights || [])) {
      const section = sectionRefs.current.get(highlight.sceneId)
      const prose = section?.querySelector('.ms-prose')
      if (!prose || !highlight.quote) continue
      const index = highlightIndex(highlight, prose.textContent || '')
      if (index === -1) continue
      const range = rangeFromTextOffsets(prose, index, index + highlight.quote.length)
      if (!range) continue
      const colorIndex = Math.max(0, HL_COLORS.indexOf(highlight.color))
      if (!buckets.has(colorIndex)) buckets.set(colorIndex, [])
      buckets.get(colorIndex).push(range)
    }
    for (const [colorIndex, ranges] of buckets) {
      CSS.highlights.set(`user-hl-${colorIndex}`, new Highlight(...ranges))
    }
  }, [sectionRefs, state.highlights])

  applyUserHighlightsRef.current = applyUserHighlights

  useEffect(() => {
    applyUserHighlights()
  }, [applyUserHighlights])

  useEffect(() => {
    const timer = setTimeout(applyHighlights, 350)
    return () => clearTimeout(timer)
  }, [applyHighlights, state.chapters])

  useEffect(() => () => {
    if (typeof CSS !== 'undefined' && 'highlights' in CSS) clearHighlights()
  }, [clearHighlights])

  const findMentionAt = (node, offset) => {
    if (!node || node.nodeType !== 3 || offset == null) return null
    if (!node.parentElement?.closest('.ms-prose')) return null
    const lower = node.data.toLowerCase()
    for (const { s, entry } of needleList) {
      let index = lower.indexOf(s)
      while (index !== -1) {
        if (
          offset >= index && offset <= index + s.length &&
          !isWordChar(lower[index - 1]) && !isWordChar(lower[index + s.length])
        ) return { entry, node, start: index, end: index + s.length }
        index = lower.indexOf(s, index + s.length)
      }
    }
    return null
  }

  const caretAtPoint = (event) => {
    if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(event.clientX, event.clientY)
      return { node: position?.offsetNode, offset: position?.offset }
    }
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(event.clientX, event.clientY)
      return { node: range?.startContainer, offset: range?.startOffset }
    }
    return { node: null, offset: null }
  }

  const onProseMouseMove = (event) => {
    if (!highlightOn) return
    if (event.target.closest?.('.ms-tick')) {
      scheduleHoverHide()
      return
    }
    const now = Date.now()
    if (now - hoverThrottle.current < 80) return
    hoverThrottle.current = now
    const { node, offset } = caretAtPoint(event)
    if (!caretNearPoint(node, offset, event.clientX, event.clientY)) {
      scheduleHoverHide()
      return
    }
    const hit = findMentionAt(node, offset)
    if (!hit) {
      scheduleHoverHide()
      return
    }

    cancelHoverHide()
    setHoverCard((current) => {
      if (current && current.entry.id === hit.entry.id) return current
      const range = document.createRange()
      range.setStart(hit.node, hit.start)
      range.setEnd(hit.node, hit.end)
      const rect = range.getBoundingClientRect()
      const above = rect.bottom + 280 > window.innerHeight
      return { entry: hit.entry, x: rect.left, y: above ? rect.top : rect.bottom, above }
    })
  }

  const onProseClick = (event) => {
    if (!highlightOn || event.detail > 1) return
    if (event.target.closest?.('.ms-tick')) return
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) return
    const { node, offset } = caretAtPoint(event)
    if (!caretNearPoint(node, offset, event.clientX, event.clientY)) return

    const highlight = findHighlightAt(node, offset)
    if (highlight) {
      const section = sectionRefs.current.get(highlight.sceneId)
      const prose = section?.querySelector('.ms-prose')
      const index = prose ? highlightIndex(highlight, prose.textContent || '') : -1
      const range = index >= 0 ? rangeFromTextOffsets(prose, index, index + highlight.quote.length) : null
      popAtRect(highlight.id, range?.getBoundingClientRect())
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

  return {
    cancelHoverHide,
    hoverCard,
    onProseClick,
    onProseMouseMove,
    scheduleHoverHide,
    setHoverCard,
  }
}
