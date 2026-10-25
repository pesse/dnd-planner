---
paths:
  - "src/lib/components/**"
  - "src/lib/editor/**/*.ts"
  - "src/lib/stores/**/*.ts"
  - "src/lib/services/characterEditor.svelte.ts"
---

# Card editors and the character draft

- **New card editors go through `createCardEditor`** (`editor/cardEditor.svelte.ts`), and anything
  that switches the active file goes through `navigateTo` (`services/navigation.ts`) — it owns the
  `confirmNavigation` guard, the type's side effects and the back/forward history in one place.
  Setting `activeFile` directly loses unsaved edits silently and desynchronises the history. A
  rename or save-as is NOT navigation: the same entry gets a new path, so it takes `replaceActive`,
  and a deleted or discarded entry takes `closeActive`. The character sits one layer above it in
  `services/characterEditor.svelte.ts`: fields are edited in place on the draft, but a `Change[]`
  is applied ONLY through `apply`/`applyLevelUp` — they replace the draft REFERENCE, which is what
  remounts the form and re-bases the diff tinting. A second apply path loses the last keystrokes.
- **Clicking an icon never leaves the page; clicking a name or link does.** An item/spell/library
  icon calls `peekEntry` (`services/entryPeek.ts`) and shows the card as a popup over the current
  page; its „Seite öffnen …" and every text link go through `navigateTo`. A new entry type gets a
  branch in `ui/EntryPeekModal.svelte`, never a popup of its own.
- **A character folder name is a UID and never a label** — sidebar, badge bar and transfer modal
  read their names through `services/characterDirectory.ts`.
