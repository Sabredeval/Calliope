import React from 'react'
import { CODEX_TYPES, SCENE_STATUSES } from '../../store.jsx'

const typeIcon = (type) => CODEX_TYPES.find((entryType) => entryType.id === type)?.icon || '📄'

export default function EditorInspector({
  active, activeId, activeTitle, activeWords, dispatch, highlights, inspectorTab,
  jumpToHighlight, mentions, onOpenCodexEntry, panelEntryId, sceneOrder,
  sceneTitleOf, setInspectorTab, setPanelEntryId, state,
}) {
  const panelEntry = state.codex.find((entry) => entry.id === panelEntryId)
  const tabs = (
    <div className="insp-tabs">
      <button className={inspectorTab === 'codex' ? 'active' : ''} onClick={() => setInspectorTab('codex')}>Codex</button>
      <button className={inspectorTab === 'highlights' ? 'active' : ''} onClick={() => setInspectorTab('highlights')}>Highlights</button>
      <button className={inspectorTab === 'scene' ? 'active' : ''} onClick={() => setInspectorTab('scene')}>Scene</button>
    </div>
  )

  if (inspectorTab === 'highlights') {
    const sortedHighlights = [...highlights].sort(
      (a, b) => (sceneOrder.get(a.sceneId) ?? 999) - (sceneOrder.get(b.sceneId) ?? 999) || (a.createdAt || 0) - (b.createdAt || 0)
    )
    return (
      <aside className="mentions-panel inspector">
        {tabs}
        {sortedHighlights.length === 0 ? (
          <p className="mentions-empty">No highlights yet. Select a passage in the manuscript and press the marker button in the toolbar — then click the highlighted text to comment.</p>
        ) : (
          <div className="insp-hl-list">
            {sortedHighlights.map((highlight) => (
              <div className="bm-row" key={highlight.id}>
                <span className="hl-swatch" style={{ background: highlight.color }} />
                <button className="bm-jump" onClick={() => jumpToHighlight(highlight)} title={highlight.quote}>
                  <span className="bm-name">“{highlight.quote.length > 40 ? `${highlight.quote.slice(0, 40)}…` : highlight.quote}”</span>
                  {highlight.comment && <span className="bm-comment">{highlight.comment}</span>}
                  <span className="bm-context">{sceneTitleOf(highlight.sceneId)}</span>
                </button>
                <button className="mini-icon danger" title="Delete highlight" onClick={() => dispatch({ type: 'hl/delete', id: highlight.id })}>✕</button>
              </div>
            ))}
          </div>
        )}
      </aside>
    )
  }

  if (inspectorTab === 'scene') {
    return (
      <aside className="mentions-panel inspector">
        {tabs}
        {!active ? <p className="mentions-empty">Click into a scene to inspect it.</p> : (
          <div className="insp-scene">
            <label className="field">
              <span className="field-label">{active.kind === 'scene' ? 'Scene title' : 'Chapter title'}</span>
              <input
                value={activeTitle}
                onChange={(event) => dispatch({
                  type: active.kind === 'scene' ? 'scene/update' : 'chapter/update',
                  id: activeId,
                  patch: { title: event.target.value },
                })}
              />
            </label>

            {active.kind === 'scene' && (
              <>
                <label className="field">
                  <span className="field-label">Status</span>
                  <select value={active.scene.status} onChange={(event) => dispatch({ type: 'scene/update', id: activeId, patch: { status: event.target.value } })}>
                    {SCENE_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Summary</span>
                  <textarea
                    rows={5}
                    value={active.scene.summary || ''}
                    placeholder="What happens here? Used in the outline and export."
                    onChange={(event) => dispatch({ type: 'scene/update', id: activeId, patch: { summary: event.target.value } })}
                  />
                </label>
              </>
            )}
            <p className="insp-meta">{activeWords.toLocaleString()} words{active.kind === 'scene' ? <> · in <strong>{active.chapter.title}</strong></> : ' · written as flowing chapter'}</p>
          </div>
        )}
      </aside>
    )
  }

  if (panelEntry) {
    const relationships = (state.relationships || []).filter((relationship) => relationship.fromId === panelEntry.id || relationship.toId === panelEntry.id)
    const nameOf = (id) => state.codex.find((entry) => entry.id === id)?.name || '?'
    const typeMeta = CODEX_TYPES.find((entryType) => entryType.id === panelEntry.type)
    return (
      <aside className="mentions-panel inspector">
        {tabs}
        <div className="panel-entry-head">
          <button className="mini-btn" onClick={() => setPanelEntryId(null)}>← Back</button>
          <span className="foot-spacer" />
          <button className="mini-btn" onClick={() => { setPanelEntryId(null); onOpenCodexEntry(panelEntry.id) }}>Edit in codex →</button>
        </div>
        <div className="detail-hero" style={{ '--hero': panelEntry.color }}>
          <span className="hero-type">{typeIcon(panelEntry.type)} {typeMeta?.label}</span>
          <h2 className="hero-name">{panelEntry.name}</h2>
          {panelEntry.aliases?.length > 0 && <p className="hero-aliases">also known as {panelEntry.aliases.join(' · ')}</p>}
        </div>
        <div className="detail-read">
          {panelEntry.oneLiner && <p className="read-lede">{panelEntry.oneLiner}</p>}
          {panelEntry.description ? panelEntry.description.split(/\n+/).map((paragraph, index) => <p key={index} className="read-para">{paragraph}</p>) : <p className="read-empty">No description yet.</p>}
          {panelEntry.notes && <div className="read-notes"><span className="read-notes-label">Private notes</span>{panelEntry.notes.split(/\n+/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
          {panelEntry.tags?.length > 0 && <div className="card-tags">{panelEntry.tags.map((tag) => <span key={tag} className="tag-chip small">{tag}</span>)}</div>}
          {relationships.length > 0 && (
            <div className="field">
              <span className="field-label">Relationships</span>
              <div className="rel-list">
                {relationships.map((relationship) => {
                  const outgoing = relationship.fromId === panelEntry.id
                  const otherId = outgoing ? relationship.toId : relationship.fromId
                  return <div key={relationship.id} className="rel-row"><span className="rel-dir">{relationship.directed ? (outgoing ? '→' : '←') : '—'}</span><button className="rel-name" onClick={() => setPanelEntryId(otherId)} title="Read entry">{nameOf(otherId)}</button><span className="rel-label">{relationship.label}</span></div>
                })}
              </div>
            </div>
          )}
        </div>
      </aside>
    )
  }

  return (
    <aside className="mentions-panel inspector">
      {tabs}
      <div className="mentions-head"><span>In this scene</span></div>
      {!active ? <p className="mentions-empty">Click into a scene to see which codex entries appear in it.</p> : mentions.length === 0 ? (
        <p className="mentions-empty">No codex entries detected in “{activeTitle}” yet. As you write names from your codex (or their aliases), they'll appear here.</p>
      ) : (
        <div className="mentions-list">
          {mentions.map(({ entry, count }) => (
            <button key={entry.id} className="mention-card" onClick={() => setPanelEntryId(entry.id)} title="Read here">
              <span className="mention-swatch" style={{ background: entry.color }} />
              <span className="mention-body"><span className="mention-name">{typeIcon(entry.type)} {entry.name}</span>{entry.oneLiner && <span className="mention-desc">{entry.oneLiner}</span>}</span>
              <span className="mention-count">×{count}</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  )
}
