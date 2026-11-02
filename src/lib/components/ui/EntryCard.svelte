<script lang="ts">
  /** Die Lese-Karte eines Bibliothekseintrags oder Charakters, direkt aus seiner Datei. */
  import { invoke } from '@tauri-apps/api/core';
  import { parseBackground, parseCharacter, parseClass, parseFeat, normalizeItem, parseMonster, parseSpecies, parseSpell, type ParseResult } from '../../utils/schemaValidation';
  import type { FileEntry, Item } from '../../types';
  import SpellCardView from '../libraryView/SpellCardView.svelte';
  import FeatCardView from '../libraryView/FeatCardView.svelte';
  import ClassCardView from '../libraryView/ClassCardView.svelte';
  import SpeciesCardView from '../libraryView/SpeciesCardView.svelte';
  import BackgroundCardView from '../libraryView/BackgroundCardView.svelte';
  import ItemCardView from '../item/ItemCardView.svelte';
  import MonsterStatBlock from '../MonsterStatBlock.svelte';
  import CharacterPeekCard from '../character/CharacterPeekCard.svelte';
  import { rarityColor } from '../../itemLabels';

  let { entry }: { entry: FileEntry } = $props();

  const PARSERS = {
    spell: parseSpell, monster: parseMonster, feat: parseFeat, class: parseClass, species: parseSpecies, background: parseBackground,
    character: parseCharacter,
    // Wie die Gegenstandsseite tolerant: strikt fiele Homebrew mit `cost: null` durch.
    item: (raw: unknown): ParseResult<Item> => ({ ok: true, data: normalizeItem(raw) }),
  } as const;
  type PeekType = keyof typeof PARSERS;
  const peekable = (t: FileEntry['type']): t is PeekType => Object.hasOwn(PARSERS, t);

  type Loaded =
    | { type: 'spell'; data: ReturnType<typeof parseSpell> }
    | { type: 'monster'; data: ReturnType<typeof parseMonster> }
    | { type: 'feat'; data: ReturnType<typeof parseFeat> }
    | { type: 'class'; data: ReturnType<typeof parseClass> }
    | { type: 'species'; data: ReturnType<typeof parseSpecies> }
    | { type: 'background'; data: ReturnType<typeof parseBackground> }
    | { type: 'item'; data: ParseResult<Item> }
    | { type: 'character'; data: ReturnType<typeof parseCharacter> };

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

{#if loaded?.data.ok}
  {#if loaded.type === 'spell'}<SpellCardView spell={loaded.data.data} />
  {:else if loaded.type === 'monster'}<MonsterStatBlock monster={loaded.data.data} />
  {:else if loaded.type === 'feat'}<FeatCardView feat={loaded.data.data} />
  {:else if loaded.type === 'class'}<ClassCardView klass={loaded.data.data} />
  {:else if loaded.type === 'species'}<SpeciesCardView species={loaded.data.data} />
  {:else if loaded.type === 'background'}<BackgroundCardView background={loaded.data.data} />
  {:else if loaded.type === 'item'}
    <ItemCardView item={loaded.data.data} color={rarityColor(loaded.data.data.rarity)} parseError={null} />
  {:else if loaded.type === 'character'}<CharacterPeekCard character={loaded.data.data} dirPath={entry.dirPath ?? ''} />
  {/if}
{:else}
  <p class="muted">{failed ? 'Für diesen Eintrag gibt es hier keine Vorschau.' : 'Lade …'}</p>
{/if}

<style>
  .muted { margin: 0; padding: 1.2rem; background: var(--bg); color: var(--ink-muted); font-style: italic; }
</style>
