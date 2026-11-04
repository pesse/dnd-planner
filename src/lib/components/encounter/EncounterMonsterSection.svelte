<script lang="ts">
  /**
   * Monsterbesetzung des Encounters: Zeilen mit Anzahl, Slug und Taktik-Notiz, dazu der
   * Katalog-Picker wie im Cockpit. Gespeichert wird nur der Slug.
   */
  import type { Encounter } from '../../schemas/encounter';
  import type { Monster } from '../../types';
  import { getMonsterLibrary } from '../../monsterLibrary';
  import { readScopeMonsters } from '../../services/contextLoad';
  import { scopeMonsterRows } from '../../services/catalog/monsterCatalog';
  import type { CatalogRow } from '../../services/catalog/catalogTypes';
  import CatalogDrawer from '../catalog/CatalogDrawer.svelte';
  import MonsterTooltip from '../MonsterTooltip.svelte';
  import './encounterCard.css';

  /** `scopeDir`: Akt- oder Kampagnenordner, dessen eigene Monster vorn im Picker stehen. */
  let { encounter, scopeDir }: { encounter: Encounter; scopeDir?: string } = $props();

  let open = $state(false);
  let built = $state(false);
  let monsters = $state<Map<string, Monster>>(new Map());
  let ownRows = $state<CatalogRow[]>([]);

  $effect(() => {
    const dir = scopeDir;
    void Promise.all([getMonsterLibrary(), dir ? readScopeMonsters(dir) : [], dir ? scopeMonsterRows(dir) : []]).then(([library, own, rows]) => {
      if (dir !== scopeDir) return;
      monsters = new Map([...library, ...own].map((m) => [m.slug, m.monster]));
      ownRows = rows;
    });
  });

  function toggle() {
    built = true;
    open = !open;
  }

  const countOf = (slug: string) => encounter.monsters.find((m) => m.slug === slug)?.count ?? 0;

  function add(slug: string) {
    const existing = encounter.monsters.find((m) => m.slug === slug);
    if (existing) existing.count += 1;
    else encounter.monsters.push({ slug, count: 1, notes: '' });
  }

  function remove(slug: string) {
    const i = encounter.monsters.findIndex((m) => m.slug === slug);
    if (i < 0) return;
    if (encounter.monsters[i].count > 1) encounter.monsters[i].count -= 1;
    else encounter.monsters.splice(i, 1);
  }
</script>

<h3 class="enc-section-title">Monster</h3>
<div class="enc-monster-list">
  {#each encounter.monsters as m, i}
    <div class="enc-monster-row">
      <div class="mon-top-row">
        <input class="editable-field mon-count-input" type="number" bind:value={m.count} min="1" />
        <span class="mon-sep">×</span>
        <input class="editable-field mon-slug-input" bind:value={m.slug} placeholder="monster-slug" />
        <button class="row-remove" onclick={() => encounter.monsters.splice(i, 1)}>×</button>
      </div>
      <textarea class="editable-field mon-notes-input" bind:value={m.notes} placeholder="Notizen…" rows="2"></textarea>
    </div>
  {/each}
  <div class="monster-add-row">
    <button class="add-row-btn" onclick={() => encounter.monsters.push({ slug: '', count: 1, notes: '' })}>+ Leer</button>
    <button class="add-row-btn picker-toggle-btn" class:active={open} onclick={toggle}>+ Monster…</button>
  </div>
</div>

{#if built}
  <CatalogDrawer
    kind="monster"
    title="Monster für „{encounter.name || 'Encounter'}“"
    columns={['cr']}
    extraRows={ownRows}
    side="inside"
    {open}
    count={(row) => countOf(row.entryName)}
    ondecrement={(row) => remove(row.entryName)}
    onpick={(row) => add(row.entryName)}
    onclose={() => (open = false)}
  >
    {#snippet tip({ row, x, y })}
      <MonsterTooltip monster={row ? (monsters.get(row.entryName) ?? null) : null} {x} {y} />
    {/snippet}
  </CatalogDrawer>
{/if}

<style>
  .enc-monster-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .enc-monster-row {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .mon-top-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .mon-sep { color: var(--gold); font-weight: 700; }

  .row-remove {
    background: none;
    border: none;
    color: var(--border);
    cursor: pointer;
    font-size: 1rem;
    padding: 0 0.2rem;
    flex-shrink: 0;
  }
  .row-remove:hover { color: var(--danger); }

  .add-row-btn {
    background: none;
    border: 1px dashed var(--steel);
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    align-self: flex-start;
  }
  .add-row-btn:hover { border-color: var(--steel); color: var(--steel); }

  .monster-add-row {
    display: flex;
    gap: 0.5rem;
  }

  .picker-toggle-btn { color: var(--red); border-color: var(--bg-raised); }
  .picker-toggle-btn:hover, .picker-toggle-btn.active { border-color: var(--red); color: var(--red); }

</style>
