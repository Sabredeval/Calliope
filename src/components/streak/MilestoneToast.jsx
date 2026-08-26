import React, { useEffect } from 'react'
import { Flame, PartyPopper, Trophy } from 'lucide-react'

const COPY = {
  goal: (v) => `Daily goal hit — ${v.toLocaleString()} words today!`,
  best: (v) => `New personal best — ${v.toLocaleString()} words in a day!`,
  total: (v) => `${v.toLocaleString()} words written on this novel!`,
}

const ICON = { goal: Flame, best: Trophy, total: PartyPopper }

export default function MilestoneToast({ milestone, onDismiss }) {
  useEffect(() => {
    if (!milestone) return
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [milestone, onDismiss])

  if (!milestone) return null
  const Icon = ICON[milestone.kind] || Flame

  return (
    <div className="sel-toast milestone-toast">
      <Icon size={16} className="milestone-toast-icon" />
      <span>{COPY[milestone.kind]?.(milestone.value) || 'Milestone reached!'}</span>
      <button className="toast-x" onClick={onDismiss}>✕</button>
    </div>
  )
}
