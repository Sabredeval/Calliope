# Calliope ✒️

A novel-writing studio inspired by novelCrafter — a distraction-light manuscript editor paired with a story-bible codex.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

Production build: `npm run build` (output in `dist/`, preview with `npm run preview`).

## Features

**Library**
- The app always opens at the library (and ⌂ returns you there) — your novels shown as books on a shelf, each with its own cover color, word count, and last-edited time
- New, duplicate, and delete from each book's ⋯ menu (visible on hover)
- **Export each novel as a `.calliope.json` file** for backups or moving between machines, and import them back on any device
- Your pre-library novel is migrated in automatically on first launch

**Write view**
- **Continuous manuscript** — the whole novel is one scrolling document. Every chapter heading, scene title, summary, and scene body is editable inline; scroll from the first page to the last without switching views
- Scrollspy navigation: the sidebar tracks the scene under your cursor as you scroll, and clicking a scene in the sidebar smooth-scrolls to it (with a brief highlight)
- Sidebar hierarchy: numbered chapters, per-chapter "pulse" strips (one status-colored dot per scene — click to jump), done/total counts, collapse/expand all, and an outline mode (☰) that shows scene summaries
- Rich text toolbar (acts on whichever scene you're typing in): bold/italic/underline/strikethrough, headings, blockquotes, scene breaks, undo/redo
- Per-scene summary and status (Idea → Draft → Revised → Done); the toolbar shows where you are and lets you set the current scene's status
- Live word counts per scene, chapter, and novel, plus a progress bar toward your word goal
- Focus mode (⤢) fades all chrome for distraction-free writing
- "Codex in this scene" panel follows the active scene — entries are auto-detected when their names or aliases appear in your prose
- **Select-to-codex**: select a name in your prose and a popover appears — one click adds it to the codex as a character, location, item, lore, or organization (or jumps to the entry if it already exists)
- **Mention underlines** (A̲ toggle in the toolbar): codex names and aliases get a dotted underline throughout the manuscript in each entry's own color, live as you type — rendered with the CSS Highlight API, so your actual text is never modified
- **Wiki hover cards**: with underlines on, hovering a mention pops up a card with the entry's type, aliases, one-liner, description, and relationship count — plus a jump to the full codex entry

**Codex view**
- Entry types: Characters, Locations, Items, Lore, Organizations
- Aliases (also used for scene detection), one-liners, descriptions, private notes, tags, and color coding
- Filter by type, free-text filter, card grid with a full detail editor
- **Relations graph** — a force-directed map of how entries connect. Drag nodes, pan and zoom, hover to spotlight a node's neighborhood, click an edge to edit its label/direction, and use 🔗 Link to connect two nodes by clicking them. Relationships can also be managed from each entry's detail panel, and labels support direction (→) or mutual (—) connections.

**Timeline view**
- Zoomable, pannable SVG timeline with custom time unit (e.g. "Year AE")
- Point events (◆) and spans (▬) for lives of people, eras, and chapters, organized into tracks ("History", "Lives", "Story"…)
- Ongoing spans that extend to the edge of time, automatic row stacking to avoid overlaps
- Scroll to zoom, drag the background to pan, drag items to move them in time, double-click to add an event
- Hover tooltips, a cursor time crosshair, and a detail editor with color, description, and links that jump to scenes or codex entries

**Everywhere**
- Ctrl/Cmd+K global search across scenes and codex
- Export manuscript to Markdown or plain text, optionally with summaries and a codex appendix
- Dark and light themes
- Autosave to browser localStorage — your work persists between sessions

## Notes

- Data lives in your browser's localStorage under the key `calliope.novel.v1`. Export regularly for backups.
- The app ships with a small sample novel, *The Hollow Crown*, so every feature is populated on first launch. Edit or delete anything — it's yours.
