import React from 'react'
import { useStore } from '../store.jsx'

export default function NovelSettingsModal({ onClose }) {
  const { state, dispatch } = useStore()
  const patch = (p) => dispatch({ type: 'novel/update', patch: p })
  const setSetting = (p) => dispatch({ type: 'settings/update', patch: p })
  const theme = state.settings.theme || 'dark'
  const navStyle = state.settings.navStyle || 'activitybar'
  const fontSize = state.settings.fontSize || 'medium'
  const align = state.settings.align || 'justify'
  const page = state.settings.page || 'paper'

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal settings-modal">
        <h3>Novel details</h3>

        <label className="field">
          <span className="field-label">Title</span>
          <input value={state.novel.title} placeholder="Working title" onChange={(e) => patch({ title: e.target.value })} />
        </label>

        <label className="field">
          <span className="field-label">Author</span>
          <input value={state.novel.author} placeholder="Your name or pen name" onChange={(e) => patch({ author: e.target.value })} />
        </label>

        <label className="field">
          <span className="field-label">Word count goal</span>
          <input
            type="number"
            min="0"
            step="1000"
            value={state.novel.wordGoal || ''}
            placeholder="e.g. 80000"
            onChange={(e) => patch({ wordGoal: e.target.value ? Number(e.target.value) : 0 })}
          />
        </label>

        <h4 className="settings-section">Appearance</h4>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Theme</span>
            <select value={theme} onChange={(e) => setSetting({ theme: e.target.value })}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="parchment">Parchment</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Navigation</span>
            <select value={navStyle} onChange={(e) => setSetting({ navStyle: e.target.value })}>
              <option value="activitybar">Activity bar (left, icons)</option>
              <option value="topbar">Top bar (labels)</option>
            </select>
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Editor text size</span>
            <select value={fontSize} onChange={(e) => setSetting({ fontSize: e.target.value })}>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Text alignment</span>
            <select value={align} onChange={(e) => setSetting({ align: e.target.value })}>
              <option value="justify">Justified</option>
              <option value="left">Left-aligned</option>
            </select>
          </label>
        </div>

        <label className="field">
          <span className="field-label">Page style</span>
          <select value={page} onChange={(e) => setSetting({ page: e.target.value })}>
            <option value="paper">A4 paper (sheet with margins)</option>
            <option value="flat">Flat (plain column, no sheet)</option>
          </select>
        </label>

        <p className="settings-note">
          Everything is saved automatically in your browser. Use Export (⇩) to download your manuscript.
        </p>

        <div className="modal-actions">
          <button className="primary-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
