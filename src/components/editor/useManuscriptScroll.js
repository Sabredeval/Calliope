import { useCallback, useEffect, useRef, useState } from 'react'
import { chapterWords, countWords } from '../../store.jsx'

const WORDS_PER_PAGE = 250
const requestFrame = typeof window !== 'undefined' && window.requestAnimationFrame
  ? window.requestAnimationFrame.bind(window)
  : (callback) => setTimeout(callback, 0)
const cancelFrame = typeof window !== 'undefined' && window.cancelAnimationFrame
  ? window.cancelAnimationFrame.bind(window)
  : clearTimeout

export default function useManuscriptScroll({
  activeSceneId,
  onActiveSceneChange,
  progressRef,
  scrollRef,
  scrollReq,
  sectionRefs,
  spyLockUntil,
  state,
}) {
  const [msTicks, setMsTicks] = useState([])
  const [curPage, setCurPage] = useState(1)
  const ticksRef = useRef([])
  const tickFrame = useRef(null)
  const gapStyle = useRef(null)
  const lastGapCss = useRef('')
  const blockWordCache = useRef(new WeakMap())
  const pageMarks = state.settings.pageMarks || 'ticks'

  const updateReadingProgress = useCallback(() => {
    const scroller = scrollRef.current
    const fill = progressRef.current
    if (!scroller || !fill) return
    const scrollableHeight = scroller.scrollHeight - scroller.clientHeight
    const progress = scrollableHeight > 0
      ? Math.max(0, Math.min(1, scroller.scrollTop / scrollableHeight))
      : 0
    fill.style.transform = `scaleX(${progress})`
  }, [progressRef, scrollRef])

  useEffect(() => {
    if (!scrollReq?.id) return
    const element = sectionRefs.current.get(scrollReq.id)
    if (!element) return
    spyLockUntil.current = Date.now() + 900
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    element.classList.add('flash')
    const timer = setTimeout(() => element.classList.remove('flash'), 1400)
    return () => clearTimeout(timer)
  }, [scrollReq, sectionRefs, spyLockUntil])

  useEffect(() => {
    const frame = requestFrame(updateReadingProgress)
    window.addEventListener('resize', updateReadingProgress)
    return () => {
      cancelFrame(frame)
      window.removeEventListener('resize', updateReadingProgress)
    }
  }, [state.chapters, updateReadingProgress])

  const onScroll = () => {
    updateReadingProgress()
    if (Date.now() < spyLockUntil.current) return
    const container = scrollRef.current
    if (!container) return
    const probe = container.getBoundingClientRect().top + 130
    let best = null
    for (const [id, element] of sectionRefs.current) {
      const rect = element.getBoundingClientRect()
      if (rect.top <= probe && rect.bottom > probe - 40) {
        best = id
        break
      }
      if (rect.top <= probe) best = id
    }
    if (best && best !== activeSceneId) onActiveSceneChange(best)
  }

  const registerSection = (id) => (element) => {
    if (element) sectionRefs.current.set(id, element)
    else sectionRefs.current.delete(id)
  }

  useEffect(() => {
    const style = document.createElement('style')
    document.head.appendChild(style)
    gapStyle.current = style
    return () => {
      if (tickFrame.current !== null) cancelFrame(tickFrame.current)
      style.remove()
    }
  }, [])

  const computeTicks = useCallback(() => {
    const documentElement = scrollRef.current?.querySelector('.ms-doc')
    if (!documentElement) return

    const rules = []
    const tickDefinitions = []
    const chaptersWithContent = new Set()
    let words = 0
    let nextPage = 2
    for (const prose of documentElement.querySelectorAll('.ms-prose')) {
      const proseId = prose.dataset.prose
      const chapterElement = prose.closest('.ms-chapter')
      let childIndex = 0
      for (const block of prose.children) {
        childIndex += 1
        const text = block.textContent || ''
        const cached = blockWordCache.current.get(block)
        const wordCount = cached?.text === text ? cached.words : countWords(text)
        if (!cached || cached.text !== text) blockWordCache.current.set(block, { text, words: wordCount })
        if (!wordCount) continue

        const atChapterStart = chapterElement && !chaptersWithContent.has(chapterElement)
        if (chapterElement) chaptersWithContent.add(chapterElement)
        if (atChapterStart && words > 0) {
          words = Math.ceil(words / WORDS_PER_PAGE) * WORDS_PER_PAGE
          nextPage = words / WORDS_PER_PAGE + 1
        }

        const wordsAfterBlock = words + wordCount
        let stack = 0
        let crossed = false
        while (wordsAfterBlock >= (nextPage - 1) * WORDS_PER_PAGE) {
          const fraction = stack === 0
            ? 0
            : Math.min(0.96, ((nextPage - 1) * WORDS_PER_PAGE - words) / wordCount)
          tickDefinitions.push({
            n: nextPage,
            el: block,
            frac: fraction,
            mid: stack > 0,
            hidden: atChapterStart && stack === 0,
          })
          crossed = true
          nextPage += 1
          stack += 1
        }
        if (crossed && proseId && !atChapterStart) {
          rules.push(`.ms-doc [data-prose="${proseId}"] > *:nth-child(${childIndex}) { margin-top: var(--pg-gap, 48px) !important; }`)
        }
        words = wordsAfterBlock
      }
    }

    const nextGapCss = pageMarks === 'lines' ? rules.join('\n') : ''
    if (gapStyle.current && lastGapCss.current !== nextGapCss) {
      gapStyle.current.textContent = nextGapCss
      lastGapCss.current = nextGapCss
    }

    const documentTop = documentElement.getBoundingClientRect().top
    const rects = new Map()
    const ticks = tickDefinitions.map((definition) => {
      let rect = rects.get(definition.el)
      if (!rect) {
        rect = definition.el.getBoundingClientRect()
        rects.set(definition.el, rect)
      }
      return {
        n: definition.n,
        y: Math.round(rect.top - documentTop + definition.frac * rect.height),
        mid: definition.mid || false,
        hidden: definition.hidden || false,
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
  }, [pageMarks, scrollRef])

  const scheduleTickComputation = useCallback(() => {
    if (tickFrame.current !== null) cancelFrame(tickFrame.current)
    tickFrame.current = requestFrame(() => {
      tickFrame.current = null
      computeTicks()
    })
  }, [computeTicks])

  useEffect(() => {
    scheduleTickComputation()
  }, [
    scheduleTickComputation,
    state.chapters,
    state.groups,
    state.settings.align,
    state.settings.fontSize,
    state.settings.marginX,
    state.settings.pageMarkPadding,
    state.settings.pageSize,
    state.settings.para,
  ])

  useEffect(() => {
    const element = scrollRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(scheduleTickComputation)
    observer.observe(element)
    return () => observer.disconnect()
  }, [scheduleTickComputation, scrollRef])

  const totalMsPages = Math.max(
    1,
    state.chapters.reduce((total, chapter) => total + Math.ceil(chapterWords(chapter) / WORDS_PER_PAGE), 0)
  )

  const updateCurPage = () => {
    const container = scrollRef.current
    const documentElement = container?.querySelector('.ms-doc')
    if (!container || !documentElement) return
    const probe = container.getBoundingClientRect().top + 150 - documentElement.getBoundingClientRect().top
    let page = 1
    for (const tick of ticksRef.current) {
      if (tick.y <= probe) page = tick.n
      else break
    }
    setCurPage(page)
  }

  const goToPage = (page) => {
    const container = scrollRef.current
    const documentElement = container?.querySelector('.ms-doc')
    if (!container || !documentElement) return
    spyLockUntil.current = Date.now() + 900
    if (page <= 1) {
      container.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const tick = ticksRef.current.find((item) => item.n === page) || ticksRef.current[ticksRef.current.length - 1]
    if (!tick) return
    const documentTop = documentElement.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
    container.scrollTo({ top: documentTop + tick.y - 130, behavior: 'smooth' })
  }

  const promptGoToPage = () => {
    const value = window.prompt(`Go to manuscript page (1–${totalMsPages})`, String(curPage))
    if (!value) return
    const page = parseInt(value, 10)
    if (Number.isFinite(page)) goToPage(Math.max(1, Math.min(totalMsPages, page)))
  }

  return {
    curPage,
    msTicks,
    onScroll,
    promptGoToPage,
    registerSection,
    totalMsPages,
    updateCurPage,
  }
}
