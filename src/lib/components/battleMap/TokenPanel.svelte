<script lang="ts">
  /** Tokens einsetzen: Gruppe, Charakter, Monster, Falle, Markierung. */
  import { campaignCharacterData } from '../../stores/context';
  import type { MapEditor } from '../../services/battleMap/mapEditor.svelte';
  import { pxToCell, type Point } from '../../services/battleMap/geometry';
  import {
    characterDraft,
    libraryMonsterDraft,
    markerDraft,
    trapDraft,
    type TokenDraft,
  } from '../../services/battleMap/tokenSources';
  import PanelSection from './PanelSection.svelte';
  import CatalogDrawer from '../catalog/CatalogDrawer.svelte';
  import type { CatalogRow } from '../../services/catalog/catalogTypes';
  import { getTraps, trapDisplayName } from '../../trapsLibrary';
  import { getMonsterLibrary } from '../../monsterLibrary';
  import type { Monster } from '../../types';
  import MonsterTooltip from '../MonsterTooltip.svelte';

  let { editor, center }: { editor: MapEditor; center: () => Point } = $props();

  type LibraryKind = 'character' | 'monster' | 'trap';
  const LIBRARIES: { kind: LibraryKind; label: string; title: string; columns: string[] }[] = [
    { kind: 'character', label: 'Charakter…', title: 'Charakter einsetzen', columns: [] },
    { kind: 'monster', label: 'Monster…', title: 'Monster einsetzen', columns: ['cr'] },
    { kind: 'trap', label: 'Falle…', title: 'Falle einsetzen', columns: [] },
  ];

  let drawer = $state<LibraryKind | null>(null);
  /** Einmal geöffnet, bleibt eine Schublade aufgebaut. */
  let built = $state<LibraryKind[]>([]);
  let monsters = $state<Map<string, Monster>>(new Map());
  let markerName = $state('');
  let trapName = $state('');

  const map = $derived(editor.map!);
  const originCell = () => pxToCell(map.grid, center());

  async function run(job: () => Promise<void>) {
    editor.error = '';
    try {
      await job();
    } catch (e) {
      editor.error = String(e);
    }
  }

  const addParty = () =>
    editor.addTokens($campaignCharacterData.map((c) => characterDraft(c.slug, c.name)), originCell());

  const PICK: Record<LibraryKind, (row: CatalogRow) => Promise<TokenDraft | null>> = {
    character: async (row) => characterDraft(row.dirPath!.slice(row.dirPath!.lastIndexOf('/') + 1), row.name),
    monster: (row) => libraryMonsterDraft(row.entryName),
    trap: async (row) => {
      const trap = (await getTraps()).find((t) => t.path === row.path);
      return trap ? trapDraft(trapDisplayName(trap), trap.key) : null;
    },
  };

  const pick = (kind: LibraryKind, row: CatalogRow) =>
    run(async () => {
      const draft = await PICK[kind](row);
      if (!draft) throw new Error(`„${row.name}" ließ sich nicht laden.`);
      editor.addTokens([draft], originCell());
    });

  function toggle(kind: LibraryKind) {
    drawer = drawer === kind ? null : kind;
    if (drawer && !built.includes(drawer)) built.push(drawer);
    if (drawer === 'monster' && !monsters.size) void getMonsterLibrary().then((lib) => (monsters = new Map(lib.map((m) => [m.slug, m.monster]))));
  }

  /** Ohne Bibliothekseintrag: die Werte stehen in der Notiz. */
  function addFreeTrap() {
    editor.addTokens([trapDraft(trapName.trim() || 'Falle')], originCell());
    trapName = '';
  }

  function addMarker() {
    const name = markerName.trim() || 'Markierung';
    editor.addTokens([markerDraft(name)], originCell());
    markerName = '';
  }

</script>

<PanelSection title="Einsetzen">
  <button class="wide" disabled={!$campaignCharacterData.length} onclick={addParty} title="Alle Charaktere, die in der Kampagne eingetragen sind">
    Gruppe der Kampagne ({$campaignCharacterData.length})
  </button>

  <div class="libraries">
    {#each LIBRARIES as l (l.kind)}
      <button class:active={drawer === l.kind} title="{l.title} — aus der Bibliothek" onclick={() => toggle(l.kind)}>{l.label}</button>
    {/each}
  </div>

  <div class="row">
    <input bind:value={trapName} placeholder="Freie Falle…" onkeydown={(e) => e.key === 'Enter' && addFreeTrap()} />
    <button onclick={addFreeTrap}>+</button>
  </div>

  <div class="row">
    <input bind:value={markerName} placeholder="Markierung / NSC…" onkeydown={(e) => e.key === 'Enter' && addMarker()} />
    <button onclick={addMarker}>+</button>
  </div>
</PanelSection>

{#snippet monsterTip({ row, x, y }: { row: CatalogRow | null; x: number; y: number })}
  <MonsterTooltip monster={row ? (monsters.get(row.entryName) ?? null) : null} {x} {y} />
{/snippet}

{#each LIBRARIES.filter((l) => built.includes(l.kind)) as l (l.kind)}
  <CatalogDrawer
    kind={l.kind}
    title={l.title}
    columns={l.columns}
    side="right"
    open={drawer === l.kind}
    tip={l.kind === 'monster' ? monsterTip : undefined}
    onpick={(row) => pick(l.kind, row)}
    onclose={() => (drawer = null)}
  />
{/each}

<style>
  .row {
    display: flex;
    gap: 0.3rem;
  }
  .row > :first-child {
    flex: 1;
    min-width: 0;
  }
  button {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.2rem 0.5rem;
  }
  .libraries {
    display: flex;
    gap: 0.3rem;
  }
  .libraries button {
    flex: 1;
  }
  button.active {
    border-color: var(--red);
    color: var(--red);
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
