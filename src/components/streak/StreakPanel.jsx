import React, { useEffect, useState } from 'react'
import { Flame } from 'lucide-react'

const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

// Splits the flat 84-day heatmap into week columns (7-day rows, oldest
// first) — the grid always ends on "today" but the first partial week is
// padded at the front so every column lines up to a real calendar week.
function toWeeks(heatmap) {
  const first = heatmap[0]
  const firstDate = new Date(`${first.key}T00:00:00`)
  const pad = firstDate.getDay() === 0 ? 6 : firstDate.getDay() - 1 // week starts Monday
  const cells = [...Array(pad).fill(null), ...heatmap]
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

function intensityClass(words, goal) {
  if (words === null || words === undefined) return ''
  if (words <= 0) return 'lvl-0'
  if (goal > 0) {
    const ratio = words / goal
    if (ratio >= 1) return 'lvl-3'
    if (ratio >= 0.5) return 'lvl-2'
    return 'lvl-1'
  }
  if (words >= 1000) return 'lvl-3'
  if (words >= 300) return 'lvl-2'
  return 'lvl-1'
}

export default function StreakPanel({ stats, dailyGoal, onSetGoal, onClose }) {
  const [goalDraft, setGoalDraft] = useState(String(dailyGoal || ''))

  useEffect(() => {
    window.addEventListener('mousedown', onClose)
    return () => window.removeEventListener('mousedown', onClose)
  }, [onClose])

  const pct = stats.goal ? Math.min(100, Math.round((stats.todayWords / stats.goal) * 100)) : null
  const weeks = toWeeks(stats.heatmap)
  const r = 26
  const circumference = 2 * Math.PI * r
  const dash = pct !== null ? (pct / 100) * circumference : 0

  return (
    <div className="streak-panel" onMouseDown={(e) => e.stopPropagation()}>
      <div className="streak-panel-top">
        <div className="streak-ring-wrap">
          <svg viewBox="0 0 60 60" className="streak-ring" aria-hidden="true">
            <circle cx="30" cy="30" r={r} className="streak-ring-track" />
            {pct !== null && (
              <circle
                cx="30" cy="30" r={r}
                className="streak-ring-fill"
                strokeDasharray={`${dash} ${circumference - dash}`}
                transform="rotate(-90 30 30)"
              />
            )}
          </svg>
          <div className="streak-ring-center">
            <Flame size={16} className={stats.streak > 0 ? 'streak-flame lit' : 'streak-flame'} />
            <span className="streak-count">{stats.streak}</span>
          </div>
        </div>

        <div className="streak-today">
          <span className="streak-today-label">Today</span>
          <span className="streak-today-value">
            {stats.todayWords.toLocaleString()}{stats.goal > 0 && <span className="streak-today-goal"> / {stats.goal.toLocaleString()}</span>}
          </span>
          <span className="streak-today-sub">
            {stats.streak > 0 ? `${stats.streak} day${stats.streak === 1 ? '' : 's'} in a row` : stats.goal > 0 ? 'Write today to start a streak' : 'No daily goal set'}
          </span>
        </div>
      </div>

      <div className="streak-heatmap" role="img" aria-label="Words written per day, last 12 weeks">
        <div className="streak-heatmap-days">
          {WEEKDAY_LABELS.map((l, i) => <span key={i}>{l}</span>)}
        </div>
        <div className="streak-heatmap-grid">
          {weeks.map((week, wi) => (
            <div className="streak-heatmap-col" key={wi}>
              {week.map((day, di) => (
                <span
                  key={di}
                  className={`streak-cell ${day ? intensityClass(day.words, stats.goal) : 'lvl-none'}`}
                  title={day ? `${day.key} — ${day.hasData ? `${(day.words || 0).toLocaleString()} words` : 'no data'}` : ''}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <label className="streak-goal-field" htmlFor="streak-daily-goal">
        <span>Daily goal</span>
        <input
          id="streak-daily-goal"
          name="dailyGoal"
          type="number"
          min="0"
          step="50"
          value={goalDraft}
          placeholder="e.g. 500"
          autoComplete="off"
          onChange={(e) => setGoalDraft(e.target.value)}
          onBlur={() => onSetGoal(Number(goalDraft) || 0)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          onClick={(e) => e.stopPropagation()}
        />
      </label>
    </div>
  )
}
