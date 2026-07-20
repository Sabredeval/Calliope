import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { useStore, uid, CODEX_TYPES } from '../../store.jsx'

const SPRING_LEN = 170
const SPRING_K = 0.025
const REPULSION = 5200
const GRAVITY = 0.012
const DAMPING = 0.82
const MAX_V = 10

const typeIcon = (t) => CODEX_TYPES.find((c) => c.id === t)?.icon || '📄'

export default function RelationGraph({ selectedId, onSelect, query }) {
  const { state, dispatch } = useStore()
  const entries = state.codex
  const rels = state.relationships || []

  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [, setTick] = useState(0)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const transformRef = useRef(transform)
  transformRef.current = transform

  const posRef = useRef(new Map()) // id -> {x,y,vx,vy}
  const alphaRef = useRef(1)
  const dragRef = useRef(null)
  const [hoverId, setHoverId] = useState(null)
  const [selEdgeId, setSelEdgeId] = useState(null)
  const [linkFrom, setLinkFrom] = useState(null) // id of first node in link mode

  /* measure + center once */
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    setTransform((t) => (t.x === 0 && t.y === 0 ? { x: el.clientWidth / 2, y: el.clientHeight / 2, k: 1 } : t))
    return () => ro.disconnect()
  }, [])

  /* lazy position init (golden-angle spiral so clusters spread) */
  const getPos = useCallback((id, i = 0) => {
    let p = posRef.current.get(id)
    if (!p) {
      const a = i * 2.39996
      const r = 60 + 26 * Math.sqrt(i)
      p = { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 }
      posRef.current.set(id, p)
    }
    return p
  }, [])

  /* degree map for node sizing */
  const degree = useMemo(() => {
    const d = {}
    for (const r of rels) {
      d[r.fromId] = (d[r.fromId] || 0) + 1
      d[r.toId] = (d[r.toId] || 0) + 1
    }
    return d
  }, [rels])

  const radiusOf = useCallback((id) => Math.min(30, 17 + (degree[id] || 0) * 2), [degree])

  /* reheat when data changes */
  useEffect(() => {
    alphaRef.current = 1
  }, [entries.length, rels.length])

  /* simulation loop */
  useEffect(() => {
    let raf
    const step = () => {
      raf = requestAnimationFrame(step)
      if (alphaRef.current <= 0.02) return
      const alpha = alphaRef.current
      const nodes = entries.map((e, i) => ({ id: e.id, p: getPos(e.id, i) }))

      // repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i].p, b = nodes[j].p
          let dx = a.x - b.x, dy = a.y - b.y
          let d2 = dx * dx + dy * dy
          if (d2 < 1) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); d2 = 1 }
          const d = Math.sqrt(d2)
          const f = Math.min((REPULSION / d2) * alpha, 6)
          const fx = (dx / d) * f, fy = (dy / d) * f
          a.vx += fx; a.vy += fy
          b.vx -= fx; b.vy -= fy
        }
      }
      // springs
      for (const r of rels) {
        const a = posRef.current.get(r.fromId)
        const b = posRef.current.get(r.toId)
        if (!a || !b) continue
        const dx = b.x - a.x, dy = b.y - a.y
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
        const f = (d - SPRING_LEN) * SPRING_K * alpha
        const fx = (dx / d) * f, fy = (dy / d) * f
        a.vx += fx; a.vy += fy
        b.vx -= fx; b.vy -= fy
      }
      // gravity + integrate
      for (const { id, p } of nodes) {
        if (dragRef.current?.nodeId === id) { p.vx = 0; p.vy = 0; continue }
        p.vx = (p.vx - p.x * GRAVITY * alpha) * DAMPING
        p.vy = (p.vy - p.y * GRAVITY * alpha) * DAMPING
        p.vx = Math.max(-MAX_V, Math.min(MAX_V, p.vx))
        p.vy = Math.max(-MAX_V, Math.min(MAX_V, p.vy))
        p.x += p.vx
        p.y += p.vy
      }
      alphaRef.current *= 0.992
      setTick((t) => t + 1)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [entries, rels, getPos])

  /* zoom */
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const t = transformRef.current
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const k = Math.min(3.5, Math.max(0.2, t.k * factor))
      const wx = (mx - t.x) / t.k, wy = (my - t.y) / t.k
      setTransform({ k, x: mx - wx * k, y: my - wy * k })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const toWorld = (clientX, clientY) => {
    const rect = wrapRef.current.getBoundingClientRect()
    const t = transformRef.current
    return { x: (clientX - rect.left - t.x) / t.k, y: (clientY - rect.top - t.y) / t.k }
  }

  /* drag: background pans, node moves */
  const beginDrag = (e, nodeId = null) => {
    if (e.button !== 0) return
    e.preventDefault()
    if (nodeId) e.stopPropagation()
    dragRef.current = { nodeId, startX: e.clientX, startY: e.clientY, t0: transformRef.current, moved: false }
    const onMove = (me) => {
      const d = dragRef.current
      if (!d) return
      const dx = me.clientX - d.startX, dy = me.clientY - d.startY
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
      if (d.nodeId) {
        const w = toWorld(me.clientX, me.clientY)
        const p = posRef.current.get(d.nodeId)
        if (p) { p.x = w.x; p.y = w.y; p.vx = 0; p.vy = 0 }
        alphaRef.current = Math.max(alphaRef.current, 0.3)
        setTick((t) => t + 1)
      } else {
        setTransform({ ...d.t0, x: d.t0.x + dx, y: d.t0.y + dy })
      }
    }
    const onUp = () => {
      const d = dragRef.current
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (d?.nodeId && !d.moved) handleNodeClick(d.nodeId)
      if (!d?.nodeId && !d?.moved) { onSelect(null); setSelEdgeId(null); setLinkFrom(null) }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleNodeClick = (id) => {
    if (linkFrom !== null) {
      if (linkFrom === '') { setLinkFrom(id); return } // armed: this node becomes the source
      if (linkFrom === id) { setLinkFrom(null); return } // clicked source again: cancel
      const label = window.prompt('Relationship label (e.g. "mentor of", "enemy of")', 'related to')
      if (label !== null) {
        dispatch({ type: 'rel/add', rel: { id: uid(), fromId: linkFrom, toId: id, label: label.trim() || 'related to', directed: true } })
      }
      setLinkFrom(null)
      return
    }
    setSelEdgeId(null)
    onSelect(id)
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setLinkFrom(null); setSelEdgeId(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const fit = () => {
    if (!entries.length || !size.w) return
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    entries.forEach((e, i) => {
      const p = getPos(e.id, i)
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    })
    const pad = 90
    const w = maxX - minX + pad * 2 || 1, h = maxY - minY + pad * 2 || 1
    const k = Math.min(3.5, Math.max(0.2, Math.min(size.w / w, size.h / h)))
    setTransform({ k, x: size.w / 2 - ((minX + maxX) / 2) * k, y: size.h / 2 - ((minY + maxY) / 2) * k })
  }

  const shuffle = () => {
    posRef.current.clear()
    alphaRef.current = 1
  }

  /* neighbor sets for hover dimming */
  const neighborOf = useMemo(() => {
    const m = {}
    for (const r of rels) {
      ;(m[r.fromId] ||= new Set()).add(r.toId)
      ;(m[r.toId] ||= new Set()).add(r.fromId)
    }
    return m
  }, [rels])

  const focusId = hoverId || (linkFrom ? null : selectedId)
  const isDimmed = (id) => {
    if (!focusId) return false
    if (id === focusId) return false
    return !neighborOf[focusId]?.has(id)
  }
  const edgeDimmed = (r) => focusId && r.fromId !== focusId && r.toId !== focusId

  const q = (query || '').trim().toLowerCase()
  const matchesQuery = (e) =>
    q && [e.name, ...(e.aliases || [])].some((n) => n.toLowerCase().includes(q))

  /* parallel-edge offsets */
  const edgeGeom = useMemo(() => {
    const groups = {}
    for (const r of rels) {
      const key = [r.fromId, r.toId].sort().join('|')
      ;(groups[key] ||= []).push(r)
    }
    const geom = {}
    for (const key of Object.keys(groups)) {
      const g = groups[key]
      g.forEach((r, i) => { geom[r.id] = (i - (g.length - 1) / 2) * 30 })
    }
    return geom
  }, [rels])

  const selEdge = rels.find((r) => r.id === selEdgeId)
  const nameOf = (id) => entries.find((e) => e.id === id)?.name || '?'

  if (entries.length < 2) {
    return (
      <div className="graph-empty">
        <h3>Not enough entries to connect</h3>
        <p>Create at least two codex entries, then link them here to map out your story's web of relationships.</p>
      </div>
    )
  }

  return (
    <div className="graph-wrap" ref={wrapRef} onMouseDown={(e) => beginDrag(e)}>
      <svg width={size.w} height={size.h} className="graph-svg">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" className="graph-arrow" />
          </marker>
        </defs>
        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          {/* edges */}
          {rels.map((r) => {
            const a = posRef.current.get(r.fromId)
            const b = posRef.current.get(r.toId)
            if (!a || !b) return null
            const dx = b.x - a.x, dy = b.y - a.y
            const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
            const ux = dx / d, uy = dy / d
            const ra = radiusOf(r.fromId) + 3
            const rb = radiusOf(r.toId) + (r.directed ? 9 : 3)
            const x1 = a.x + ux * ra, y1 = a.y + uy * ra
            const x2 = b.x - ux * rb, y2 = b.y - uy * rb
            const off = edgeGeom[r.id] || 0
            const mx = (x1 + x2) / 2 - uy * off, my = (y1 + y2) / 2 + ux * off
            const path = off === 0
              ? `M ${x1} ${y1} L ${x2} ${y2}`
              : `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`
            const lx = off === 0 ? (x1 + x2) / 2 : (x1 + 2 * mx + x2) / 4
            const ly = off === 0 ? (y1 + y2) / 2 : (y1 + 2 * my + y2) / 4
            const sel = r.id === selEdgeId
            return (
              <g key={r.id} className={`graph-edge ${sel ? 'selected' : ''} ${edgeDimmed(r) ? 'dimmed' : ''}`}>
                <path d={path} className="edge-hit"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setSelEdgeId(r.id); onSelect(null) }}
                />
                <path d={path} className="edge-line" markerEnd={r.directed ? 'url(#arrow)' : undefined} />
                {r.label && (
                  <text x={lx} y={ly - 5} className="edge-label" textAnchor="middle">{r.label}</text>
                )}
              </g>
            )
          })}

          {/* nodes */}
          {entries.map((e, i) => {
            const p = getPos(e.id, i)
            const r = radiusOf(e.id)
            const sel = e.id === selectedId
            const linking = e.id === linkFrom
            return (
              <g
                key={e.id}
                transform={`translate(${p.x} ${p.y})`}
                className={`graph-node ${sel ? 'selected' : ''} ${isDimmed(e.id) ? 'dimmed' : ''} ${linking ? 'linking' : ''}`}
                onMouseDown={(ev) => beginDrag(ev, e.id)}
                onMouseEnter={() => setHoverId(e.id)}
                onMouseLeave={() => setHoverId(null)}
              >
                {matchesQuery(e) && <circle r={r + 8} className="node-query-ring" />}
                {linking && <circle r={r + 6} className="node-link-ring" />}
                <circle r={r} fill={e.color} className="node-circle" />
                <text y={5} textAnchor="middle" className="node-icon" style={{ fontSize: r * 0.85 }}>{typeIcon(e.type)}</text>
                <text y={r + 16} textAnchor="middle" className="node-label">{e.name}</text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* overlay controls */}
      <div className="graph-controls" onMouseDown={(e) => e.stopPropagation()}>
        <button
          className={`ghost-btn slim ${linkFrom !== null ? 'linking-active' : ''}`}
          title="Click two nodes to connect them"
          onClick={() => setLinkFrom(linkFrom === null ? '' : null)}
        >
          🔗 {linkFrom === null ? 'Link' : linkFrom === '' ? 'Pick first node…' : 'Pick second node…'}
        </button>
        <button className="icon-btn" title="Zoom out" onClick={() => setTransform((t) => ({ ...t, k: Math.max(0.2, t.k / 1.3) }))}>−</button>
        <button className="icon-btn" title="Zoom in" onClick={() => setTransform((t) => ({ ...t, k: Math.min(3.5, t.k * 1.3) }))}>+</button>
        <button className="ghost-btn slim" onClick={fit}>Fit</button>
        <button className="ghost-btn slim" title="Re-run layout" onClick={shuffle}>Shake</button>
      </div>

      <div className="graph-hint">
        drag nodes to arrange · drag background to pan · scroll to zoom · click an edge to edit it
      </div>

      {/* edge editor */}
      {selEdge && (
        <div className="edge-editor" onMouseDown={(e) => e.stopPropagation()}>
          <div className="ee-title">
            {nameOf(selEdge.fromId)} <span className="ee-arrow">{selEdge.directed ? '→' : '—'}</span> {nameOf(selEdge.toId)}
          </div>
          <input
            value={selEdge.label || ''}
            placeholder="Label (e.g. mentor of)"
            onChange={(e) => dispatch({ type: 'rel/update', id: selEdge.id, patch: { label: e.target.value } })}
          />
          <div className="ee-row">
            <label className="check-row">
              <input
                type="checkbox"
                checked={!!selEdge.directed}
                onChange={(e) => dispatch({ type: 'rel/update', id: selEdge.id, patch: { directed: e.target.checked } })}
              />
              Directed
            </label>
            <button
              className="ghost-btn slim"
              title="Swap direction"
              onClick={() => dispatch({ type: 'rel/update', id: selEdge.id, patch: { fromId: selEdge.toId, toId: selEdge.fromId } })}
            >
              ⇄ Swap
            </button>
            <button
              className="ghost-btn slim danger-text"
              onClick={() => { dispatch({ type: 'rel/delete', id: selEdge.id }); setSelEdgeId(null) }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

