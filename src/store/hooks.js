import { useMemo } from 'react'

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

