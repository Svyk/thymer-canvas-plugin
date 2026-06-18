# Plexus Canvas

A native [Thymer](https://thymer.com) infinite-canvas whiteboard, **built from scratch** (no `@excalidraw` runtime dependency) — full Obsidian-Excalidraw parity plus Thymer-native elevation. A drawing **is a record**: the scene lives in a `Scene` file property (or a file blob), the note half is the record's line items, and the preview is the record banner.

Companion graph plugin: [**Plexus Brain**](https://github.com/Svyk/plexus-brain) (a from-scratch TheBrain/ExcaliBrain-style relationship graph).

## Install / update

The plugin is installed via the **Plugins Manager** (`ahpatel/thymer-plugins-manager`):

1. Plugins Manager → **Install Plugin** → point it at this repo (`https://github.com/Svyk/thymer-canvas-plugin`).
2. To update: Plugins Manager → the **Plexus Canvas** card → **Reinstall from source (force overwrite)** → **reload the tab/app**.

> The plugin is a single `plugin.js`, server-stored and **identical on web + desktop** — if something looks missing on one client, it's a stale tab. **Hard-reload (⌘⇧R)**.

## Storing the scene in a property (per collection)

A flipped note stores its drawing in a **`Scene` file property** when the record's collection has one — clean, no body clutter. It also mirrors on-canvas text into a **`Canvas Text` text property** so your visual text is findable by Thymer search. Collections **without** these properties fall back to a body `plexus-scene.json` attachment.

A plugin **cannot** add a property to a collection (the Thymer SDK has no such API), so add them once per collection:

**Manual add (any collection):**
1. Open any record in that collection → the **Properties** section → click the **`+`** (Add property).
2. Name it **`Scene`**, type **File** → save.
3. Add a second property: **`Canvas Text`**, type **Text** → save.

That's it — flipping any record in that collection then stores the scene in the property, and its canvas text becomes searchable. Existing flipped notes **auto-migrate** out of the body into the property the next time you open them.

> New collections need this one-time add too (there's no auto-hook). The properties already exist on the main content collections (Journal, Notes, Captures, Meetings, People, Projects, Inbox, Sticky Notes, Areas, Goals, Reflections, Quotes, HQ, Topics, Scratchpad, Wish List, Plexus Drawings).

## What it does

Run these from the command palette (most also have toolbar buttons / hotkeys):

- **Drawing & notes** — `New Drawing`, `New hybrid visual note`, `Flip to drawing` / `Flip to note`, `Open today's whiteboard` (flips today's Journal record into a drawing), `Gallery`.
- **Native tasks** — `Add task` drops a task card backed by a **real Thymer `task` line item**: its checkbox toggles `setTaskStatus`, so the same task is live in the Task Board / Day View / `@task`. Tasks attach to the drawing's own record (a task on today's whiteboard lands on the day).
- **Frames & present** — Frame tool (`F`) owns its contents; `Present` steps through named frames as slides; `Print frames as pages (PDF)`.
- **Thinking tools** — `New mind map` (Tab = child, Enter = sibling), `Icon Library` (records tagged `#icon`), `Colours` (Shade Master + named schemes), `Outline to canvas`.
- **References** — record cards, board-card transclusion of other drawings, `Insert reference (@@)`, `Link selected cards`, `Cite` (snapshot any selection → paste into a note).
- **Content** — `Chart from CSV`, `Insert Mermaid diagram`, `Insert LaTeX equation`, `Import PDF`, `Text to path`, `AI diagram from prompt` (multi-provider, encrypted key).
- **Restructure** — `Extract selection to a new drawing (Pizza Slicer)`, `Capture note`, Boolean union/subtract/intersect, `Schedule card`, Semantic ghost-edges.
- **Settings** — `Plexus: Settings` (collapsible: General · Canvas behavior · Zoom & Pan · Grid · Laser · Fonts · Export · AI · Advanced).

In-canvas hotkeys: `V/R/O/D/A/P/T/E/C/F/L` tools · `Tab`/`Enter` mind-map · arrows nudge · `⌘Z`/`⌘⇧Z` undo/redo · arrows/space step slides in present mode.

## Design principles

- **Built from scratch** — no heavy runtime deps in the hot path; the canvas + Brain engines are 100% native.
- **Speed-first** — designed for a huge graph: the render loop **viewport-culls** (draws only visible elements), uses a dirty-flag, and **lazy-loads** content libraries (KaTeX/Mermaid/pdf.js/polybool) from CDN on-use, off the render loop.
- **Secure AI** — API keys are encrypted at rest (PBKDF2 → AES-GCM, passphrase-locked), wiped from memory on `pagehide`; calls go direct client → provider.

## Deploy notes (for development)

`plugin.js` is past the MCP-echo size limit, so deploy via **git push → Plugins-Manager "Reinstall from source"** (byte-exact). The PM repo link must be the full `https://github.com/Svyk/thymer-canvas-plugin` URL. Roadmap + status: `~/plexus/SCRIPTS-ROADMAP.md`, `BUILD-STATUS.md`.
