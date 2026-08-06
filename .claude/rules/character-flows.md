---
paths:
  - "src/lib/services/**/*.ts"
  - "src/lib/domain/**/*.ts"
  - "src/lib/pdf/**/*.ts"
---

# One sink per mechanic

Every rule here exists because the same mechanic was once applied in two places and the two
drifted apart. A second call site is the mistake, not a missing feature.

- **Weapon proficiency is asked in exactly one place**: `isProficientWithWeapon`
  (`services/weaponProficiency.ts`) — the two category flags plus
  `proficiencies.individualWeapons`, sharing its `weaponNameSet`/`coversWeapon` matcher with
  `character.masteries`. `proficiencies.otherWeapons` is free text with no mechanical effect
  („Martial weapons with Finesse" is prose, not a weapon list), so a `weaponsOther` GRANT may not
  land there when it names a weapon: `matchWeaponName` (`itemLibrary.ts`) is the one arbiter, used
  by `applyChanges` (both flows, via `ApplyContext.resolveWeaponName`) and by the legacy fix
  `kind: 'weapons'`. Without a resolver the value stays prose — that is a silent loss of
  mechanics, so a new `applyChanges` call site passes one. No library schema names an individual
  weapon — the player declares one by hand, **a model cannot invent one**.
- **Weapon mastery is a field on the item** (`itemSchema.mastery`) — no weapon-kinds table, no
  generator, no seeding, and a magic variant inherits nothing.
- **A spell level table is read at a different level depending on the carrier**: class feature →
  CLASS level, trait/feat → CHARACTER level (the elf lineage table 1/3/5 hangs on it). In a
  multiclass those differ, which is why `declaredSpellGrants` is called twice
  (`declaredSpells` vs `charLevelSpells`) instead of over one merged list.
- **Both flows carry ONE tagged list** (`FeaturePrep.declared`, `declaredSources`) and filter it
  by declaration kind, never by origin.
- **A declaration that leaves the AI input owes the sheet its line.** The moment a feature is
  filtered out, Pass C writes no `sheetNote` for it — `optionListNoteLines` /
  `spellAccessNoteLines` are not decoration, they are the thing that keeps the choice from
  vanishing off the character sheet.
- **The way OUT of the character is a table too.** `PROFICIENCY_DEFS` (`domain/proficiencies.ts`)
  is total over `keyof ProficiencyFlags` and carries the PDF field name; PDF export, sheet and
  form read it instead of listing the fields. Everything the protocol and the AI context say
  about abilities, skills, saves and proficiencies comes from the one projection
  `characterSummary` (`services/characterSummary.ts`) — it yields values, the caller owns the
  headings, which is why the same list appears English in the prompt and German on screen.
- **What a character can still have linked is decided in one place**:
  `services/characterLegacyLinks.ts` (`collectLegacyFixes`). It detects *and* performs the fix;
  the editor only holds the state it mutates and the UI follow-up (display mirrors, closing
  pickers). A library link can never be a `CHARACTER_UPGRADES` step — `apply` there is synchronous
  and cannot reach the library. **Do not add a second matcher next to it.**
- **A character's folder name is a generated UID, never their name**, and the one place that turns
  a folder into a display name is `services/characterDirectory.ts` — rendering a folder name is the
  bug, not a fallback. Campaign and session frontmatter (`characters: [...]`) plus vault links hold
  those UIDs, which is why there is no rename: `services/migrateCharacterUids.ts` rewrote
  `vault/campaigns/**` once for the old name-slug folders and gets no successor.
- **The multiclass skill line is not in Open5e**, only in the German SRD extract. It lives in the
  vault as `skillGrantMulticlass` and must survive a re-import.
