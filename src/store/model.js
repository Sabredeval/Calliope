/* ---------- helpers ---------- */

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export const plainText = (html) => {
  const div = document.createElement('div')
  div.innerHTML = html || ''
  return div.textContent || ''
}

export const countWords = (text) => {
  const t = (text || '').trim()
  return t ? t.split(/\s+/).length : 0
}

export const sceneWords = (scene) => countWords(plainText(scene.content))
// A chapter with scenes counts them; a "flow" chapter (no scenes — written
// directly) counts its own content instead.
export const chapterWords = (ch) =>
  ch.scenes && ch.scenes.length ? ch.scenes.reduce((n, s) => n + sceneWords(s), 0) : countWords(plainText(ch.content))
export const novelWords = (chapters) => chapters.reduce((n, c) => n + chapterWords(c), 0)

// Recursive word total for a group (Act/Part/whatever) — its own chapters
// plus every nested child group's chapters.
export function groupWords(groupId, chapters, groups) {
  let total = 0
  for (const c of chapters) if (c.groupId === groupId) total += chapterWords(c)
  for (const g of groups || []) if (g.parentId === groupId) total += groupWords(g.id, chapters, groups)
  return total
}

// Scenes (splitting a chapter into multiple named sub-units) are archived for
// now — the reducer cases, helpers, and rendering branches below still exist
// so the feature is a one-line flip to bring back, but nothing in the UI
// currently offers a way to create one. Existing scene content is folded
// into its chapter's own flow content on load (see ensureHierarchyDefaults).
export const SCENES_ENABLED = false

export const SCENE_STATUSES = [
  { id: 'idea', label: 'Idea', color: 'var(--status-idea)' },
  { id: 'draft', label: 'Draft', color: 'var(--status-draft)' },
  { id: 'revised', label: 'Revised', color: 'var(--status-revised)' },
  { id: 'done', label: 'Done', color: 'var(--status-done)' },
]

export const CODEX_TYPES = [
  { id: 'character', label: 'Character', plural: 'Characters', icon: '👤' },
  { id: 'location', label: 'Location', plural: 'Locations', icon: '🗺️' },
  { id: 'item', label: 'Item', plural: 'Items', icon: '🗝️' },
  { id: 'lore', label: 'Lore', plural: 'Lore', icon: '📜' },
  { id: 'organization', label: 'Organization', plural: 'Organizations', icon: '🏛️' },
]

export const CODEX_COLORS = [
  '#e05c5c', '#e08d3c', '#d4b13f', '#6aab5e', '#4ba0a8', '#5b83d6', '#8a6ede', '#c95d9e', '#8d8d94',
]

/* ---------- timeline seed ---------- */

export const seedTimeline = () => {
  const tHistory = uid()
  const tLives = uid()
  const tStory = uid()
  return {
    unit: 'Year AE',
    tracks: [
      { id: tHistory, title: 'History' },
      { id: tLives, title: 'Lives' },
      { id: tStory, title: 'Story' },
    ],
    items: [
      { id: uid(), trackId: tHistory, kind: 'span', title: 'Reign of the Vaelor Dynasty', start: 320, end: 432, color: '#4ba0a8', description: 'Three centuries of unbroken rule from Vael Keep, ended by the last king’s failed working.' },
      { id: uid(), trackId: tHistory, kind: 'event', title: 'The Sundering', start: 432, end: null, color: '#8d8d94', description: 'The crown is unmade; the royal line and the realm’s bound magic shatter together.' },
      { id: uid(), trackId: tHistory, kind: 'span', title: 'The Interregnum', start: 432, end: null, color: '#8a6ede', description: 'Eighty years without a throne, policed by the Order of the Unlit Flame.' },
      { id: uid(), trackId: tHistory, kind: 'event', title: 'Order of the Unlit Flame founded', start: 434, end: null, color: '#8a6ede', description: 'Survivors of the Sundering swear that no monarch will ever rule again.' },
      { id: uid(), trackId: tLives, kind: 'span', title: 'Vaelor III, the Last King', start: 398, end: 432, color: '#d4b13f', description: 'Crowned at nineteen, unmade at fifty-three by his own ambition.' },
      { id: uid(), trackId: tLives, kind: 'span', title: 'Corvan', start: 478, end: null, color: '#5b83d6', description: 'Disgraced knight of the Order, oath-bound to the ring’s bearer.' },
      { id: uid(), trackId: tLives, kind: 'span', title: 'Aria Thorne', start: 493, end: null, color: '#e05c5c', description: 'Orchard-keeper of Thornfield; the ring finds her at nineteen.' },
      { id: uid(), trackId: tStory, kind: 'event', title: 'Ch 1 · The Burning of Thornfield', start: 512, end: null, color: '#e08d3c', description: 'The novel opens. Thornfield burns; Aria takes the ring from the ashes.' },
      { id: uid(), trackId: tStory, kind: 'event', title: 'Ch 2 · The Road North', start: 512, end: null, color: '#e08d3c', description: 'Aria and Corvan set out for Vael Keep.' },
    ],
  }
}

