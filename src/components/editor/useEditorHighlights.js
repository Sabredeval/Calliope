import { useEffect, useState } from 'react'
import { uid } from '../../store.jsx'
import {
  HIGHLIGHT_SELECTION_MAX_CHARS,
  HL_COLORS,
  highlightIndex,
  proseOfNode,
  rangeFromTextOffsets,
  textOffsetOf,
} from './editorUtils.js'

export default function useEditorHighlights({
  dispatch,
  onActiveSceneChange,
  scrollRef,
  sectionRefs,
  setSelPop,
  spyLockUntil,
  state,
}) {
  const [hlPop, setHlPop] = useState(null)
  const highlights = state.highlights || []

  useEffect(() => {
    if (!hlPop) return
    const onDown = () => setHlPop(null)
    const onKey = (event) => {
      if (event.key === 'Escape') setHlPop(null)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [hlPop])

  const highlightRange = (highlight) => {
    const section = sectionRefs.current.get(highlight.sceneId)
    const prose = section?.querySelector('.ms-prose')
    if (!prose || !highlight.quote) return null
    const index = highlightIndex(highlight, prose.textContent || '')
    if (index === -1) return null
    return rangeFromTextOffsets(prose, index, index + highlight.quote.length)
  }

  const popAtRect = (id, rect) => {
    if (!rect || !rect.height) return
    const above = rect.bottom + 230 > window.innerHeight
    setHlPop({ id, x: rect.left, y: above ? rect.top : rect.bottom, above })
  }

  const addHighlight = () => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return
    const range = selection.getRangeAt(0)
    const prose = proseOfNode(range.startContainer)
    if (!prose || prose !== proseOfNode(range.endContainer)) return

    const proseText = prose.textContent || ''
    let start = textOffsetOf(prose, range.startContainer, range.startOffset)
    let end = textOffsetOf(prose, range.endContainer, range.endOffset)
    if (start < 0 || end < start) return

    let quote = proseText.slice(start, end)
    const leadingWhitespace = quote.match(/^\s*/)?.[0].length || 0
    const trailingWhitespace = quote.match(/\s*$/)?.[0].length || 0
    start += leadingWhitespace
    end -= trailingWhitespace
    quote = proseText.slice(start, end)
    if (!quote || quote.length > HIGHLIGHT_SELECTION_MAX_CHARS) return

    const rects = [...range.getClientRects()].filter((rect) => rect.width || rect.height)
    const rect = rects[rects.length - 1] || range.getBoundingClientRect()
    const id = uid()
    dispatch({
      type: 'hl/add',
      hl: {
        id,
        sceneId: prose.dataset.prose,
        quote,
        start,
        comment: '',
        color: HL_COLORS[0],
        createdAt: Date.now(),
      },
    })
    selection.removeAllRanges()
    setSelPop(null)
    popAtRect(id, rect)
  }

  const findHighlightAt = (node, offset) => {
    if (!node || node.nodeType !== 3) return null
    const prose = node.parentElement?.closest('.ms-prose')
    if (!prose) return null
    const position = textOffsetOf(prose, node, offset)
    if (position < 0) return null
    const text = prose.textContent || ''
    for (const highlight of highlights) {
      if (highlight.sceneId !== prose.dataset.prose || !highlight.quote) continue
      const index = highlightIndex(highlight, text)
      if (index !== -1 && position >= index && position <= index + highlight.quote.length) return highlight
    }
    return null
  }

  const jumpToHighlight = (highlight) => {
    const section = sectionRefs.current.get(highlight.sceneId)
    const scroller = scrollRef.current
    if (!section || !scroller) return
    spyLockUntil.current = Date.now() + 900
    const rect = highlightRange(highlight)?.getBoundingClientRect()
    if (rect && rect.height) {
      scroller.scrollTo({
        top: scroller.scrollTop + rect.top - scroller.getBoundingClientRect().top - 160,
        behavior: 'smooth',
      })
    } else {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    section.classList.add('flash')
    setTimeout(() => section.classList.remove('flash'), 1400)
    onActiveSceneChange(highlight.sceneId)
  }

  const sceneTitleOf = (id) => {
    for (const chapter of state.chapters) {
      if (chapter.id === id) return chapter.title
      for (const scene of chapter.scenes) if (scene.id === id) return scene.title
    }
    return 'missing scene'
  }

  return {
    addHighlight,
    findHighlightAt,
    highlightRange,
    highlights,
    hlPop,
    jumpToHighlight,
    popAtRect,
    sceneTitleOf,
    setHlPop,
  }
}
