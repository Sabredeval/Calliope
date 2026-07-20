import React from 'react'
import { SCENE_STATUSES } from '../../store.jsx'

const TOOLS = [
  { cmd: 'bold', icon: 'B', title: 'Bold (Ctrl+B)', style: { fontWeight: 700 } },
  { cmd: 'italic', icon: 'I', title: 'Italic (Ctrl+I)', style: { fontStyle: 'italic' } },
  { cmd: 'underline', icon: 'U', title: 'Underline (Ctrl+U)', style: { textDecoration: 'underline' } },
  { cmd: 'strikeThrough', icon: 'S', title: 'Strikethrough', style: { textDecoration: 'line-through' } },
]

function MarkerIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
      <path d="m12.2 3.2 4.6 4.6-7.6 7.6H4.6v-4.6z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m10.4 5 4.6 4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 17.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default function EditorToolbar({
  active, activeTitle, addHighlight, dispatch, focusMode, formatBlock,
  highlightOn, onToggleFocus, onToggleMentions, showMentions, statusOf,
}) {
  const exec = (command) => document.execCommand(command, false)
  const keepSelection = (event) => event.preventDefault()

  return (
    <div className="toolbar ms-toolbar">
      {TOOLS.map((tool) => (
        <button key={tool.cmd} className="tool-btn" title={tool.title} style={tool.style} onMouseDown={keepSelection} onClick={() => exec(tool.cmd)}>
          {tool.icon}
        </button>
      ))}
      <span className="tool-sep" />
      <button className="tool-btn" title="Heading" onMouseDown={keepSelection} onClick={() => formatBlock('h2')}>H</button>
      <button className="tool-btn" title="Blockquote" onMouseDown={keepSelection} onClick={() => formatBlock('blockquote')}>❝</button>
      <button className="tool-btn" title="Scene break (horizontal rule)" onMouseDown={keepSelection} onClick={() => exec('insertHorizontalRule')}>—</button>
      <button className="tool-btn" title="New chapter" onMouseDown={keepSelection} onClick={() => dispatch({ type: 'chapter/add' })}>+</button>
      <span className="tool-sep" />
      <button className="tool-btn" title="Undo (Ctrl+Z)" onMouseDown={keepSelection} onClick={() => exec('undo')}>↩</button>
      <button className="tool-btn" title="Redo (Ctrl+Y)" onMouseDown={keepSelection} onClick={() => exec('redo')}>↪</button>
      <button className="tool-btn" title="Clear formatting" onMouseDown={keepSelection} onClick={() => exec('removeFormat')}>⌫</button>

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
              onChange={(event) => dispatch({ type: 'scene/update', id: active.scene.id, patch: { status: event.target.value } })}
              title="Status of the current scene"
            >
              {SCENE_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
            </select>
          )}
        </>
      )}
      <button className="tool-btn" title="Highlight selection & add comment" onMouseDown={keepSelection} onClick={addHighlight}><MarkerIcon /></button>
      <button
        className={`tool-btn ${highlightOn ? 'toggled' : ''}`}
        title={highlightOn ? 'Hide codex mention underlines' : 'Underline codex mentions in the text'}
        onClick={() => dispatch({ type: 'settings/update', patch: { highlightCodex: !highlightOn } })}
      >
        <span className="hl-icon">A</span>
      </button>
      <button className="tool-btn" title={focusMode ? 'Exit focus mode (Esc)' : 'Focus mode'} onClick={onToggleFocus}>{focusMode ? '⤡' : '⤢'}</button>
      <button className="tool-btn" title={showMentions ? 'Hide codex panel' : 'Show codex panel'} onClick={onToggleMentions}>📚</button>
    </div>
  )
}
