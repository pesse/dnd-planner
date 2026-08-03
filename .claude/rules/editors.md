---
paths:
  - "src/lib/components/**"
  - "src/lib/editor/**/*.ts"
  - "src/lib/stores/**/*.ts"
  - "src/lib/services/characterEditor.svelte.ts"
---

# Card editors and the character draft

- **New card editors go through `createCardEditor`** (`editor/cardEditor.svelte.ts`), and anything
  that switches the active file must go through `confirmNavigation` (`stores/navigationGuard.ts`)
  or unsaved edits are lost silently. The character sits one layer above it in
  `services/characterEditor.svelte.ts`: fields are edited in place on the draft, but a `Change[]`
  is applied ONLY through `apply`/`applyLevelUp` — they replace the draft REFERENCE, which is what
  remounts the form and re-bases the diff tinting. A second apply path loses the last keystrokes.
