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
Never hand-write a second interface or a hand-rolled JSON schema for a prompt. The
`//#region schema-overview` blocks are frozen snapshots — their generator is disabled
(`_disabled_schema:overview` in `package.json`).

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
- **New entity create/edit actions are not hand-written**: describe the differences in an
  `EntityActionSpec` (`services/aiActions/spec.ts`) and let `factory.ts` build the action.
- **Gate LLM features on `LlmCapabilities`, never on provider names** (`services/llmClient.ts`).
  Claude-only features live in `anthropicExtras.ts`, outside the portable interface.
- **New card editors go through `createCardEditor`** (`editor/cardEditor.svelte.ts`), and anything
  that switches the active file must go through `confirmNavigation` (`stores/navigationGuard.ts`)
  or unsaved edits are lost silently.

## Character files are versioned

They outlive every program version, so `schemas/character.ts` owns an ordered pipeline
(`CHARACTER_VERSION`, `CHARACTER_UPGRADES`, `upgradeCharacter`) rather than ad-hoc field repairs.

A schema change means: bump `CHARACTER_VERSION` and add **exactly one** step with that `to`. Keep
`apply` idempotent *and* content-guarded — legacy files often carry no `_version` (or a stale one)
although the change already happened. `_version` is a plain positive int, not a literal union, so a
file written by a newer build still loads in an older one.

The batch upgrade (`services/characterUpgrade.ts`) writes the *migrated raw* object, not the
normalised one — the point is to update the file, not inflate it with every default.

## Releases

Push a tag `vX.Y.Z`; `.github/workflows/release.yml` derives the version, pushes it into
`tauri.conf.json` / `package.json` / `package-lock.json`, and creates a **draft** release with the
signed installer and `latest.json` for the auto-updater. **Never bump the version by hand.** The
signing keys are set up as GitHub secrets — never commit the private key.
