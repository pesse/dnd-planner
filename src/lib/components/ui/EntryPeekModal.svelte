<script lang="ts">
  /** Vorschau eines Bibliothekseintrags im Assistenten, statt dorthin zu wechseln. */
  import { invoke } from '@tauri-apps/api/core';
  import { fade, scale } from 'svelte/transition';
  import { parseBackground, parseClass, parseFeat, parseSpecies, parseSpell } from '../../utils/schemaValidation';
  import type { FileEntry } from '../../types';
  import SpellCardView from '../libraryView/SpellCardView.svelte';
  import FeatCardView from '../libraryView/FeatCardView.svelte';
  import ClassCardView from '../libraryView/ClassCardView.svelte';
  import SpeciesCardView from '../libraryView/SpeciesCardView.svelte';
  import BackgroundCardView from '../libraryView/BackgroundCardView.svelte';

  let { entry, onclose, onleave }: {
    entry: FileEntry;
    onclose: () => void;
    /** Die Seite wirklich öffnen — der Aufrufer fragt nach und schließt den Assistenten. */
    onleave: () => void;
  } = $props();

  const PARSERS = {
    spell: parseSpell, feat: parseFeat, class: parseClass, species: parseSpecies, background: parseBackground,
  } as const;
  type PeekType = keyof typeof PARSERS;
  const peekable = (t: FileEntry['type']): t is PeekType => Object.hasOwn(PARSERS, t);

  type Loaded =
    | { type: 'spell'; data: ReturnType<typeof parseSpell> }
    | { type: 'feat'; data: ReturnType<typeof parseFeat> }
    | { type: 'class'; data: ReturnType<typeof parseClass> }
    | { type: 'species'; data: ReturnType<typeof parseSpecies> }
    | { type: 'background'; data: ReturnType<typeof parseBackground> };

  let loaded = $state<Loaded | null>(null);
  let failed = $state(false);

  $effect(() => {
    const { type, path } = entry;
    loaded = null;
    failed = false;
    if (!peekable(type) || !path) { failed = true; return; }
    let cancelled = false;
    invoke<string>('read_file_content', { path })
      .then((raw) => {
        if (cancelled) return;
        const data = PARSERS[type](JSON.parse(raw));
        if (!data.ok) failed = true;
        else loaded = { type, data } as Loaded;
      })
      .catch(() => { if (!cancelled) failed = true; });
    return () => { cancelled = true; };
  });

  // Capture-Phase: sonst erreicht Escape zuerst Handler darunter, die den Assistenten schließen.
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    onclose();
  }
</script>

<svelte:window onkeydowncapture={onkeydown} />

<div class="backdrop" role="presentation" onclick={onclose} transition:fade={{ duration: 150 }}></div>
<div class="peek" role="dialog" aria-label={entry.name} transition:scale={{ start: 0.96, duration: 180 }}>
  <div class="scroll">
    {#if loaded?.data.ok}
      {#if loaded.type === 'spell'}<SpellCardView spell={loaded.data.data} />
      {:else if loaded.type === 'feat'}<FeatCardView feat={loaded.data.data} />
      {:else if loaded.type === 'class'}<ClassCardView klass={loaded.data.data} />
      {:else if loaded.type === 'species'}<SpeciesCardView species={loaded.data.data} />
      {:else if loaded.type === 'background'}<BackgroundCardView background={loaded.data.data} />
      {/if}
    {:else}
      <p class="muted">{failed ? 'Für diesen Eintrag gibt es hier keine Vorschau.' : 'Lade …'}</p>
    {/if}
  </div>
  <div class="actions">
    <button type="button" class="secondary-btn" onclick={onleave}>Seite öffnen …</button>
    <button type="button" class="primary-btn" onclick={onclose}>Schließen</button>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 1001; background: rgba(20, 12, 2, 0.5); backdrop-filter: blur(2px); }
  .peek {
    position: fixed; z-index: 1002; left: 50%; top: 50%; translate: -50% -50%;
    width: min(560px, 94vw); max-height: 90vh; display: flex; flex-direction: column; gap: 0.6rem;
  }
  .scroll {
    overflow-y: auto; min-height: 0; border-radius: 8px;
    box-shadow: 0 14px 44px rgba(0, 0, 0, 0.5);
  }
  .scroll > :global(*) { max-width: none; }
  .muted { margin: 0; padding: 1.2rem; background: var(--bg); color: var(--ink-muted); font-style: italic; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
</style>
