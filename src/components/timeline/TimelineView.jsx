import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { useStore, uid, CODEX_COLORS, CODEX_TYPES } from '../../store.jsx'

const GUTTER = 140      // px reserved for track labels
const AXIS_H = 40
const ROW_H = 36
const TRACK_PAD = 10
const MIN_PPU = 0.002
const MAX_PPU = 4000

function niceStep(ppu) {
  const target = 90 / ppu // time units per ~90px
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(target, 1e-9))))
  for (const m of [1, 2, 5, 10]) if (m * pow >= target) return m * pow
  return 10 * pow
}

const fmt = (t) => {
  const r = Math.round(t * 100) / 100
  return r.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

const snapTo = (v, snap) => Number((Math.round(v / snap) * snap).toFixed(4))

/* ---------- detail editor panel ---------- */

function ItemDetail({ item, onClose, onOpenScene, onOpenCodexEntry }) {
  const { state, dispatch } = useStore()
  const tl = state.timeline
  const patch = (p) => dispatch({ type: 'timeline/item/update', id: item.id, patch: p })

  const linkValue = item.linkKind && item.linkId ? `${item.linkKind}:${item.linkId}` : ''
  const setLink = (v) => {
    if (!v) return patch({ linkKind: null, linkId: null })
    const [linkKind, linkId] = v.split(':')
    patch({ linkKind, linkId })
  }
  const openLink = () => {
    if (item.linkKind === 'scene') onOpenScene(item.linkId)
    if (item.linkKind === 'codex') onOpenCodexEntry(item.linkId)
  }
  const linkTargetExists =
    (item.linkKind === 'scene' && state.chapters.some((c) => c.scenes.some((s) => s.id === item.linkId))) ||
    (item.linkKind === 'codex' && state.codex.some((e) => e.id === item.linkId))

  return (
    <aside className="tl-detail">
      <div className="detail-head">
        <span className="detail-swatch" style={{ background: item.color }} />
        <input
          className="detail-name"
          value={item.title}
          placeholder="Title"
          onChange={(e) => patch({ title: e.target.value })}
        />
        <button className="icon-btn" title="Close" onClick={onClose}>✕</button>
      </div>

      <div className="detail-body">
        <div className="field-row">
          <label className="field">
            <span className="field-label">Kind</span>
            <select
              value={item.kind}
              onChange={(e) => {
                const kind = e.target.value
                patch(kind === 'event' ? { kind, end: null } : { kind, end: item.end ?? item.start + 10 })
              }}
            >
              <option value="event">◆ Event</option>
              <option value="span">▬ Span</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Track</span>
            <select value={item.trackId} onChange={(e) => patch({ trackId: e.target.value })}>
              {tl.tracks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Start ({tl.unit || 'time'})</span>
            <input
              type="number"
              value={item.start}
              onChange={(e) => patch({ start: Number(e.target.value) })}
            />
          </label>
          {item.kind === 'span' && (
            <label className="field">
              <span className="field-label">End</span>
              <input
                type="number"
                value={item.end ?? ''}
                placeholder="ongoing"
                disabled={item.end == null}
                onChange={(e) => patch({ end: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </label>
          )}
        </div>

        {item.kind === 'span' && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={item.end == null}
              onChange={(e) => patch({ end: e.target.checked ? null : item.start + 10 })}
            />
            Ongoing (no end — extends to the edge of time)
          </label>
        )}

        <label className="field">
          <span className="field-label">Color</span>
          <div className="color-row">
            {CODEX_COLORS.map((c) => (
              <button
                key={c}
                className={`color-dot ${item.color === c ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => patch({ color: c })}
                title={c}
              />
            ))}
          </div>
        </label>

        <label className="field">
          <span className="field-label">Description</span>
          <textarea
            rows={5}
            value={item.description || ''}
            placeholder="What happens here? Why does it matter?"
            onChange={(e) => patch({ description: e.target.value })}
          />
        </label>

        <label className="field">
          <span className="field-label">Linked to</span>
          <select value={linkValue} onChange={(e) => setLink(e.target.value)}>
            <option value="">— nothing —</option>
            <optgroup label="Scenes">
              {state.chapters.map((ch) =>
                ch.scenes.map((s) => (
                  <option key={s.id} value={`scene:${s.id}`}>{ch.title} · {s.title}</option>
                ))
              )}
            </optgroup>
            <optgroup label="Codex">
              {state.codex.map((e) => {
                const t = CODEX_TYPES.find((c) => c.id === e.type)
                return <option key={e.id} value={`codex:${e.id}`}>{t?.icon} {e.name}</option>
              })}
            </optgroup>
          </select>
          {linkValue && linkTargetExists && (
            <button className="mini-btn link-open" onClick={openLink}>
              Open {item.linkKind === 'scene' ? 'scene' : 'codex entry'} →
            </button>
          )}
        </label>

        <button
          className="danger-btn"
          onClick={() => {
            if (window.confirm(`Delete "${item.title}" from the timeline?`)) {
              dispatch({ type: 'timeline/item/delete', id: item.id })
              onClose()
            }
          }}
        >
          Delete item
        </button>
      </div>
    </aside>
  )
}

/* ---------- main view ---------- */

export default function TimelineView({ onOpenScene, onOpenCodexEntry }) {
  const { state, dispatch } = useStore()
  const tl = state.timeline

  const scrollRef = useRef(null)
  const svgRef = useRef(null)
  const [width, setWidth] = useState(0)
  const [view, setView] = useState(null) // { t0, ppu }
  const viewRef = useRef(view)
  viewRef.current = view
  const [selectedId, setSelectedId] = useState(null)
  const [hover, setHover] = useState(null) // { x, y, item }
  const [cursorT, setCursorT] = useState(null)
  const dragRef = useRef(null)

  /* measure */
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const timeExtent = useCallback(() => {
    const items = tl.items
    if (!items.length) return [0, 100]
    let min = Infinity, max = -Infinity
    for (const i of items) {
      min = Math.min(min, i.start)
      max = Math.max(max, i.end ?? i.start)
    }
    if (!isFinite(min)) return [0, 100]
    if (max - min < 1) { min -= 5; max += 5 }
    return [min, max]
  }, [tl.items])

  const fit = useCallback(() => {
    if (!width) return
    const [min, max] = timeExtent()
    const range = max - min
    const pad = range * 0.08
    const usable = Math.max(width - GUTTER - 80, 100)
    const ppu = Math.min(MAX_PPU, Math.max(MIN_PPU, usable / (range + pad * 2)))
    setView({ t0: min - pad, ppu })
  }, [width, timeExtent])

  useEffect(() => { if (width && !view) fit() }, [width, view, fit])

  const xOf = useCallback((t) => GUTTER + (t - (view?.t0 ?? 0)) * (view?.ppu ?? 1), [view])
  const tOf = useCallback((x) => (view ? view.t0 + (x - GUTTER) / view.ppu : 0), [view])

  /* layout */
  const layout = useMemo(() => {
    if (!view) return { tracks: [], totalHeight: AXIS_H }
    let y = AXIS_H
    const tracks = tl.tracks.map((track, ti) => {
      const items = tl.items
        .filter((i) => i.trackId === track.id)
        .sort((a, b) => a.start - b.start || (b.end ?? b.start) - (a.end ?? a.start))
      const rows = []
      const placed = items.map((item) => {
        const x1 = xOf(item.start)
        const isSpan = item.kind === 'span'
        const rawX2 = isSpan ? (item.end == null ? width + 60 : xOf(item.end)) : x1
        const x2 = Math.max(rawX2, x1 + (isSpan ? 14 : 0))
        const labelW = (item.title || '').length * 6.6 + 26
        const labelInside = isSpan && x2 - x1 > labelW
        const left = isSpan ? x1 : x1 - 9
        const right = isSpan ? (labelInside ? x2 : x2 + labelW) : x1 + labelW
        let row = rows.findIndex((r) => left > r + 8)
        if (row === -1) { row = rows.length; rows.push(right) } else rows[row] = Math.max(rows[row], right)
        return { item, row, x1, x2, labelInside }
      })
      const height = Math.max(1, rows.length) * ROW_H + TRACK_PAD * 2
      const band = { track, y, height, placed, odd: ti % 2 === 1 }
      y += height
      return band
    })
    return { tracks, totalHeight: Math.max(y, 300) }
  }, [tl, view, width, xOf])

  /* zoom (non-passive wheel) */
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!viewRef.current) return
      e.preventDefault()
      const { t0, ppu } = viewRef.current
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18
      const ppu2 = Math.min(MAX_PPU, Math.max(MIN_PPU, ppu * factor))
      const t = t0 + (x - GUTTER) / ppu
      setView({ ppu: ppu2, t0: t - (x - GUTTER) / ppu2 })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomCenter = (factor) => {
    if (!view) return
    const x = GUTTER + (width - GUTTER) / 2
    const { t0, ppu } = view
    const ppu2 = Math.min(MAX_PPU, Math.max(MIN_PPU, ppu * factor))
    const t = t0 + (x - GUTTER) / ppu
    setView({ ppu: ppu2, t0: t - (x - GUTTER) / ppu2 })
  }

  /* pan + item drag */
  const beginDrag = (e, item = null) => {
    if (e.button !== 0 || !view) return
    e.preventDefault()
    if (item) e.stopPropagation()
    dragRef.current = {
      item,
      startX: e.clientX,
      t0: view.t0,
      origStart: item?.start,
      origEnd: item?.end,
      moved: false,
    }
    const onMove = (me) => {
      const d = dragRef.current
      if (!d) return
      const dx = me.clientX - d.startX
      if (Math.abs(dx) > 3) d.moved = true
      const { ppu } = viewRef.current
      if (!d.item) {
        setView((v) => ({ ...v, t0: d.t0 - dx / ppu }))
      } else {
        setHover(null)
        const snap = niceStep(ppu) / 10
        const dt = dx / ppu
        const start = snapTo(d.origStart + dt, snap)
        const patch = { start }
        if (d.item.kind === 'span' && d.origEnd != null) patch.end = snapTo(d.origEnd + dt, snap)
        dispatch({ type: 'timeline/item/update', id: d.item.id, patch })
      }
    }
    const onUp = () => {
      const d = dragRef.current
      if (d?.item && !d.moved) setSelectedId(d.item.id)
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /* add items */
  const addItem = (kind, at = null, trackId = null) => {
    if (!view || tl.tracks.length === 0) return
    const centerT = at ?? tOf(GUTTER + (width - GUTTER) / 2)
    const snap = niceStep(view.ppu) / 10
    const start = snapTo(centerT, snap)
    const item = {
      id: uid(),
      trackId: trackId || tl.tracks[0].id,
      kind,
      title: kind === 'event' ? 'New event' : 'New span',
      start,
      end: kind === 'span' ? snapTo(start + niceStep(view.ppu), snap) : null,
      color: CODEX_COLORS[tl.items.length % CODEX_COLORS.length],
      description: '',
    }
    dispatch({ type: 'timeline/item/add', item })
    setSelectedId(item.id)
  }

  const onDoubleClick = (e) => {
    if (!view) return
    const rect = scrollRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top + scrollRef.current.scrollTop
    if (x < GUTTER) return
    const band = layout.tracks.find((b) => y >= b.y && y < b.y + b.height)
    addItem('event', tOf(x), band?.track.id)
  }

  const onMouseMoveSvg = (e) => {
    const rect = scrollRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    setCursorT(x >= GUTTER && view ? tOf(x) : null)
  }

  /* ticks */
  const ticks = useMemo(() => {
    if (!view || !width) return []
    const step = niceStep(view.ppu)
    const tStart = view.t0
    const tEnd = tOf(width)
    const out = []
    for (let t = Math.ceil(tStart / step) * step; t <= tEnd; t += step) {
      out.push(Number(t.toFixed(6)))
      if (out.length > 200) break
    }
    return out
  }, [view, width, tOf])

  const selected = tl.items.find((i) => i.id === selectedId)

  const renameTrack = (track) => {
    const v = window.prompt('Track name', track.title)
    if (v?.trim()) dispatch({ type: 'timeline/track/update', id: track.id, patch: { title: v.trim() } })
  }
  const deleteTrack = (track) => {
    const n = tl.items.filter((i) => i.trackId === track.id).length
    if (window.confirm(`Delete track "${track.title}"${n ? ` and its ${n} item(s)` : ''}? This cannot be undone.`))
      dispatch({ type: 'timeline/track/delete', id: track.id })
  }

  return (
    <div className="tl-wrap">
      <div className="tl-main">
        <div className="tl-toolbar">
          <span className="tl-title">Timeline</span>
          <label className="tl-unit">
            unit
            <input
              value={tl.unit || ''}
              placeholder="e.g. Year"
              onChange={(e) => dispatch({ type: 'timeline/update', patch: { unit: e.target.value } })}
            />
          </label>
          <span className="toolbar-spacer" />
          <button className="ghost-btn slim" onClick={() => addItem('event')} disabled={!tl.tracks.length}>◆ Event</button>
          <button className="ghost-btn slim" onClick={() => addItem('span')} disabled={!tl.tracks.length}>▬ Span</button>
          <button className="ghost-btn slim" onClick={() => dispatch({ type: 'timeline/track/add' })}>+ Track</button>
          <span className="tool-sep" />
          <button className="icon-btn" title="Zoom out" onClick={() => zoomCenter(1 / 1.4)}>−</button>
          <button className="icon-btn" title="Zoom in" onClick={() => zoomCenter(1.4)}>+</button>
          <button className="ghost-btn slim" title="Fit everything" onClick={fit}>Fit</button>
        </div>

        <div
          className="tl-scroll"
          ref={scrollRef}
          onMouseDown={(e) => beginDrag(e)}
          onDoubleClick={onDoubleClick}
          onMouseMove={onMouseMoveSvg}
          onMouseLeave={() => { setCursorT(null); setHover(null) }}
        >
          {view && (
            <svg ref={svgRef} width={width} height={layout.totalHeight} className="tl-svg">
              {/* track bands */}
              {layout.tracks.map((b) =>
                b.odd ? (
                  <rect key={b.track.id} x="0" y={b.y} width={width} height={b.height} className="tl-band" />
                ) : null
              )}

              {/* gridlines + axis */}
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={xOf(t)} y1={AXIS_H} x2={xOf(t)} y2={layout.totalHeight} className="tl-grid" />
                  <text x={xOf(t)} y={AXIS_H - 12} className="tl-tick" textAnchor="middle">{fmt(t)}</text>
                </g>
              ))}
              <line x1="0" y1={AXIS_H} x2={width} y2={AXIS_H} className="tl-axis" />

              {/* cursor crosshair */}
              {cursorT != null && !dragRef.current && (
                <g className="tl-cursor">
                  <line x1={xOf(cursorT)} y1={AXIS_H} x2={xOf(cursorT)} y2={layout.totalHeight} />
                  <text x={xOf(cursorT) + 5} y={AXIS_H + 14}>{fmt(cursorT)}</text>
                </g>
              )}

              {/* items */}
              {layout.tracks.map((b) => (
                <g key={b.track.id}>
                  {b.placed.map(({ item, row, x1, x2, labelInside }) => {
                    const yTop = b.y + TRACK_PAD + row * ROW_H
                    const cy = yTop + ROW_H / 2
                    const isSel = item.id === selectedId
                    const common = {
                      className: `tl-item ${isSel ? 'selected' : ''}`,
                      onMouseDown: (e) => beginDrag(e, item),
                      onMouseEnter: (e) => setHover({ x: e.clientX, y: e.clientY, item }),
                      onMouseMove: (e) => setHover({ x: e.clientX, y: e.clientY, item }),
                      onMouseLeave: () => setHover(null),
                    }
                    if (item.kind === 'event') {
                      return (
                        <g key={item.id} {...common}>
                          <path
                            d={`M ${x1} ${cy - 8} L ${x1 + 8} ${cy} L ${x1} ${cy + 8} L ${x1 - 8} ${cy} Z`}
                            fill={item.color}
                            className="tl-diamond"
                          />
                          <text x={x1 + 13} y={cy + 4} className="tl-item-label">{item.title}</text>
                        </g>
                      )
                    }
                    const ongoing = item.end == null
                    const barY = cy - 11
                    return (
                      <g key={item.id} {...common}>
                        <rect
                          x={x1} y={barY} width={Math.max(x2 - x1, 14)} height={22}
                          rx={6} fill={item.color}
                          className={`tl-bar ${ongoing ? 'ongoing' : ''}`}
                        />
                        {ongoing && (
                          <text x={width - 26} y={cy + 4} className="tl-ongoing-arrow">⟶</text>
                        )}
                        {labelInside ? (
                          <text x={x1 + 10} y={cy + 4} className="tl-bar-label">{item.title}</text>
                        ) : (
                          <text x={x2 + 8} y={cy + 4} className="tl-item-label">{item.title}</text>
                        )}
                      </g>
                    )
                  })}
                </g>
              ))}
            </svg>
          )}

          {/* track label gutter */}
          <div className="tl-gutter" style={{ height: layout.totalHeight }}>
            <div className="tl-gutter-axis" style={{ height: AXIS_H }}>{tl.unit || 'time'}</div>
            {layout.tracks.map((b, i) => (
              <div key={b.track.id} className="tl-track-label" style={{ top: b.y, height: b.height }}>
                <span className="tl-track-name" title={b.track.title}>{b.track.title}</span>
                <span className="tl-track-actions">
                  <button className="mini-icon" title="Move up" disabled={i === 0} onClick={() => dispatch({ type: 'timeline/track/move', id: b.track.id, dir: -1 })}>↑</button>
                  <button className="mini-icon" title="Move down" disabled={i === layout.tracks.length - 1} onClick={() => dispatch({ type: 'timeline/track/move', id: b.track.id, dir: 1 })}>↓</button>
                  <button className="mini-icon" title="Rename" onClick={() => renameTrack(b.track)}>✎</button>
                  <button className="mini-icon danger" title="Delete track" onClick={() => deleteTrack(b.track)}>✕</button>
                </span>
              </div>
            ))}
          </div>

          {tl.tracks.length === 0 && (
            <div className="tl-empty">
              <h3>An empty expanse of time</h3>
              <p>Add a track to begin — tracks are horizontal lanes like “History”, “Lives”, or “Story”.</p>
              <button className="primary-btn" onClick={() => dispatch({ type: 'timeline/track/add', title: 'Story' })}>+ Add track</button>
            </div>
          )}
        </div>

        <footer className="tl-foot">
          <span>{tl.items.length} items · {tl.tracks.length} tracks</span>
          <span className="foot-spacer" />
          <span className="foot-dim">scroll to zoom · drag background to pan · drag items to move them · double-click to add an event</span>
        </footer>
      </div>

      {selected && (
        <ItemDetail
          item={selected}
          onClose={() => setSelectedId(null)}
          onOpenScene={onOpenScene}
          onOpenCodexEntry={onOpenCodexEntry}
        />
      )}

      {hover && !selected && (
        <div className="tl-tooltip" style={{ left: Math.min(hover.x + 14, window.innerWidth - 280), top: hover.y + 14 }}>
          <div className="tt-title">
            <span className="tt-swatch" style={{ background: hover.item.color }} />
            {hover.item.title}
          </div>
          <div className="tt-time">
            {hover.item.kind === 'span'
              ? `${fmt(hover.item.start)} — ${hover.item.end == null ? 'ongoing' : fmt(hover.item.end)} ${tl.unit || ''}`
              : `${fmt(hover.item.start)} ${tl.unit || ''}`}
          </div>
          {hover.item.description && <div className="tt-desc">{hover.item.description}</div>}
        </div>
      )}
    </div>
  )
}
