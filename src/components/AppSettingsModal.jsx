import React from 'react'
import { useStore } from '../store.jsx'

export default function AppSettingsModal({ onClose }) {
  const { state, dispatch } = useStore()
  const setSetting = (p) => dispatch({ type: 'settings/update', patch: p })

  const theme = state.settings.theme || 'dark'
  const navStyle = state.settings.navStyle || 'activitybar'
  const fontSize = state.settings.fontSize || 'medium'
  const align = state.settings.align || 'justify'
  const page = state.settings.page || 'paper'
  const para = state.settings.para || 'book'
  const layout = state.settings.layout || 'continuous'
  const pageSize = state.settings.pageSize || 'a4'

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal settings-modal">
        <h3>Settings</h3>

        <h4 className="settings-section">Interface</h4>

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

        <h4 className="settings-section">Editor</h4>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Text size</span>
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
          <span className="field-label">Paragraphs</span>
          <select value={para} onChange={(e) => setSetting({ para: e.target.value })}>
            <option value="book">Book (first-line indent)</option>
            <option value="block">Block (no indents)</option>
          </select>
        </label>

        <h4 className="settings-section">Page</h4>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Layout</span>
            <select value={layout} onChange={(e) => setSetting({ layout: e.target.value })}>
              <option value="continuous">Continuous (one long page)</option>
              <option value="pages">Book pages (sheet per chapter)</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Page size</span>
            <select value={pageSize} onChange={(e) => setSetting({ pageSize: e.target.value })}>
              <option value="a4">A4 (210 × 297 mm)</option>
              <option value="book">Trade book (6 × 9 in)</option>
            </select>
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Page style</span>
            <select value={page} onChange={(e) => setSetting({ page: e.target.value })}>
              <option value="paper">Paper (sheet with margins)</option>
              <option value="flat">Flat (plain column, no sheet)</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Page marks</span>
            <select
              value={state.settings.pageMarks || 'ticks'}
              onChange={(e) => setSetting({ pageMarks: e.target.value })}
            >
              <option value="ticks">Margin ticks (subtle)</option>
              <option value="lines">Full-width lines</option>
            </select>
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Page line padding (px)</span>
            <input
              type="number"
              min="0"
              max="200"
              value={state.settings.pageMarkPadding ?? ''}
              placeholder="48"
              onChange={(e) => setSetting({ pageMarkPadding: e.target.value ? Number(e.target.value) : null })}
            />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Margin — sides (px)</span>
            <input
              type="number"
              min="24"
              max="220"
              value={state.settings.marginX || ''}
              placeholder={pageSize === 'book' ? '60' : '92'}
              onChange={(e) => setSetting({ marginX: e.target.value ? Number(e.target.value) : null })}
            />
          </label>

          <label className="field">
            <span className="field-label">Margin — top/bottom (px)</span>
            <input
              type="number"
              min="24"
              max="220"
              value={state.settings.marginY || ''}
              placeholder={pageSize === 'book' ? '68' : '88'}
              onChange={(e) => setSetting({ marginY: e.target.value ? Number(e.target.value) : null })}
            />
          </label>
        </div>

        <p className="settings-note">
          Settings apply to this novel and are saved automatically.
        </p>

        <div className="modal-actions">
          <button className="primary-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
