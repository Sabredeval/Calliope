# Calliope

A local-first novel-writing studio: a distraction-light manuscript editor wrapped around a living story bible. Write in one continuous flow, and let the codex, timeline, relationship graph, and inspector keep the world of your book at your fingertips — all in the browser, all your data on your machine.

Inspired by novelCrafter and Scrivener; owned by you.

## Running

```bash
npm install
npm run dev        # development server (usually http://localhost:5173)
npm run build      # production build into dist/
npm test           # test suite in watch mode (see TESTING.md)
```

## The app, view by view

### Library
The home screen. Every novel is a book on the shelf — colored cover, word count, last-edited date. Create, duplicate, delete, and **export/import each novel as a portable `.calliope.json` file** for backups or moving between machines. Each novel lives in its own storage slot, fully isolated.

### Write
The heart of the app: the whole novel as **one continuous scrolling manuscript**. Chapter headings, scene titles, and prose are all editable in place.

- **Structure** — the left binder (Scrivener-style) holds Acts → Chapters → Scenes with drag-and-drop reordering and nesting, inline rename, status dots, word counts, outline mode, and collapse/expand. Only chapters are mandatory: a chapter can hold scenes, or be written as one flowing text and split into scenes later. Scrollspy keeps the binder and the manuscript in sync both ways.
- **The page** — styled like a real sheet (A4 or 6×9″ trade book) with configurable margins, or as a flat column. Book, justified typography with first-line indents (all switchable). Focus mode strips every distraction.
- **Manuscript pages** — a stable coordinate system: 250 words = 1 page (the trade convention), shown as margin ticks or full-width page lines with configurable spacing. The footer tracks your current page (`p. 47 / 320`, click to jump). Word-based, so the numbers are identical on every screen and barely drift under revision — better for "I remember that was around page 120" than layout pages, which silently renumber.
- **Codex in the text** — names and aliases of codex entries get dotted underlines in each entry's own color (toggleable, rendered via the CSS Highlight API so your text is never modified). Hover a mention for a wiki card; click it to read the entry in the Inspector. Select any name to add it to the codex in one click.
- **Highlights & comments** — select a passage, hit the marker: it's highlighted (four colors) with an attached comment, anchored to the text itself so it survives revisions. Click a highlight to edit its comment in place.
- **Clean paste** — pasted text keeps its paragraph structure (including rejoining hard-wrapped ebook text) but drops all external formatting.
- **Inspector** (right panel, tabbed):
  - *Codex* — entries mentioned in the active scene; click to read the full entry without leaving the editor, hop between related entries.
  - *Highlights* — every highlight in manuscript order, with comments; click to jump.
  - *Scene* — title, status (Idea → Draft → Revised → Done), and summary of the scene under your cursor.

### Codex
The story bible. Five entry types — Characters, Locations, Items, Lore, Organizations — with aliases (also used for in-text detection), one-liners, descriptions, private notes, tags, and color coding. Entries open as **read-first wiki articles** with an edit mode behind a button. The **Relations view** renders the cast as a live force-directed graph: drag, zoom, hover to spotlight a neighborhood, link two entries by clicking them, label and direct the edges.

### Timeline
A zoomable, pannable timeline with a custom unit (e.g. "Year AE"). Point events and life/era spans organized into tracks, with drag-to-move, automatic row stacking, hover tooltips, and links that jump to scenes or codex entries.

### Everywhere
- `Ctrl/Cmd+K` global search across scenes and codex
- Manuscript export to Markdown or plain text (with optional summaries and codex appendix)
- Three themes (dark / light / parchment), custom background art, per-novel appearance settings
- Navigation as a VS Code-style activity bar or a classic top bar — your choice
- Autosave on every change

## How it's built

React 18 + Vite, no UI framework — hand-rolled CSS design system with theming via CSS variables. State is a single reducer store per novel (React context), persisted to localStorage with a library index; every structure added later (timeline, relationships, highlights…) migrates old saves automatically. The manuscript editor is uncontrolled `contentEditable` per scene, with decorations (mention underlines, user highlights) applied through the **CSS Custom Highlight API** — the document HTML itself is never polluted, so saves, exports, and undo stay clean. Text anchors (highlights) attach to quoted text rather than positions, making them revision-tolerant.

```
src/
  App.jsx                  shell: routing, activity bar / top bar, appearance
  store.jsx                data model, reducer, persistence, library, migrations
  styles.css               design system (themes, every component's styles)
  components/
    library/               bookshelf home screen
    editor/                continuous manuscript editor + binder sidebar
    codex/                 codex views, wiki article, relationship graph
    timeline/              timeline view
    modals/                search, export, novel details, settings
  test/                    Vitest + Testing Library suite (see TESTING.md)
```

## Data & backups

Everything is stored in your browser's localStorage (`calliope.library.v1` plus one `calliope.novel.<id>` slot per novel). **Export your novels to `.calliope.json` regularly** — browser storage is not a backup. Imports restore the complete novel: manuscript, codex, relationships, timeline, highlights, and settings.

## Roadmap ideas

Print/PDF export with true pagination (the browser's print engine does line-level page breaks natively), scene snapshot history in the Inspector, maps (image-backed, codex-pinned — see plan discussion), file-system autosave backups, and deployment as an installable PWA.
