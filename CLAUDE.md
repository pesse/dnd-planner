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

## Adding New Tauri Commands

1. Add `fn my_command(...)` with `#[tauri::command]` in `src-tauri/src/lib.rs`
2. Register in `tauri::generate_handler![..., my_command]`
3. Call from frontend: `await invoke<ReturnType>('my_command', { param: value })`

Changing `lib.rs` requires a full Rust recompile — Hot-Reload only applies to the Svelte frontend.
