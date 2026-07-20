/*
  LEVEL 2 — testing code with side effects (localStorage).

  New concept: beforeEach. Tests must not depend on each other, so before
  every single test we wipe storage back to a known state. If you ever see
  a test that passes alone but fails with others, a missing reset like
  this is the usual culprit.
*/
import { describe, it, expect, beforeEach } from 'vitest'
import { loadLibrary, createNovel, deleteNovel, novelKey, LIB_KEY } from '../store.jsx'

beforeEach(() => {
  localStorage.clear()
})

describe('library storage', () => {
  it('first load seeds a library with one novel', () => {
    const lib = loadLibrary()
    expect(lib.novels).toHaveLength(1)
    // …and persists it, so a second load returns the same library
    const again = loadLibrary()
    expect(again.novels[0].id).toBe(lib.novels[0].id)
  })

  it('createNovel adds an entry and stores the novel under its own key', () => {
    loadLibrary() // seed
    const id = createNovel()
    const lib = loadLibrary()
    expect(lib.novels).toHaveLength(2)
    // the novel body lives in its own localStorage slot
    const raw = localStorage.getItem(novelKey(id))
    expect(raw).toBeTruthy()
    const data = JSON.parse(raw)
    expect(data.chapters.length).toBeGreaterThan(0)
  })

  it('deleteNovel removes both the entry and the stored novel', () => {
    loadLibrary()
    const id = createNovel()
    deleteNovel(id)
    const lib = loadLibrary()
    expect(lib.novels.map((n) => n.id)).not.toContain(id)
    expect(localStorage.getItem(novelKey(id))).toBeNull()
  })

  it('survives corrupted library data by reseeding', () => {
    localStorage.setItem(LIB_KEY, '{not valid json')
    const lib = loadLibrary()
    expect(Array.isArray(lib.novels)).toBe(true)
  })
})
