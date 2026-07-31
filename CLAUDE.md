# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repository. Only things the code does not
show: prohibitions, non-local couplings, and how to run this thing. Everything else, read from
the source.

## Commands

| Task | Command | Where |
|---|---|---|
| Typecheck + lint — **the** verification gate | `npm run check` | WSL |
| Browser-only dev server (UI work without Tauri commands) | `npm run dev` → `:1420` | WSL |
| Full app | `.\dev-windows.ps1` | Windows PowerShell |
| Watch the running app | `tail -f /mnt/c/dev/privat/dnd-planner/tauri-dev.log` | WSL |
| Install packages | `npm install` | Windows PowerShell |
| Prompt-quality evals (`evals/README.md`) | `npm run eval` | **the user runs these, never Claude** |

There is no `test` script — Vitest exists only for the eval suite, which makes real, paid LLM
calls. `npm run check` is what verifies a change.

## Environment: Windows runs the app, WSL edits it

**Start the app on Windows, never in WSL** — WSL has no GPU access, so rendering crawls.
`dev-windows.ps1` runs `npm run tauri dev` and tees all output into `tauri-dev.log`; that log is
how Claude observes the running app from WSL.

**`npm install` must run on Windows too** — the app uses the Windows `node_modules`. Installing in
WSL only updates `package.json` / `package-lock.json`; the user then repeats it in PowerShell,
which works while the dev server runs because Vite picks the package up. **Never tell the user to
stop the dev server just to install something.**

Changes under `src-tauri/` need a full Rust recompile; hot-reload covers only the Svelte side.

## Conventions

### English in the technical layer, German on screen

| | Language |
|---|---|
| Identifiers, types, schema keys, enum values | English |
| Closed rule vocabularies (skills, abilities, weapon categories, armor trainings, masteries) | English, SRD spelling |
| LLM system prompts and instructions | English |
| UI labels, dialogs, errors, anything a user reads | German |
| Vault content fields (`nameDe`, descriptions, rule text) | German |
| Code comments and commit messages | German |

One legacy exception, at the PDF boundary: parts of `character.*` carry German keys
(`ges`/`wei`/`kon`, `skills.MitTierenUmgehen`, `alleskoenner`, `currency.km`, `personal.*`) because
they mirror the German Taendler character sheet. **Do not extend it** — new character fields get
English names, the way `hpMax`, `strSaveProf` and `proficiencies.lightArmor` already do.

### Comments carry why-it-is-not-the-obvious-way — nothing else

