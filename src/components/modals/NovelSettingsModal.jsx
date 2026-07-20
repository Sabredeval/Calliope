import React from 'react'
import { useStore } from '../../store.jsx'

export default function NovelSettingsModal({ onClose }) {
  const { state, dispatch } = useStore()
  const patch = (p) => dispatch({ type: 'novel/update', patch: p })

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

        <p className="settings-note">
          Appearance and layout options live in Settings (the gear at the bottom of the bar).
        </p>

        <div className="modal-actions">
          <button className="primary-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