/* ---------- relationships seed ---------- */

export const seedRelationships = (codex) => {
  const byName = (n) => codex.find((e) => e.name === n)?.id
  const mk = (a, b, label, directed = true) => {
    const fromId = byName(a)
    const toId = byName(b)
    return fromId && toId ? { id: uid(), fromId, toId, label, directed } : null
  }
  return [
    mk('Corvan', 'Aria Thorne', 'sworn protector of'),
    mk('Aria Thorne', 'The Hollow Crown', 'bearer of'),
    mk('Aria Thorne', 'Thornfield', 'grew up in'),
    mk('Corvan', 'Order of the Unlit Flame', 'deserted from'),
    mk('Order of the Unlit Flame', 'Thornfield', 'burned'),
    mk('Order of the Unlit Flame', 'The Hollow Crown', 'hunts'),
    mk('The Hollow Crown', 'The Sundering', 'fragment of'),
    mk('Vael Keep', 'The Sundering', 'holds records of'),
    mk('Order of the Unlit Flame', 'The Sundering', 'founded after'),
  ].filter(Boolean)
}

/* ---------- seed data ---------- */

export const seedState = () => {
  const scene = (title, summary, status, content) => ({
    id: uid(), title, summary, status, content,
  })
  return {
    novel: {
      title: 'The Hollow Crown',
      author: 'King Magdeley',
      wordGoal: 80000,
    },
    groups: [],
    chapters: [
      {
        id: uid(),
        title: 'Chapter 1 — Embers',
        groupId: null,
        content: '<p></p>',
        scenes: [
          scene(
            'The Burning of Thornfield',
            'Aria watches her village burn and finds the sigil ring in the ashes.',
            'draft',
            '<p>The smoke reached Aria before the news did. She stood at the crest of the hollow road, wheat brushing her knees, and watched Thornfield fold into fire the way parchment curls in a hearth — edges first, then all at once.</p><p>By the time she reached the square, there was nothing left to save. Only the well remained untouched, and beside it, half-buried in ash, a ring of blackened silver bearing the sigil of a crown with no jewels. A <em>hollow</em> crown.</p><p>She should have left it in the ash. Instead, she picked it up.</p>'
          ),
          scene(
            'The Stranger at the Well',
            'Corvan introduces himself and warns Aria that the ring is being hunted.',
            'draft',
            '<p>"You should not be holding that," said a voice behind her.</p><p>The man was tall, road-worn, with a crow perched on the pommel of his sword as if it had grown there. He named himself Corvan, and he said the name like an apology.</p><p>"The ones who burned this place were looking for it," he said, nodding at her closed fist. "They will know it survived. Rings like that one want to be found."</p>'
          ),
        ],
      },
      {
        id: uid(),
        title: 'Chapter 2 — The Road North',
        groupId: null,
        content: '<p></p>',
        scenes: [
          scene(
            'Leaving the Ashes',
            'Aria and Corvan set out for Vael Keep; first hints of the Order of the Unlit Flame.',
            'idea',
            '<p>They left before dawn, when the ash still glowed in the ruts of the road. Corvan spoke little, but when he did, it was of Vael Keep, of the Order of the Unlit Flame, and of debts that outlive the people who owe them.</p>'
          ),
        ],
      },
    ],
    codex: [
      {
        id: uid(), type: 'character', name: 'Aria Thorne', aliases: ['Aria'],
        oneLiner: 'A farm girl who inherits a dangerous relic and a more dangerous destiny.',
        description: 'Nineteen, stubborn, sharp-eyed. Grew up in Thornfield tending her late mother’s orchard. Distrusts authority, keeps promises to a fault. Carries the hollow crown ring on a cord around her neck.',
        notes: 'Arc: from survivor to reluctant claimant of the crown. Her flaw is that she confuses self-reliance with safety.',
        color: '#e05c5c', tags: ['protagonist', 'pov'],
      },
      {
        id: uid(), type: 'character', name: 'Corvan', aliases: ['the Crow Knight'],
        oneLiner: 'A disgraced knight-errant bound to protect the ring’s bearer.',
        description: 'Former blade of the Order of the Unlit Flame, now sworn against it. Travels with a tame crow named Sooth. Dry humor, old scars, older guilt.',
        notes: 'Knows more about the ring than he admits. Reveal his oath-brand in Chapter 4.',
        color: '#5b83d6', tags: ['deuteragonist'],
      },
      {
        id: uid(), type: 'location', name: 'Thornfield', aliases: [],
        oneLiner: 'Aria’s home village, burned in the opening chapter.',
        description: 'A wheat-farming village in the southern hollows. Known for its stone well, said to never run dry. Destroyed by riders of the Order searching for the sigil ring.',
        notes: '', color: '#e08d3c', tags: ['destroyed'],
      },
      {
        id: uid(), type: 'location', name: 'Vael Keep', aliases: [],
        oneLiner: 'A half-ruined fortress in the north where answers wait.',
        description: 'Seat of the old kings before the Sundering. Its archives supposedly hold the record of the crown’s unmaking.',
        notes: 'Destination of Act I.', color: '#4ba0a8', tags: [],
      },
      {
        id: uid(), type: 'item', name: 'The Hollow Crown', aliases: ['the sigil ring', 'the ring'],
        oneLiner: 'A blackened silver ring bearing the sigil of a jewelless crown.',
        description: 'The last remnant of the royal regalia, unmade during the Sundering. Whoever bears it can hear the dead kings arguing — faintly, and only at night.',
        notes: 'Rules: it cannot be given away, only taken or inherited. It grows warm near oath-breakers.',
        color: '#d4b13f', tags: ['macguffin', 'magic'],
      },
      {
        id: uid(), type: 'organization', name: 'Order of the Unlit Flame', aliases: ['the Order'],
        oneLiner: 'A militant brotherhood hunting the regalia to keep the throne empty.',
        description: 'Founded after the Sundering on the belief that no monarch should ever rule again. Their zeal has curdled into terror; they burn what they cannot claim.',
        notes: 'Antagonist faction. Their leader believes he is preventing a prophesied tyrant.',
        color: '#8a6ede', tags: ['antagonists'],
      },
      {
        id: uid(), type: 'lore', name: 'The Sundering', aliases: [],
        oneLiner: 'The cataclysm that ended the royal line eighty years ago.',
        description: 'When the last king tried to bind the realm’s magic to his bloodline, the working failed and shattered both. The crown was unmade into fragments; the ring is one of them.',
        notes: '', color: '#8d8d94', tags: ['history'],
      },
    ],
    timeline: seedTimeline(),
    settings: { theme: 'dark' },
  }
}

export const withSeedRelationships = (s) => ({ ...s, relationships: seedRelationships(s.codex) })

