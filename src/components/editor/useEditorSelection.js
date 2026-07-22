import { useEffect, useRef, useState } from 'react'
import { countWords } from '../../store.jsx'
import { HIGHLIGHT_SELECTION_MAX_CHARS, proseOfNode } from './editorUtils.js'

const CODEX_SELECTION_MAX_CHARS = 60
const CODEX_SELECTION_MAX_WORDS = 6

export default function useEditorSelection() {
  const [selWords, setSelWords] = useState(0)
  const [selPop, setSelPop] = useState(null)
  const selTimer = useRef(null)

  useEffect(() => {
    const maybeShowPopover = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) {
        setSelPop(null)
        return
      }

      const raw = selection.toString()
      const trimmed = raw.trim()
      if (!trimmed) {
        setSelPop(null)
        return
      }

      const range = selection.getRangeAt(0)
      const startProse = proseOfNode(range.startContainer)
      const endProse = proseOfNode(range.endContainer)
      if (!startProse || startProse !== endProse) {
        setSelPop(null)
        return
      }

      const wordCount = countWords(trimmed)
      const text = trimmed.replace(/\s+/g, ' ')
      const isCodexName = text.length <= CODEX_SELECTION_MAX_CHARS &&
        wordCount <= CODEX_SELECTION_MAX_WORDS && !/[\r\n]/.test(trimmed)
      const isHighlight = !isCodexName && trimmed.length <= HIGHLIGHT_SELECTION_MAX_CHARS
      if (!isCodexName && !isHighlight) {
        setSelPop(null)
        return
      }

      const rects = [...range.getClientRects()].filter((rect) => rect.width || rect.height)
      const rect = isHighlight ? (rects[rects.length - 1] || range.getBoundingClientRect()) : range.getBoundingClientRect()
      if (!rect.width && !rect.height) {
        setSelPop(null)
        return
      }

      const x = Math.max(140, Math.min(rect.left + rect.width / 2, window.innerWidth - 140))
      setSelPop({ x, y: rect.top, text, wordCount, mode: isCodexName ? 'codex' : 'highlight' })
    }

    const onSelectionChange = () => {
      const selection = window.getSelection()
      setSelWords(selection && !selection.isCollapsed ? countWords(selection.toString()) : 0)
      clearTimeout(selTimer.current)
      selTimer.current = setTimeout(maybeShowPopover, 250)
    }

    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      clearTimeout(selTimer.current)
    }
  }, [])

  return { selPop, selWords, setSelPop }
}
