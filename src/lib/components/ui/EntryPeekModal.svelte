<script lang="ts">
  /** Vorschau eines Bibliothekseintrags im Assistenten, statt dorthin zu wechseln. */
  import { invoke } from '@tauri-apps/api/core';
  import { parseBackground, parseClass, parseFeat, parseSpecies, parseSpell } from '../../utils/schemaValidation';
  import type { FileEntry } from '../../types';
  import Modal from './Modal.svelte';
  import SpellDetail from '../SpellDetail.svelte';
  import FeatDetail from '../FeatDetail.svelte';
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
</script>

<Modal title={entry.name} draggable={false} width="min(720px, 94vw)" maxHeight="86vh" {onclose}>
  <div class="peek">
    {#if loaded?.data.ok}
      {#if loaded.type === 'spell'}<SpellDetail spell={loaded.data.data} />
      {:else if loaded.type === 'feat'}<FeatDetail feat={loaded.data.data} />
      {:else if loaded.type === 'class'}<ClassCardView klass={loaded.data.data} />
      {:else if loaded.type === 'species'}<SpeciesCardView species={loaded.data.data} />
      {:else if loaded.type === 'background'}<BackgroundCardView background={loaded.data.data} />
      {/if}
    {:else if failed}
      <p class="muted">Für diesen Eintrag gibt es hier keine Vorschau.</p>
    {:else}
      <p class="muted">Lade …</p>
    {/if}
  </div>
  <div class="actions">
    <button type="button" class="secondary-btn" onclick={onleave}>Seite öffnen …</button>
    <button type="button" class="primary-btn" onclick={onclose}>Schließen</button>
  </div>
</Modal>

<style>
  .peek { font-size: 0.85rem; }
  .muted { color: var(--ink-muted); font-style: italic; margin: 0; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
</style>
