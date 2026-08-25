import React from 'react'
import { buildManuscriptTree, mentionsByEntry } from '../../store.jsx'

// Flattens the manuscript tree into ordered chapters — same interleaved
// order the corkboard and pacing chart already agree on.
function flattenOrdered(tree, path = []) {
  const out = []
  for (const node of tree) {
    if (node.type === 'chapter') out.push({ chapter: node.chapter, actPath: path })
    else out.push(...flattenOrdered(node.children, [...path, node.group.title]))
  }
  return out
}

export default function CastChart({ state, onOpenScene, onOpenCodexEntry }) {
  const ordered = flattenOrdered(buildManuscriptTree(state.chapters, state.groups || []))
  const characters = state.codex.filter((e) => e.type === 'character')

  if (ordered.length === 0 || characters.length === 0) {
    return (
      <div className="pacing-empty">
        {characters.length === 0 ? 'No characters in the codex yet.' : 'No chapters yet — add some from the board to track cast presence.'}
      </div>
    )
  }

  const mentions = mentionsByEntry(state.chapters, state.codex)
  // per character: chapterId -> mention count within that chapter (folds
  // scene-level hits up to their parent chapter, same as flow-mode chapters)
  const countsByCharacter = new Map(
    characters.map((c) => {
      const byChapter = new Map()
      for (const hit of mentions[c.id] || []) {
        byChapter.set(hit.chapterId, (byChapter.get(hit.chapterId) || 0) + hit.count)
      }
      return [c.id, byChapter]
    })
  )

  // characters with more chapters appeared in float to the top — the ones
  // actually worth scanning a whole row for
  const rows = [...characters].sort((a, b) => {
    const ca = countsByCharacter.get(a.id).size
    const cb = countsByCharacter.get(b.id).size
    return cb - ca || a.name.localeCompare(b.name)
  })

  const maxCount = Math.max(1, ...rows.flatMap((c) => [...countsByCharacter.get(c.id).values()]))

  return (
    <div className="cast-wrap">
      <div className="cast-scroll">
        <div className="cast-grid" style={{ '--cast-cols': ordered.length }}>
          <div className="cast-corner" />
          {ordered.map((o, i) => (
            <button
              key={o.chapter.id}
              className="cast-col-head"
              title={o.chapter.title}
              onClick={() => onOpenScene(o.chapter.id)}
            >
              {i + 1}
            </button>
          ))}

          {rows.map((c) => (
            <React.Fragment key={c.id}>
              <button className="cast-row-head" style={{ '--card-accent': c.color }} onClick={() => onOpenCodexEntry(c.id)} title={`Open ${c.name} in Codex`}>
                <span className="cast-row-swatch" />
                {c.name}
              </button>
              {ordered.map((o) => {
                const count = countsByCharacter.get(c.id).get(o.chapter.id) || 0
                const intensity = count ? Math.max(0.25, count / maxCount) : 0
                return (
                  <button
                    key={o.chapter.id}
                    className={`cast-cell ${count ? 'present' : ''}`}
                    style={count ? { '--cast-color': c.color, '--cast-intensity': intensity } : undefined}
                    disabled={!count}
                    title={count ? `${c.name} in “${o.chapter.title}” — ${count} mention${count === 1 ? '' : 's'}` : `${c.name} — not mentioned in “${o.chapter.title}”`}
                    onClick={() => onOpenScene(o.chapter.id)}
                  >
                    {count > 0 && <span className="cast-dot" />}
                  </button>
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <p className="cast-hint">Presence is detected from name/alias mentions in the manuscript — darker cells mean more mentions in that chapter.</p>
    </div>
  )
}
