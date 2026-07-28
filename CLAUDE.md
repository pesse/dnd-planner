# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Workflow

**The app must be started on Windows, not in WSL** — WSL has no GPU access, causing severe rendering slowdowns.

Start the dev server from a Windows PowerShell terminal:
```powershell
cd C:\dev\privat\dnd-planner
.\dev-windows.ps1
```

This script starts `npm run tauri dev` and writes all output to `tauri-dev.log`, which Claude can monitor from WSL:
```bash
tail -f /mnt/c/dev/privat/dnd-planner/tauri-dev.log
```

For UI-only work without Tauri commands (FS, etc.), use the browser dev server from WSL:
```bash
npm run dev   # opens http://localhost:1420
```

## Package Management

**`npm install` must be run on Windows**, not in WSL — the app runs from Windows and uses the Windows `node_modules`. When new packages are added (e.g. via `npm install` in WSL to update `package.json`/`package-lock.json`), the user must run `npm install` in a Windows PowerShell. This can be done while `dev-windows.ps1` is running; Vite's Hot-Reload picks up the new package automatically. Never instruct the user to stop the dev server just to install packages.

## Architecture

**Stack:** Tauri 2 (Rust backend) + SvelteKit (SPA mode, no SSR) + Svelte 5 + Vite + TypeScript

SvelteKit runs as a pure SPA via `adapter-static` — there is no server-side rendering. Vite serves on port 1420 (fixed, required by Tauri).

### Frontend (`src/`)

- `routes/+page.svelte` — root layout: Sidebar | Editor/Viewer | LlmPanel side-by-side
- `lib/components/` — Sidebar (file tree), MarkdownEditor (textarea), MarkdownViewer (rendered HTML), LlmPanel (Ollama chat)
- `lib/stores/campaign.ts` — `activeCampaign`, `activeFile`, `fileContent` (shared state)
- `lib/stores/llm.ts` — LLM provider config + message history
- `lib/types.ts` — shared TypeScript types

### Backend (`src-tauri/src/lib.rs`)

Four Tauri commands callable via `invoke()` from the frontend:
- `list_directory(path)` — lists `.md` files in a directory
- `read_file_content(path)` — reads a file as string
- `write_file_content(path, content)` — writes/creates a file (creates parent dirs)
- `get_current_dir()` — debug: returns cwd and resolved project root

All paths go through `resolve_path()` which handles relative paths by walking up from `current_dir()` until a `vault/` directory is found. This is needed because Tauri's working directory varies depending on how it's launched.

### Content (`vault/`)

Markdown files on the filesystem — the "database" of the app. Structure:
```
vault/campaigns/{campaign-slug}/
  campaign.md
  sessions/*.md
  npcs/*.md
  world/*.md
```

The global rule libraries are flat JSON folders alongside the campaigns:
`vault/{classes,species,feats,backgrounds}/` (Open5e-derived, bilingual
`name`/`nameDe`), plus `vault/{spells,items,monsters}/` (subfoldered) and
`vault/templates/`. This set is declared as `roots` in `vault/libraries.yaml`
and must match `ALLOWED_ROOTS` in `src-tauri/src/libraries.rs` — adding a new
library type means touching both, plus the seven vault export/import sites in
`src-tauri/src/lib.rs`.

The frontend references vault paths as `./vault/campaigns/...` — `resolve_path` in Rust translates these to absolute paths at runtime.

**Vault base location:** resolved once in the Tauri `setup` hook into `VAULT_BASE`.
In **release** builds it lives at the app identifier path
(`%LOCALAPPDATA%\de.developer-sam.dnd-planner\vault`). In **dev**
(`debug_assertions`) it is the repo vault, located via walk-up, so checked-in
content (templates, spells, …) keeps working.

**Legacy-vault migration:** on startup `find_legacy_vault` checks former vault
locations (earlier install dirs, the identifier dir, the vault next to the EXE)
and — only when the current vault is empty — `migrate_legacy_vault` copies the
richest one in after a confirmation dialog (originals are kept as backup). No-op
in dev (repo vault is non-empty).

**Provenance (`source`):** every library artifact carries exactly one of
`srd-2024`, `phb-2024`, `homebrew-sam`. The value decides which distributable
pack the file lands in (fail-closed build) and is the prefix of every main key
(`srd-2024_alert`). `vault/` is a separate repo with its own `CLAUDE.md` that
documents the rules; the app-side vocabulary lives in
`src/lib/schemas/shared.ts` (`SOURCE_KEYS`, `sourceField()`,
`migrateSourceLegacy`).

## Architecture Invariant: Rule Mechanics Are English, the Sheet Is German

Closed rule vocabularies — the 18 skills, 6 saving throws, 2 weapon categories, 4
armor trainings — live in **English SRD spelling** everywhere in the libraries and
in the LLM contracts. `src/lib/schemas/shared.ts` owns them (`SKILL_NAMES`,
`ABILITY_NAMES`, `WEAPON_CATEGORIES`, `ARMOR_TRAININGS`) plus the one shape every
library artifact uses to grant them (`proficiencyGrantSchema`, `skillGrantSchema`).
Because all four artifact types (class, background, species trait, feat) carry the
*same* shape, summing them is one function — `services/proficiencyGrants.ts`
(`collectGrants`).

`character.*` stays **German**, because the PDF form dictates the field names
(`skills.MitTierenUmgehen`, `strSaveProf`, `proficiencies.lightArmor`). Between the
two sits **exactly one translation table**, and adding a second one is the mistake
to avoid:

