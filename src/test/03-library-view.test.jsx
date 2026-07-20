/*
  LEVEL 3 — testing a React component the way a user sees it.

  New concepts:
  - render()      mounts the component into a fake DOM
  - screen        queries that DOM ("find the text 'Test Novel'")
  - userEvent     simulates real clicks and typing
  - vi.fn()       a "spy" function — records how it was called, so we can
                  assert the component talked to its parent correctly

  Golden rule (from Testing Library): test what the user experiences,
  not the component's internals. Query by visible text/titles, click
  like a human would, and assert on what appears on screen.
*/
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LibraryView from '../components/library/LibraryView.jsx'
import { LIB_KEY } from '../store.jsx'

beforeEach(() => {
  localStorage.clear()
  // A controlled fixture: we decide exactly what the library contains,
  // so the test doesn't depend on whatever the seed data looks like.
  localStorage.setItem(LIB_KEY, JSON.stringify({
    novels: [
      { id: 'n1', title: 'Test Novel', author: 'Tess Tersson', words: 500, chapters: 2, scenes: 3, updatedAt: Date.now() },
    ],
    currentId: null,
    theme: 'dark',
  }))
})

describe('LibraryView', () => {
  it('shows a book for each novel in the library', () => {
    render(<LibraryView onOpen={vi.fn()} />)
    expect(screen.getByText('Test Novel')).toBeInTheDocument()
    expect(screen.getByText('Tess Tersson')).toBeInTheDocument()
  })

  it('opens a novel when its book is clicked', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn() // spy: records calls instead of doing anything
    render(<LibraryView onOpen={onOpen} />)

    await user.click(screen.getByTitle('Open “Test Novel”'))

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith('n1')
  })

  it('creates and opens a fresh novel from the New novel book', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<LibraryView onOpen={onOpen} />)

    await user.click(screen.getByTitle('New novel'))

    // the parent was told to open *some* new id…
    expect(onOpen).toHaveBeenCalledTimes(1)
    const newId = onOpen.mock.calls[0][0]
    expect(newId).not.toBe('n1')
    // …and that novel now really exists in storage
    const lib = JSON.parse(localStorage.getItem(LIB_KEY))
    expect(lib.novels).toHaveLength(2)
  })
})
