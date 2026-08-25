import React from 'react'
import { chapterWords, buildManuscriptTree, SCENE_STATUSES } from '../../store.jsx'

const BARS_H = 250 // px
const PACE_H = 300 // px

// Flattens the manuscript tree into ordered chapters, each tagged with the
// (possibly nested) act titles it sits under — the same interleaved order
// the sidebar and corkboard already agree on, just walked depth-first.
function flattenOrdered(tree, path = []) {
  const out = []
  for (const node of tree) {
    if (node.type === 'chapter') out.push({ chapter: node.chapter, actPath: path })
    else out.push(...flattenOrdered(node.children, [...path, node.group.title]))
  }
  return out
}

export default function PacingChart({ state }) {
  const ordered = flattenOrdered(buildManuscriptTree(state.chapters, state.groups || []))

  if (ordered.length === 0) {
    return <div className="pacing-empty">No chapters yet — add some from the board to see pacing.</div>
  }

  const counts = ordered.map((o) => chapterWords(o.chapter))
  const maxWords = Math.max(1, ...counts)
  const totalWords = counts.reduce((a, b) => a + b, 0)
  const goal = Number(state.novel.wordGoal) || 0

  let running = 0
  const cumulative = counts.map((n) => (running += n))
  const cumTop = Math.max(goal, totalWords, 1)

  const n = ordered.length
  // x is in "chapter slot" units (0..n), matching the y-axis's real-px scale
  // 1:1 in spirit — avoids mixing a 0-100 percent axis with a px axis, which
  // is what made strokes/dashes render unevenly under preserveAspectRatio="none".
  const xAt = (i) => i + 0.5
  const barW = Math.min(0.72, 0.6)

  return (
    <div className="pacing-wrap">
      <div className="pacing-stats">
        <div className="pacing-stat">
          <span className="pacing-stat-label">Total words</span>
          <span className="pacing-stat-value">{totalWords.toLocaleString()}</span>
        </div>
        {goal > 0 && (
          <div className="pacing-stat">
            <span className="pacing-stat-label">Goal</span>
            <span className="pacing-stat-value">{goal.toLocaleString()}</span>
          </div>
        )}
        <div className="pacing-stat">
          <span className="pacing-stat-label">Avg chapter</span>
          <span className="pacing-stat-value">{Math.round(totalWords / n).toLocaleString()}</span>
        </div>
        <div className="pacing-stat">
          <span className="pacing-stat-label">Longest</span>
          <span className="pacing-stat-value">{maxWords.toLocaleString()}</span>
        </div>
      </div>

      <div className="pacing-panel-head">
        <h3>Chapter length</h3>
        <div className="pacing-legend">
          {SCENE_STATUSES.map((s) => (
            <span key={s.id} className="pacing-legend-item">
              <span className="pacing-legend-swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="pacing-chart" style={{ height: BARS_H }}>
        <svg className="pacing-svg" viewBox={`0 0 ${n} ${BARS_H}`} preserveAspectRatio="none" role="img" aria-label="Word count per chapter, colored by status">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1={0} x2={n} y1={BARS_H - f * (BARS_H - 10)} y2={BARS_H - f * (BARS_H - 10)} className="pacing-grid" />
          ))}
          {ordered.map((o, i) => {
            const h = Math.max((counts[i] / maxWords) * (BARS_H - 10), 1)
            const color = SCENE_STATUSES.find((s) => s.id === o.chapter.status)?.color || SCENE_STATUSES[0].color
            const x = xAt(i) - barW / 2
            const y = BARS_H - h
            const r = Math.min(1.4, barW / 2, h / 2) // rounded top only, square baseline
            const d = `M${x},${BARS_H} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${BARS_H} Z`
            return (
              <path key={o.chapter.id} d={d} fill={color} className="pacing-bar">
                <title>{`${o.chapter.title}${o.actPath.length ? ` (${o.actPath.join(' › ')})` : ''} — ${counts[i].toLocaleString()} words`}</title>
              </path>
            )
          })}
        </svg>
      </div>

      <div className="pacing-panel-head">
        <h3>Progress toward goal</h3>
        {goal > 0 && (
          <span className="pacing-legend-item pacing-legend-pace">
            <span className="pacing-legend-line" />
            Even pace
          </span>
        )}
      </div>

      <div className="pacing-chart pacing-chart-pace" style={{ height: PACE_H }}>
        <svg className="pacing-svg" viewBox={`0 0 ${n} ${PACE_H}`} preserveAspectRatio="none" role="img" aria-label="Cumulative word count across the manuscript, against goal pace">
          {[0, 0.5, 1].map((f) => (
            <line key={f} x1={0} x2={n} y1={PACE_H - f * (PACE_H - 10)} y2={PACE_H - f * (PACE_H - 10)} className="pacing-grid" />
          ))}

          {goal > 0 && (
            <polyline
              className="pacing-pace-line"
              points={[0, ...ordered.map((_, i) => i + 1)].map((step) => {
                const y = PACE_H - Math.min(1, (goal * step) / n / cumTop) * (PACE_H - 10)
                return `${step},${y}`
              }).join(' ')}
            />
          )}

          <polyline
            className="pacing-cumulative-fill"
            points={`0,${PACE_H} ` + ordered.map((_, i) => `${xAt(i)},${PACE_H - (cumulative[i] / cumTop) * (PACE_H - 10)}`).join(' ') + ` ${n},${PACE_H}`}
          />
          <polyline
            className="pacing-cumulative-line"
            points={ordered.map((_, i) => `${xAt(i)},${PACE_H - (cumulative[i] / cumTop) * (PACE_H - 10)}`).join(' ')}
          />
        </svg>
        {/* dots as HTML overlay, not SVG — the chart's x/y viewBox units are
            stretched to different scales, which would render <circle> as ellipses */}
        {ordered.map((o, i) => (
          <span
            key={o.chapter.id}
            className="pacing-cumulative-dot"
            style={{ left: `${(xAt(i) / n) * 100}%`, top: `${((PACE_H - (cumulative[i] / cumTop) * (PACE_H - 10)) / PACE_H) * 100}%` }}
            title={`Through “${o.chapter.title}” — ${cumulative[i].toLocaleString()} words`}
          />
        ))}
      </div>

      <div className="pacing-axis">
        {ordered.map((o, i) => (
          <span key={o.chapter.id} className="pacing-axis-label" style={{ left: `${(xAt(i) / n) * 100}%` }} title={o.chapter.title}>
            {i + 1}
          </span>
        ))}
      </div>
    </div>
  )
}
