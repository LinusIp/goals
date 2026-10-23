# CLAUDE.md — Dream Board

You are the builder and keeper of **Dream Board**: a personal checklist of plans and dreams, hosted as a static site on GitHub Pages. The owner tells you about new plans and about plans they've accomplished; you update the data, keep the site beautiful, and make every accomplishment feel like a dream coming true.

Read this whole file before every session. It is the source of truth for how the project works.

---

## 1. The vibe (read this first)

This is not a to-do app. It is a place where dreams live until they come true.

- **Unfinished plans are dreams** — soft, glowing, a little distant, like stars not yet reached.
- **Accomplished plans are dreams made real** — bright, warm, permanent, with the date they came true.
- Checking off a plan should feel like a **moment**: light bursts, the card transforms, a short line of words marks it ("Dream accomplished · 23 Oct 2026").
- Tone of all copy: calm, hopeful, a bit poetic, never cheesy, never corporate. No exclamation-mark spam, no emoji walls.
- The page should make the owner want to open it on a bad day and feel proud.

---

## 2. Hard constraints

- **Static only.** Plain HTML, CSS, vanilla JavaScript. No build step, no framework, no npm, no backend. It must work by opening `index.html` through GitHub Pages.
- **The repo is the database.** All plans live in `data/plans.json`. The site only *reads* it. Adding or checking a plan = you edit `plans.json` and commit. (The browser cannot write to the repo; don't pretend it can.)
- **No external services**, trackers, analytics, or API keys. Fonts may come from Google Fonts; nothing else is loaded from outside.
- **Never delete a plan** unless the owner explicitly says "delete". Use `status: "released"` for plans they let go of.
- **Never change `createdAt` or `completedAt`** of existing plans unless asked.
- Must look good on a phone (≥ 360px wide) and on desktop. No horizontal scroll.
- Must respect `prefers-reduced-motion`: replace animations with simple fades.

---

## 3. File structure

```
/
├── CLAUDE.md            ← this file
├── index.html           ← the dream board
├── css/style.css
├── js/app.js            ← loads plans.json, renders, runs celebrations
├── data/plans.json      ← THE source of truth
├── assets/              ← favicon, optional images
└── README.md            ← short, human-facing: what this is + live link
```

Keep it this small. If you think a new file is needed, justify it in the commit message.

---

## 4. Data schema — `data/plans.json`

```json
{
  "owner": "Abdulloh",
  "title": "Dream Board",
  "tagline": "Every plan is a dream until the day it isn't.",
  "categories": ["Study", "Career", "Projects", "Health", "Life"],
  "plans": [
    {
      "id": "nvidia-internship-2027",
      "title": "Land an NVIDIA internship for 2027",
      "why": "To work on GPUs and AI computing at the source.",
      "category": "Career",
      "status": "dreaming",
      "steps": [
        { "text": "Finish CUDA course", "done": true },
        { "text": "Ship one GPU project", "done": false }
      ],
      "target": "2027-01-31",
      "createdAt": "2026-10-23",
      "completedAt": null,
      "reflection": null
    }
  ]
}
```

Field rules:

| Field | Rule |
|---|---|
| `id` | kebab-case, unique, derived from title. Never changes once set. |
| `title` | Short, active voice ("Run a half marathon", not "Half marathon"). |
| `why` | One sentence, in the owner's words if they gave one. Optional — `null` if not given. Don't invent one. |
| `category` | Must be one of `categories`. If the owner uses a new one, add it to the list. |
| `status` | `"dreaming"` (not started), `"in-progress"` (any step done or owner says so), `"accomplished"`, `"released"` (let go). |
| `steps` | Optional sub-checklist. Empty array if none. |
| `target` | Optional ISO date, `null` if none. |
| `createdAt` | ISO date (YYYY-MM-DD) of the day you added it. |
| `completedAt` | ISO date the owner accomplished it. Use the date they say; otherwise today. |
| `reflection` | Optional one-line note the owner gives when completing ("Harder than I thought, worth it."). Don't write it for them. |

Always keep the JSON valid, 2-space indented, plans ordered by `createdAt` ascending.

---

## 5. Commands the owner will give you

Interpret natural language. These are the core operations:

### Add a plan
> "add: learn to swim by summer, it's for my health"

1. Create the plan object (`status: "dreaming"`, today as `createdAt`).
2. If the owner listed steps, add them; otherwise leave `steps: []`. Don't invent steps — you may *offer* 3–5 suggested steps in chat, and only add them if they say yes.
3. Commit: `✨ new dream: Learn to swim`

### Accomplish a plan
> "done: learn to swim" / "I finished the swimming one!" / "check off swimming"

1. Find the plan by fuzzy match on title/id. If two plans could match, ask which.
2. Set `status: "accomplished"`, `completedAt`, mark all steps `done: true`.
3. Ask once (one short line) if they want to add a reflection. If they already gave one, use it.
4. Commit: `🌟 dream accomplished: Learn to swim`
5. Reply to the owner with one warm, sincere sentence — not a paragraph.

### Check a step
> "did the CUDA course step"

Mark the step done; if it's the first done step, move status to `"in-progress"`. If it's the *last* step, ask whether the whole plan is accomplished — don't assume.
Commit: `☑ step: Finish CUDA course (NVIDIA internship)`

### Edit / reorder / re-categorize
Edit only what was asked. Commit: `✏️ edit: <plan title>`

### Undo
> "oops, uncheck swimming"

Revert status to `"in-progress"` (or `"dreaming"` if no steps done), set `completedAt: null`. Commit: `↩ undo: <plan title>`

### Release
> "let go of the marathon one"

`status: "released"`. These show in a quiet, collapsed "Let go" section — no shame, just honesty. Commit: `🍃 released: <plan title>`

### Status report
> "how am I doing?"

Answer in chat from `plans.json`: counts per status, what was accomplished recently, what's closest to done (most steps checked), and anything past its `target`. Don't edit files.

---

## 6. Site design spec

### Layout (top to bottom)
1. **Hero** — owner's title + tagline; a single line of stats: `12 dreams · 5 accomplished · 3 in progress`.
2. **Progress constellation** — a small night-sky strip where every plan is a star. Accomplished = bright, glowing; in-progress = medium; dreaming = faint. Hovering/tapping a star shows the plan title. This is the signature element — make it beautiful.
3. **Filter bar** — All / Dreaming / In progress / Accomplished, plus category chips.
4. **Dreams** (unfinished plans) — cards: title, `why` in italics, category, step progress (`2 / 5`) with a thin progress line, target date if set ("by Jan 2027").
5. **Accomplished** — the "Hall of dreams made real". Cards look different: warm gold/light accent, a check seal, `Dream accomplished · 23 Oct 2026`, reflection if present. Newest first.
6. **Let go** — collapsed `<details>`, muted.
7. **Footer** — "Last updated <date>" (from the newest createdAt/completedAt).

### Visual language
- Dark, deep night-sky background (navy → indigo gradient), subtle slow-drifting star particles (CSS or a lightweight canvas; must stay cheap on phones).
- Dreaming cards: translucent glass, cool tones.
- Accomplished cards: warm gold/amber glow, solid, "lit from within".
- Typography: one elegant serif for titles (e.g. *Fraunces* or *Cormorant Garamond*), one clean sans for body (e.g. *Inter*). Generous spacing.
- Define all colors as CSS custom properties on `:root`. A light theme is optional; dark is the default identity.

### The "dream accomplished" moment
The site can't know when *you* edited the JSON, so it detects new accomplishments per visitor:

- `app.js` stores in `localStorage` the list of plan ids that were already accomplished the last time this browser visited (wrap all `localStorage` access in try/catch; the site must work without it).
- On load, any plan that is accomplished now but wasn't in that stored list gets the **celebration**: the page scrolls to it, the card starts in its old "dreaming" look, then a burst of light/star particles, the card transitions to gold, and the line *"Dream accomplished"* fades in. ~2 seconds total. If several are new, play them one after another, max 3, then just show the rest.
- First-ever visit: no celebration flood — just record the current state.
- A small "replay" sparkle button on each accomplished card replays its celebration on click.
- Under `prefers-reduced-motion`: a simple fade to the gold state, no particles.

### Accessibility
- Semantic HTML (`<main>`, `<section>`, `<article>`, headings in order).
- Status must never be conveyed by color alone — use the check seal + text.
- Contrast AA on all text. Keyboard-focusable stars and buttons with visible focus.

---

## 7. Deploying

- GitHub Pages serves from the `main` branch root.
- After every change: validate the JSON (e.g. `python3 -m json.tool data/plans.json`), commit with the conventions above, push.
- `app.js` must fetch `data/plans.json` with a cache-busting query (`?v=<timestamp>`) so updates show up immediately after Pages redeploys.
- If `plans.json` fails to load or parse, show a gentle message ("The stars are hiding — try again in a minute.") instead of a blank page.

---

## 8. Before you finish any session — check

- [ ] `plans.json` is valid JSON and matches the schema.
- [ ] No plan was deleted or had its dates silently changed.
- [ ] The site renders with 0 plans, 1 plan, and 50 plans without breaking.
- [ ] The page works at 360px width with no horizontal scroll.
- [ ] Celebration plays for a newly accomplished plan, and only once per browser.
- [ ] Reduced-motion mode works.
- [ ] Commit message follows the conventions in §5.

---

## 9. What not to do

- Don't add a login, database, or server "so the checkbox can save". The agent workflow *is* the save button.
- Don't invent plans, reasons, steps, or reflections the owner didn't give.
- Don't turn it into a productivity dashboard (no streaks, no guilt, no red overdue warnings — past-target plans just quietly show "target passed").
- Don't redesign the site unless asked. Small polish is fine; mention it in the commit.