| Direction | Where |
|---|---|
| skill EN → sheet key | `SKILL_DEFS.en` / `skillSheetKey()` (`pdf/characterFields.ts`) |
| sheet key → skill EN | `skillEnName()` (same table) |
| ability EN → app key | `ABILITY_FROM_EN` (`services/classProgression.ts`) |
| app key → ability EN | `ABILITY_TO_EN` (`schemas/classProgression.ts`) |
| any → German label | `skillLabelDe` / `abilityLabelDe` / `WEAPON_LABEL_DE` / `ARMOR_LABEL_DE` (`services/proficiencyGrants.ts`) |

`SKILL_DEFS` completeness is compiler-checked (a missing or misspelled `en` breaks
the build). Consequences to keep in mind:

- **Prompts name the vocabulary, never “short names”.** The rider schema
  (`schemas/levelUp.ts`) uses `z.enum(SKILL_NAMES)` so guided decoding cannot invent
  a name the sheet does not know. Translation happens when a `Change` is *applied*
  (`CharacterSheet.svelte`, `case 'proficiency'`), not when it is produced.
- **Class core traits come from Open5e v2** (`feature_type: "CORE_TRAITS_TABLE"`,
  `gained_at: []`) and are parsed by `parseCoreTraits`. Open5e has stray spaces
  inside names (“Na ture”, “In sight”), so every vocabulary lookup folds to
  lowercase-without-spaces; an unknown name **throws** rather than silently dropping
  a proficiency.
- **The multiclass line is not in Open5e** — only in the German SRD extract. It is
  maintained in the vault as `skillGrantMulticlass` and must survive a re-import.
- Tools and languages stay German free text on purpose (no closed vocabulary; in
  2024 languages are not a proficiency at all).
- `scripts/migrate-proficiency-grants.mts` re-derives the vault data and
  cross-validates all 12 classes against `src/lib/data/rules-chunks.json` before it
  writes anything.

## Character Upgrades (versioned)

Character files live in the vault and outlive every program version, so their
migration is an **ordered pipeline**, not a pile of ad-hoc field repairs.
`src/lib/schemas/character.ts` owns it:

- `CHARACTER_VERSION` — the current schema version.
- `CHARACTER_UPGRADES` — one step per version, each with `to`, a German `label`
  (shown in the upgrade log) and an idempotent `apply`.
- `upgradeCharacter(raw)` → `{ data, fromVersion, toVersion, applied }`; runs every
  step whose `to` exceeds the stored `_version`, then stamps `_version`.
- `migrateCharacterLegacy` is a thin wrapper and stays the entry point for
  `normalizeCharacter`/`parseCharacter`, so every read is upgraded.

Adding a schema change means: bump `CHARACTER_VERSION` and add **exactly one** step
with that `to`. Keep `apply` idempotent *and* content-guarded — legacy files often
carry no `_version` (or a stale one) although the change already happened, because
the migration used to run without stamping a version.

`_version` is a plain positive int in the schema (not a literal union) so a file
written by a newer build does not stop an older one from loading.

**Batch upgrade:** `services/characterUpgrade.ts` (`planCharacterUpgrades` →
`applyCharacterUpgrades`) plus `CharacterUpgradeModal.svelte`, reachable from the ⬆
button in the sidebar's Charaktere row. It writes the *migrated raw* object, not the
schema-normalised one — the point is to update the file, not to inflate it with every
default — and skips characters that would not change. PDF imports are deliberately
stamped `_version: 1`: the PDF only has free-text class/species/background, so the
pipeline is what structures them.

## Adding New Tauri Commands

1. Add `fn my_command(...)` with `#[tauri::command]` in `src-tauri/src/lib.rs`
2. Register in `tauri::generate_handler![..., my_command]`
3. Call from frontend: `await invoke<ReturnType>('my_command', { param: value })`

Changing `lib.rs` requires a full Rust recompile — Hot-Reload only applies to the Svelte frontend.

## Releases & Auto-Update

The app uses the official Tauri updater plugin. On startup it checks a `latest.json`
manifest on the **public** GitHub Release and, if a newer version exists, shows an update
badge (⬆) in the sidebar header → confirmation dialog → download/install/relaunch.

**One-time setup (required before the first signed release):**
1. Generate the updater signing keypair on Windows:
   `npm run tauri signer generate -- -w %USERPROFILE%\.tauri\dnd-planner.key`
2. Put the **public key** into `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`
   (currently the placeholder `REPLACE_WITH_UPDATER_PUBLIC_KEY`).
3. Replace `OWNER/REPO` in `plugins.updater.endpoints` with the public release repo.
4. Add the **private key** + its password as GitHub secrets
   `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
   Never commit the private key.

**Cutting a release:**
1. Push a tag `vX.Y.Z`. **No manual version bump needed** — the version fields are
   driven by the tag (see below).
2. `.github/workflows/release.yml` (runs on `windows-latest`) builds, signs, and creates a
   **draft** GitHub Release with the installer + `latest.json`.
3. Review and publish the release. Running installations pick up the new `latest.json`
   automatically on next start.

**Version bump is GitHub-driven** (commit `64aeac7`): the `version-bump` job derives the
version from the tag and pushes it into `tauri.conf.json`, `package.json` and
`package-lock.json` on the default branch. Don't bump by hand.
