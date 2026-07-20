# Testing guide

## Running

```bash
npm install        # once, to get the new dev dependencies
npm test           # watch mode: reruns tests every time you save a file
npm run test:run   # run everything once and exit (what CI would do)
```

In watch mode, press `f` to rerun only failures, `p` to filter by filename, `q` to quit.

## How it's wired

- **Vitest** is the test runner — it understands the Vite config, so tests import your source exactly like the app does.
- `environment: 'jsdom'` gives tests a fake browser (`document`, `localStorage`) inside Node.
- `src/test/setup.js` runs before every test file and loads **jest-dom**'s extra matchers.
- Any file named `*.test.js` / `*.test.jsx` is picked up automatically.

## Anatomy of a test

```js
describe('countWords', () => {            // a group, named after the thing under test
  it('ignores extra whitespace', () => {  // ONE behavior, phrased as a sentence
    expect(countWords('  a   b ')).toBe(2)  // assertion: actual vs expected
  })
})
```

The three example files are a difficulty ladder — read them in order:

1. `01-pure-functions.test.js` — pure in/out functions. Easiest and highest value; start here when testing anything new.
2. `02-library-storage.test.js` — side effects, and why `beforeEach` resets shared state so tests stay independent.
3. `03-library-view.test.jsx` — React components: render, query by what the user sees, click with `userEvent`, spy with `vi.fn()`.

## Writing your own: a recipe

1. Pick one behavior and say it out loud: "deleting a codex entry also removes its relationships."
2. **Arrange** — build the smallest state that makes the behavior possible.
3. **Act** — call the function / click the button.
4. **Assert** — check the one outcome that sentence promised. Prefer one concept per test.
5. Watch it fail at least once (change the expected value briefly) — a test you've never seen fail might be testing nothing.

## What to test next in Calliope (good exercises, in order)

- `plainText` strips tags; `toParagraphs` (paste logic in Editor.jsx — you'll need to export it) handles Gutenberg-style vs web-style line breaks.
- The reducer: dispatching `codex/delete` removes the entry's relationships too. (Export the reducer from store.jsx, then it's a pure function: `reducer(stateBefore, action)` → assert on stateAfter.)
- `normalizeNovelData` accepts both wrapped and raw imports, rejects garbage.
- Component: the codex detail panel switches between read and edit modes.

## Rules of thumb

- Test behavior, not implementation — if a refactor that keeps behavior breaks your test, the test was too nosy.
- Fixtures small and local: build just enough fake data per test, don't share mutable objects between tests.
- Components: query by visible text, roles, and titles (`screen.getByText`, `getByTitle`) — never by CSS class.
- When you find a real bug: first write the test that reproduces it, watch it fail, then fix. That bug can never return silently.
