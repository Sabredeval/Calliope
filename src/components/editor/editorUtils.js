export const HL_COLORS = ['#f5d76e', '#7ed491', '#f2a1c0', '#8ab8f5']

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const PAGE_JUNK = /^(?:page\s+)?\d+$/i

// Keep paste content plain, while retaining meaningful paragraph boundaries.
export const toParagraphs = (text) => {
  const normalized = text.replace(/\r/g, '')
  if (/\n[ \t]*\n/.test(normalized)) {
    return normalized
      .split(/\n[ \t]*\n+/)
      .map((paragraph) => paragraph.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  }
  return normalized
    .split(/\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph && !PAGE_JUNK.test(paragraph))
}

export const handleProsePaste = (event) => {
  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain')
  if (!text) return
  const paragraphs = toParagraphs(text)
  if (!paragraphs.length) return
  if (paragraphs.length === 1) {
    document.execCommand('insertText', false, paragraphs[0])
  } else {
    document.execCommand('insertHTML', false, paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join(''))
  }
}

// Map [start, end) plain-text offsets inside an element to a DOM Range.
export const rangeFromTextOffsets = (root, start, end) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let node
  let position = 0
  let started = false
  while ((node = walker.nextNode())) {
    const nextPosition = position + node.length
    if (!started && start < nextPosition) {
      range.setStart(node, Math.max(0, start - position))
      started = true
    }
    if (started && end <= nextPosition) {
      range.setEnd(node, end - position)
      return range
    }
    position = nextPosition
  }
  return null
}

export const caretNearPoint = (node, offset, x, y) => {
  if (!node || node.nodeType !== 3) return false
  try {
    const length = node.length
    if (!length) return false
    const index = Math.min(Math.max(0, offset), length - 1)
    const range = document.createRange()
    range.setStart(node, index)
    range.setEnd(node, index + 1)
    const rect = range.getBoundingClientRect()
    if (!rect || (!rect.width && !rect.height)) return false
    return y >= rect.top - 4 && y <= rect.bottom + 4 && x >= rect.left - 14 && x <= rect.right + 14
  } catch {
    return false
  }
}

export const textOffsetOf = (root, node, offset) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current
  let position = 0
  while ((current = walker.nextNode())) {
    if (current === node) return position + offset
    position += current.length
  }
  return -1
}
