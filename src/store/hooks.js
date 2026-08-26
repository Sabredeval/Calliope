import { useEffect, useMemo, useRef, useState } from 'react'
import { dateKey, writingStats } from './selectors.js'

const TOTAL_MILESTONES = [1000, 5000, 10000, 25000, 50000, 75000, 100000, 150000, 200000]

/* ---------- shared codex filtering/sorting ---------- */

// Same filter+sort logic used by every codex layout (cards, navigator list) so
// switching views never changes which entries show up for a given search.
export function useCodexEntries(codex, typeFilter, query) {
  return useMemo(() => {
    let list = codex
    if (typeFilter !== 'all') list = list.filter((e) => e.type === typeFilter)
    const q = (query || '').trim().toLowerCase()
    if (q) {
      list = list.filter((e) =>
        [e.name, e.oneLiner, e.description, e.notes, ...(e.aliases || []), ...(e.tags || [])]
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [codex, typeFilter, query])
}

/* ---------- writing log: daily streak + milestone celebrations ---------- */

// Keeps today's word-count snapshot in sync (debounced, so a sync isn't
// dispatched on every keystroke) and surfaces at most one milestone at a
// time for the caller to celebrate — the caller marks it seen when dismissed.
export function useWritingLog(state, dispatch, totalWords) {
  const [pendingMilestone, setPendingMilestone] = useState(null)
  const syncTimer = useRef(null)

  useEffect(() => {
    clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      dispatch({ type: 'writingLog/sync', dateKey: dateKey(), total: totalWords })
    }, 2000)
    return () => clearTimeout(syncTimer.current)
  }, [totalWords, dispatch])

  const stats = useMemo(() => writingStats(state.writingLog, totalWords), [state.writingLog, totalWords])

  const seen = state.writingLog?.seenMilestones || []
  useEffect(() => {
    if (pendingMilestone) return
    const todayKey = stats.today

    // total-word round numbers, largest-first so crossing several at once
    // (e.g. importing a finished draft) celebrates the biggest one
    const totalHit = [...TOTAL_MILESTONES].reverse().find((n) => totalWords >= n && !seen.includes(`total:${n}`))
    if (totalHit) {
      setPendingMilestone({ id: `total:${totalHit}`, kind: 'total', value: totalHit })
      return
    }
    // daily goal met — one celebration per day
    if (stats.goal > 0 && stats.todayWords >= stats.goal && !seen.includes(`goal:${todayKey}`)) {
      setPendingMilestone({ id: `goal:${todayKey}`, kind: 'goal', value: stats.todayWords })
      return
    }
    // a new personal-best day (only once there's a real prior best to beat)
    if (stats.todayWords > 0 && stats.todayWords === stats.bestDay && stats.heatmap.some((h) => h.hasData && h.key !== todayKey && h.words < stats.todayWords) && !seen.includes(`best:${todayKey}`)) {
      setPendingMilestone({ id: `best:${todayKey}`, kind: 'best', value: stats.todayWords })
    }
  }, [totalWords, stats, seen, pendingMilestone])

  const dismissMilestone = () => {
    if (pendingMilestone) dispatch({ type: 'writingLog/markMilestoneSeen', id: pendingMilestone.id })
    setPendingMilestone(null)
  }

  return { stats, pendingMilestone, dismissMilestone }
}

/* ---------- live session stats (words/minute), opt-in ---------- */

const SESSION_IDLE_RESET_MS = 5 * 60 * 1000

// A "session" is a run of writing with no gap longer than the idle timeout —
// an idle gap resets the clock so stepping away for lunch doesn't dilute the
// pace back down to a crawl. Returns null wpm until there's enough of a
// session to make a rate meaningful (avoids a wild number after one word).
export function useSessionStats(totalWords, enabled) {
  const sessionStart = useRef(null)
  const sessionWords = useRef(0)
  const lastWords = useRef(totalWords)
  const lastActivity = useRef(Date.now())
  const [, forceTick] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const delta = totalWords - lastWords.current
    lastWords.current = totalWords
    if (delta === 0) return

    const now = Date.now()
    if (!sessionStart.current || now - lastActivity.current > SESSION_IDLE_RESET_MS) {
      sessionStart.current = now
      sessionWords.current = 0
    }
    if (delta > 0) sessionWords.current += delta
    lastActivity.current = now
    forceTick((t) => t + 1)
  }, [totalWords, enabled])

  // ticks the WPM readout forward once a session is running (so it climbs
  // toward "enough data" and stays live between keystrokes), and clears the
  // session once idle too long — otherwise a stale rate would linger on
  // screen after the writer has actually stopped
  useEffect(() => {
    if (!enabled || !sessionStart.current) return
    const id = setInterval(() => {
      if (Date.now() - lastActivity.current > SESSION_IDLE_RESET_MS) {
        sessionStart.current = null
        sessionWords.current = 0
      }
      forceTick((t) => t + 1)
    }, 5000)
    return () => clearInterval(id)
  }, [enabled, sessionStart.current])

  if (!enabled || !sessionStart.current) return { wpm: null, sessionWords: 0 }

  const minutes = (Date.now() - sessionStart.current) / 60000
  const wpm = minutes >= 0.5 ? Math.round(sessionWords.current / minutes) : null
  return { wpm, sessionWords: sessionWords.current }
}