Delete it if it is in `git log` („Ersetzt den früheren …") or in the code right below it; move it
if it describes a different file. What survives: choices a reader would otherwise undo (`Bewusst
tool-frei — sonst fährt runAiAction einen Agent-Loop`), constraints a type cannot express, causal
chains. 1–3 lines, naming the consequence. Repetition wants a factory, not a comment about it.

### One Zod schema per artifact

`src/lib/schemas/` is the single source: schema → TS type → runtime validator → LLM JSON schema.
Never hand-write a second interface or a hand-rolled JSON schema for a prompt.

`schemas/exampleObjects/*.json` is a generated shape view (one example object per exported
schema, `featSchema` → `feat.json`) — read it instead of skimming a whole schema file, but never
edit it: after a schema change run `npm run schema:examples` (`:check` fails on a stale file).

## Architecture

**Stack:** Tauri 2 (Rust) + SvelteKit (SPA via `adapter-static`, no SSR) + Svelte 5 + Vite +
TypeScript. Port 1420 is fixed, required by Tauri. Commands live in `src-tauri/src/lib.rs` and
`libraries.rs` — read `generate_handler!` for the current set.

All paths go through `resolve_path()`, which walks up from `current_dir()` until it finds a
`vault/`, because Tauri's working directory varies with how the app was launched. The frontend
passes paths as `./vault/campaigns/…`.

**Vault base** is resolved once in the Tauri `setup` hook into `VAULT_BASE`: release builds use the
app identifier path (`%LOCALAPPDATA%\de.developer-sam.dnd-planner\vault`), dev builds
(`debug_assertions`) the repo vault. On startup, `find_legacy_vault` / `migrate_legacy_vault` move
an older vault in — but only when the current one is empty.

**Adding a library type** means touching all of: `roots` in `vault/libraries.yaml`, `ALLOWED_ROOTS`
in `src-tauri/src/libraries.rs`, and the seven vault export/import sites in `lib.rs`.

**Library content declares which app version can read it**: `min_app_version` in
`vault/libraries.yaml` → `minVersion` per `index.json` entry → `satisfies_min` / the
`appOutdated` state in `libraries.rs`. Content that starts relying on a new schema field
must raise the value **in the vault repo** — nothing here can detect that. The gate only
protects clients from 0.2.1 on; older ones ignore the field. It is off in debug builds:
the committed version is always the *last* release, so a declaration pointing at the
coming one would lock development out of its own content.

`vault/` is a separate content repo with its own `CLAUDE.md` — read it before touching vault data.
It owns the provenance rules (`source`: `srd-2024` | `phb-2024` | `homebrew-sam`); the app-side
vocabulary is `SOURCE_KEYS` / `sourceField()` in `schemas/shared.ts`.

## Rules that are invisible in the code

- **The closed rule vocabularies are English** (`SKILL_NAMES`, `ABILITY_NAMES`,
  `WEAPON_CATEGORIES`, `ARMOR_TRAININGS`, `WEAPON_MASTERIES` in `schemas/shared.ts`), and German
  appears at exactly two boundaries: PDF sheet keys (`pdf/characterFields.ts`) and display labels
  (`services/proficiencyGrants.ts`). **Adding a third translation table is the mistake to avoid.**
  Prompts name the vocabulary via `z.enum(SKILL_NAMES)`; translation happens when a `Change` is
  *applied*, not when it is produced.
- **Tools and languages stay German free text** on purpose — no closed vocabulary, and in 2024
  languages are not a proficiency at all.
- **The multiclass skill line is not in Open5e**, only in the German SRD extract. It lives in the
  vault as `skillGrantMulticlass` and must survive a re-import.
- **Weapon mastery is a field on the item** (`itemSchema.mastery`) — no weapon-kinds table, no
  generator, no seeding, and a magic variant inherits nothing. The character stores weapon *names*;
  the property is resolved at render time, so a swap needs no write-back.
- **Weapon mastery is not an AI path.** `isFlowOwnedChoiceFeature` keeps it out of the level-up
  prompt, and the options must come from the library, never from a model.
- **The feature interpretation is monolingual English, with a translation boundary.** Analysis and
  effects pass (`aiActions/featureEffectsAction.ts`) see English only — `buildFeatureEffectsInput`
  strips `nameDe`/`descDe` although `GainedFeature` carries them. German is produced by the two
  thinking-free calls in `featureTranslationAction.ts` (choices for the checkpoint, sheet notes for
  the PDF box) and by `fieldSummaryAction`, which stays German because its input is the *player's*
  prose. Two consequences: a German label in a choice is a **quote** from `descDe`, never a
  translation, and a length budget always belongs to the target language (`SHEET_NOTE_EN_MAX_CHARS`
  → `SHEET_NOTE_MAX_CHARS`). A failed translation degrades to English, it never blocks.
- **A choice is stored twice:** `features[].choice` is the English canonical label (it goes back to
  the model as `<past_choices>`), `choiceDe` the display. `LevelUpQuestion.options` carries the pair
  as `value`/`label`, so `answerValues` feeds the model and `answerLabels` the sheet. Legacy files
  hold German in `choice` — that field is also the discriminator „choice entry vs. feat link", which
  is why upgrade step 5 copies instead of moving it.
- **Spell selection is not an AI path either.** Counts come from `services/spellcasting.ts`
  (class table, plus the one prose constant `SPELLBOOK_START_SPELLS` — Open5e emits no column
  for the wizard's starting six), options come from `vault/spells`. 2024 has no "Spells Known":
  what is persisted follows `PrepRegime` — only the wizard's book and prepared list differ, for
  cleric/druid the known pool *is* the class list and is deliberately not written to the file.
  A feature that lets the player choose spells emits an `AnalysisChoice` of type `spell-pick`
  carrying only count/level/class list — **never spell names**.
- **A feature whose only content is a choice declares it**, via `grantsChoice`
  (`featureChoiceGrantSchema` in `schemas/shared.ts`: `weaponMastery` | `featCategory` |
  `spellcasting` | `spellAccess` | `optionList` | `expertise`). That declaration is what keeps
  it out of the AI feature analysis; the name-based predicates (`isWeaponMasteryFeature`,
  `isSpellcastingFeature`) are only the fallback for vault entries that do not carry the field
  yet. `optionList` carries the consequence **next to each option** (`options[].grants`), which
  is what makes `determinesFurtherEffects` structurally false — no blocking, no re-analysis.
  A German option label is a **quote** from `descDe` (`labelDe`), never a translation.
- **The declaration triple is identical at class feature, trait and feat** — one spread,
  `featureDeclarationFields` (`schemas/shared.ts`), so a fourth field reaches all three
  carriers by itself. Consequently **the origin of a feature decides exactly one thing**: which
  sheet field its note line goes into (`forClassFeaturesField`, `services/declaredFeature.ts`).
  `source` lives on `DeclaredFeature`, never in a vault schema — a trait does not know it is a
  trait, the flow does. Both flows carry ONE tagged list (`FeaturePrep.declared`,
  `declaredSources`) and filter it by declaration kind, never by origin.
- **A spell level table is read at a different level depending on the carrier**: class feature →
  CLASS level, trait/feat → CHARACTER level (the elf lineage table 1/3/5 hangs on it). In a
  multiclass those differ, which is why `declaredSpellGrants` is called twice
  (`declaredSpells` vs `charLevelSpells`) instead of over one merged list.
- **At a FEATURE, `grants.proficiencies` is the only proficiency sink.** `proficiencyGrant`
  survives only at the class head and the background — those are not features.
  `foldLegacyProficiencyGrant` lifts the old field and **must run on every read path**
  (`schemaValidation`, `speciesLibrary`, `featsLibrary`, both Open5e mappers): the schemas are
  not `strict`, so a forgotten path loses the proficiency without a parse error.
  `skills.choose` IS used there (elf, human, `skilled`) — but by `collectGrants`, which asks
  the question, while `withGrant`/`proficiencyGrantChanges` only apply `skills.fixed`.
- **A declaration that leaves the AI input owes the sheet its line.** The moment a feature is
  filtered out, Pass C writes no `sheetNote` for it — `optionListNoteLines` /
  `spellAccessNoteLines` are not decoration, they are the thing that keeps the choice from
  vanishing off the character sheet. The mechanics no longer need that check — see the next
  rule — but the sheet line still does.
- **A grant field without a sink is a compile error, not a silent gap.** Both flows apply
  through the one applier (`services/applyChanges.ts`), whose `default` branch is a `never`
  guard, and both projections into `Change[]` are tables typed over `keyof` their source form
  (`riderGrantChanges` over `RiderProficiencies`, `proficiencyGrantChanges` over
  `ProficiencyGrant`). Adding a field or a `Change` variant breaks the build until it has a
  sink. This exists because the same gap shipped twice: `weaponProficiency`/`armorTraining`,
  then `savingThrows`/`weaponsOther`/`tools`/`languages` — all four silently dropped by the
  level-up while the wizard applied them. **Do not hand-enumerate fields next to these tables.**
- **`grants` is optional WITHOUT a default** (`featureGrantSchema`, plus `grantsChoice`/
  `grantsSpells` alongside it). Missing field = the entry was never redacted and still runs
  through the AI chain; `{}` = reviewed, grants nothing. Erase that distinction and every
  coverage gap goes silent — an imported or homebrew feature would lose its mechanics
  unnoticed. It is also why there is no cut-over date: the chain shrinks with coverage
  (`docs/plan/plan-wahlen-deklarieren.md`).
- **New entity create/edit actions are not hand-written**: describe the differences in an
  `EntityActionSpec` (`services/aiActions/spec.ts`) and let `factory.ts` build the action.
- **Gate LLM features on `LlmCapabilities`, never on provider names** (`services/llmClient.ts`).
  Claude-only features live in `anthropicExtras.ts`, outside the portable interface.
- **New card editors go through `createCardEditor`** (`editor/cardEditor.svelte.ts`), and anything
  that switches the active file must go through `confirmNavigation` (`stores/navigationGuard.ts`)
  or unsaved edits are lost silently.
- **What a character can still have linked is decided in one place**:
  `services/characterLegacyLinks.ts` (`collectLegacyFixes`). It detects *and* performs the fix;
  the editor only holds the state it mutates and the UI follow-up (display mirrors, closing
  pickers). A library link can never be a `CHARACTER_UPGRADES` step — `apply` there is synchronous
  and cannot reach the library. **Do not add a second matcher next to it.**

## Character files are versioned

They outlive every program version, so `schemas/character.ts` owns an ordered pipeline
(`CHARACTER_VERSION`, `CHARACTER_UPGRADES`, `upgradeCharacter`) rather than ad-hoc field repairs.

A schema change means: bump `CHARACTER_VERSION` and add **exactly one** step with that `to`. Keep
`apply` idempotent *and* content-guarded — legacy files often carry no `_version` (or a stale one)
although the change already happened. `_version` is a plain positive int, not a literal union, so a
file written by a newer build still loads in an older one.

**Nothing writes the upgrade to the file behind the user's back, and there is no batch action.**
Loading always runs the pipeline in memory, so the in-editor draft is current while the file is
not; `pendingCharacterUpgrade` reports that gap and the character's Bearbeiten-Tab shows it as a
banner with a one-click *Aktualisieren*. That button only marks the editor dirty (via the
`extraDirty` hook) — the normal save bar does the writing, per character.

## Releases

Push a tag `vX.Y.Z`; `.github/workflows/release.yml` derives the version, pushes it into
`tauri.conf.json` / `package.json` / `package-lock.json`, and creates a **draft** release with the
signed installer and `latest.json` for the auto-updater. **Never bump the version by hand.** The
signing keys are set up as GitHub secrets — never commit the private key.
