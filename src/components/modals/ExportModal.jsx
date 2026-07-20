import React, { useState } from 'react'
import { useStore, plainText, novelWords, buildManuscriptTree, CODEX_TYPES } from '../../store.jsx'

function htmlToMarkdown(html) {
  const div = document.createElement('div')
  div.innerHTML = html || ''
  const walk = (node) => {
    let out = ''
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) { out += child.textContent; continue }
      const tag = child.tagName?.toLowerCase()
      const inner = walk(child)
      switch (tag) {
        case 'p': case 'div': out += inner + '\n\n'; break
        case 'br': out += '\n'; break
        case 'h1': out += `# ${inner}\n\n`; break
        case 'h2': out += `## ${inner}\n\n`; break
        case 'h3': out += `### ${inner}\n\n`; break
        case 'strong': case 'b': out += `**${inner}**`; break
        case 'em': case 'i': out += `*${inner}*`; break
        case 'u': out += inner; break
        case 's': case 'strike': case 'del': out += `~~${inner}~~`; break
        case 'blockquote': out += inner.split('\n').filter(Boolean).map((l) => `> ${l}`).join('\n') + '\n\n'; break
        case 'hr': out += '\n* * *\n\n'; break
        case 'li': out += `- ${inner}\n`; break
        default: out += inner
      }
    }
    return out
  }
  return walk(div).replace(/\n{3,}/g, '\n\n').trim()
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

const slug = (s) => (s || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export default function ExportModal({ onClose }) {
  const { state } = useStore()
  const [format, setFormat] = useState('md')
  const [includeSummaries, setIncludeSummaries] = useState(false)
  const [includeCodex, setIncludeCodex] = useState(false)

  const buildManuscript = () => {
    const md = format === 'md'
    const headingPrefix = (depth) => '#'.repeat(Math.min(depth + 2, 6))
    const lines = []
    lines.push(md ? `# ${state.novel.title || 'Untitled'}` : (state.novel.title || 'Untitled').toUpperCase())
    if (state.novel.author) lines.push(md ? `*by ${state.novel.author}*` : `by ${state.novel.author}`)
    lines.push('')

    const walk = (node, depth) => {
      if (node.type === 'group') {
        lines.push(md ? `${headingPrefix(depth)} ${node.group.title}` : `\n${node.group.title.toUpperCase()}\n`)
        lines.push('')
        for (const child of node.children) walk(child, depth + 1)
        return
      }
      const ch = node.chapter
      lines.push(md ? `${headingPrefix(depth)} ${ch.title}` : `\n${ch.title.toUpperCase()}\n`)
      lines.push('')
      if (ch.scenes.length) {
        ch.scenes.forEach((sc, i) => {
          if (includeSummaries && sc.summary) lines.push(md ? `> _${sc.summary}_\n` : `[${sc.summary}]\n`)
          const body = md ? htmlToMarkdown(sc.content) : plainText(sc.content)
          lines.push(body)
          if (i < ch.scenes.length - 1) lines.push(md ? '\n* * *\n' : '\n* * *\n')
        })
      } else {
        lines.push(md ? htmlToMarkdown(ch.content) : plainText(ch.content))
      }
      lines.push('')
    }

    for (const node of buildManuscriptTree(state.chapters, state.groups)) walk(node, 0)

    if (includeCodex && state.codex.length) {
      lines.push(md ? '## Appendix: Codex' : '\nAPPENDIX: CODEX\n')
      for (const t of CODEX_TYPES) {
        const of = state.codex.filter((e) => e.type === t.id)
        if (!of.length) continue
        lines.push(md ? `### ${t.plural}` : `\n${t.plural}\n`)
        for (const e of of) {
          const alias = e.aliases?.length ? ` (aka ${e.aliases.join(', ')})` : ''
          lines.push(md ? `**${e.name}**${alias} — ${e.oneLiner || ''}` : `${e.name}${alias} — ${e.oneLiner || ''}`)
          if (e.description) lines.push(e.description)
          lines.push('')
        }
      }
    }
    return lines.join('\n')
  }

  const doExport = () => {
    const ext = format === 'md' ? 'md' : 'txt'
    download(`${slug(state.novel.title)}.${ext}`, buildManuscript())
    onClose()
  }

  const words = novelWords(state.chapters)
  const scenes = state.chapters.reduce((n, c) => n + c.scenes.length, 0)

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal export-modal">
        <h3>Export manuscript</h3>
        <p className="export-stats">
          {state.chapters.length} chapters · {scenes} scenes · {words.toLocaleString()} words
        </p>

        <div className="field">
          <span className="field-label">Format</span>
          <div className="radio-row">
            <label><input type="radio" checked={format === 'md'} onChange={() => setFormat('md')} /> Markdown (.md)</label>
            <label><input type="radio" checked={format === 'txt'} onChange={() => setFormat('txt')} /> Plain text (.txt)</label>
          </div>
        </div>

        <div className="field">
          <label className="check-row">
            <input type="checkbox" checked={includeSummaries} onChange={(e) => setIncludeSummaries(e.target.checked)} />
            Include scene summaries
          </label>
          <label className="check-row">
            <input type="checkbox" checked={includeCodex} onChange={(e) => setIncludeCodex(e.target.checked)} />
            Include codex as appendix
          </label>
        </div>

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={doExport}>Download</button>
        </div>
      </div>
    </div>
  )
}
