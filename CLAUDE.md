# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repository. Only things the code does not
show: prohibitions, non-local couplings, and how to run this thing. Everything else, read from
the source.

## Commands

| Task | Command | Where |
|---|---|---|
| Everything below in one go — **the** gate before a commit | `npm run verify` | WSL |
| Typecheck + lint | `npm run check` | WSL |
| Unit + integration tests (LLM-free, no API key) | `npm run test` | WSL |
| Browser-only dev server (UI work without Tauri commands) | `npm run dev` → `:1420` | WSL |
| Charakterbögen aus dem Vault als HTML rendern und servieren (`:8899`) | `npm run sheets` | WSL |
| Full app | `.\dev-windows.ps1` | Windows PowerShell |
| Watch the running app | `tail -f /mnt/c/dev/privat/dnd-planner/tauri-dev.log` | WSL |
| Install packages | `npm install` | Windows PowerShell |
| Prompt-quality evals (`evals/README.md`) | `npm run eval` | **the user runs these, never Claude** |

**Two Vitest tracks, and only one of them is Claude's to run.** `tests/` (config
`vitest.config.ts`) is LLM-free and runs without an API key — `tests/unit` needs nothing but the
process, `tests/integration` reads the **real vault** through the production load path via the
`@tauri-apps/api/core` shim in `tests/support/tauriInvokeShim.ts`. `evals/` (config
`vitest.evals.config.ts`, only `*.eval.test.ts`) makes real, paid LLM calls. Shared test data
lives in `tests/fixtures/` and is used by both.

`npm run verify` is what verifies a change: `check` + `check:evals` (the eval track only
typechecks, it never runs here) + `schema:examples:check` + `test`.

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

One legacy exception: parts of `character.*` carry German keys (`skills.MitTierenUmgehen`,
`alleskoenner`, `currency.km`, `personal.*`) because they were named after the German Taendler
sheet the export once filled. They stay because saved character files carry them. **Do not extend
it** — new character fields get English names, the way `hpMax`, `saveProfs` and
`proficiencies.lightArmor` already do.

### One file, one responsibility

Guideline: service/schema module ≤ 300 lines, component ≤ 400 including markup, `<style>` block
≤ 150. Going over is allowed but has to be defensible — „only one thing happens here, it is just
big". A file that needs a table of contents needs a directory instead.

### A section banner is a missing module or a missing function

`// ── Zauber-Picker ──` is not documentation, it is an unextracted `function spellPicker()` or an
unwritten file — write that instead. Numbered step comments (`// 3) Encounter speichern`) say the
same thing about a function: it is a sequence of unnamed phases.

### Comments carry why-it-is-not-the-obvious-way — nothing else

Delete it if it is in `git log` („Ersetzt den früheren …") or in the code right below it; move it
if it describes a different file. What survives: choices a reader would otherwise undo (`Bewusst
tool-frei — sonst fährt runAiAction einen Agent-Loop`), constraints a type cannot express, causal
chains. 1–3 lines, naming the consequence. Repetition wants a factory, not a comment about it.

The test: what does a reader do differently if the sentence is gone? Nothing → delete. **Being true
is not the criterion** — a comment survives review because it is correct, not because it carries
anything. Four ways it fails that test anyway:

- **A value that stands as a constant next to it does not appear in prose** — name the identifier or
  nothing (`vault/feats` right above `FEATS_PATH`). It stays when the value is a derivation
  (`− 2×5mm Padding = 59mm`) or a worked example (`homebrew_alarm` → `homebrew-sam_alarm`).
- **No negation that the positive statement already covers.** „Die Kategorienamen des deutschen SRD
  5.2" rules out free translations by itself; „, keine freien Übersetzungen" is a defence against an
  objection nobody raised — reasoning residue from writing it. Negate only where the reader would
  plausibly do the wrong thing regardless (`Additiv, nie überschreibend`).
- **No reason for the way a DIFFERENT module is cut.** The `import` line says where it lives, and
  the why belongs in that file or nowhere. This one bites inside a single sentence: half describes
  the caller, half constrains this type — halve it instead of deleting it.
- **A field that mirrors a schema field is not documented twice** — `.describe()` is the source. The
  tell is „(siehe `featureGrantSchema`)": it points at the source *and* copies it, so the copy drifts.

Budget: module head max 3 lines (what, not how). JSDoc only when it says something name plus
signature do not already say — `/** Zeigt den deutschen Namen, falls vorhanden. */` over
`displayName()` goes. One exception: in `aiActions/*` prompt-near explanation is *content*
(`SHEET_NOTE_*`), not comment, and stays.

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
vocabulary is `SOURCE_KEYS` / `sourceField()` in `schemas/source.ts`.

## Never build a second mechanism

- **No third translation table.** The rule vocabularies are English; German appears only at the
  sheet-key tables and the display labels.
- **No second matcher** next to `matchWeaponName` (`itemLibrary.ts`) or `collectLegacyFixes`
  (`services/characterLegacyLinks.ts`).
- **No hand-enumerated field list** next to `APPLY`, `PROFICIENCY_DEFS`, `riderGrantChanges` or
  `proficiencyGrantChanges` — they are typed as total, so a missing sink is a compile error.
- **Weapon mastery and spell selection are not AI paths.** Options come from the library, counts
  from the quotas a feature declares (`services/spellcasting/`).

## Character files are versioned

They outlive every program version, so `schemas/characterUpgrades.ts` owns an ordered pipeline
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
