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
