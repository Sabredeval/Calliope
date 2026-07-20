/*
  LEVEL 1 — unit tests for pure functions.

  A test file is just: describe (a group) → it (one behavior) → expect (a check).
  Rule of thumb: one `it` = one sentence about how your code should behave.
  Name tests so a failure reads like a bug report: "countWords > ignores extra spaces".

  Run all tests:        npm test        (watch mode — reruns on save)
  Run once and exit:    npm run test:run
*/
import { describe, it, expect } from 'vitest'
import { countWords, findMentions } from '../store.jsx'

describe('countWords', () => {
  it('counts words separated by spaces', () => {
    expect(countWords('the crow flies at midnight')).toBe(5)
  })

  it('returns 0 for empty or blank input', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
    expect(countWords(null)).toBe(0)
  })

  it('ignores extra whitespace between words', () => {
    expect(countWords('  hello    world  ')).toBe(2)
  })
})

describe('findMentions', () => {
  // A tiny fixture: fake data shaped like the real thing, kept minimal
  const codex = [
    { id: '1', name: 'Aria Thorne', aliases: ['Aria'], color: '#e05c5c' },
    { id: '2', name: 'Corvan', aliases: [], color: '#5b83d6' },
  ]

  it('finds an entry mentioned by name', () => {
    const hits = findMentions('Corvan drew his sword.', codex)
    expect(hits).toHaveLength(1)
    expect(hits[0].entry.name).toBe('Corvan')
  })

  it('finds entries by alias, case-insensitively', () => {
    const hits = findMentions('then ARIA ran for the well', codex)
    expect(hits.map((h) => h.entry.id)).toContain('1')
  })

  it('counts repeated mentions', () => {
    const hits = findMentions('Corvan looked at Corvan in the mirror.', codex)
    expect(hits[0].count).toBe(2)
  })

  it('finds nothing in unrelated text', () => {
    expect(findMentions('a quiet morning in the orchard', codex)).toHaveLength(0)
  })
})
