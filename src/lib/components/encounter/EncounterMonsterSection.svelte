<script lang="ts">
  /**
   * Monsterbesetzung des Encounters: Zeilen mit Anzahl, Slug und Taktik-Notiz, dazu
   * der Bibliotheks-Picker. Gespeichert wird nur der Slug — den Statblock löst die
   * Anzeige auf.
   */
  import type { Encounter } from '../../schemas/encounter';
  import { monsterLibrary } from '../../stores/context';
  import { monsterTypeLabel } from '../../types';
  import './encounterCard.css';

  let { encounter }: { encounter: Encounter } = $props();

  let showPicker = $state(false);
  let pickerTag = $state<string | null>(null);

  let pickerGroups = $derived.by(() => {
    const groups: Record<string, typeof $monsterLibrary> = {};
    for (const entry of $monsterLibrary) {
      if (!groups[entry.group]) groups[entry.group] = [];
      groups[entry.group].push(entry);
    }
    return groups;
  });

  let pickerMonsters = $derived(pickerTag === null ? $monsterLibrary : (pickerGroups[pickerTag] ?? []));

  function addFromPicker(slug: string) {
    const existing = encounter.monsters.find(m => m.slug === slug);
    if (existing) existing.count += 1;
    else encounter.monsters.push({ slug, count: 1, notes: '' });
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
    <button class="add-row-btn picker-toggle-btn" onclick={() => { showPicker = !showPicker; pickerTag = null; }}>
      {showPicker ? '▲ Bibliothek' : '▼ Bibliothek'}
    </button>
  </div>

  {#if showPicker}
    <div class="monster-picker">
      <div class="picker-tags">
        <button class="picker-tag-btn" class:active={pickerTag === null} onclick={() => pickerTag = null}>Alle</button>
        {#each Object.keys(pickerGroups) as group}
          <button
            class="picker-tag-btn"
            class:active={pickerTag === group}
            onclick={() => pickerTag = group}
          >{monsterTypeLabel(group)} ({pickerGroups[group].length})</button>
        {/each}
      </div>
      <div class="picker-list">
        {#each pickerMonsters as entry}
          <button class="picker-monster-btn" onclick={() => addFromPicker(entry.slug)}>
            <span class="picker-mon-name">{entry.name}</span>
            <span class="picker-mon-cr">CR {entry.cr}</span>
          </button>
        {:else}
          <span class="picker-empty">Keine Monster geladen</span>
        {/each}
      </div>
    </div>
  {/if}
</div>

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
  .picker-toggle-btn:hover { border-color: var(--red); color: var(--ink); }

  .monster-picker {
    border: 1px solid var(--surface);
    border-radius: 4px;
    background: var(--bg);
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.25rem;
  }

  .picker-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .picker-tag-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--ink-soft);
    border-radius: 3px;
    padding: 0.15rem 0.5rem;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .picker-tag-btn:hover { background: var(--border); color: var(--ink); }
  .picker-tag-btn.active { background: var(--border-strong); border-color: var(--red); color: var(--red); }

  .picker-list {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    max-height: 180px;
    overflow-y: auto;
  }

  .picker-monster-btn {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: none;
    border: none;
    color: var(--ink);
    padding: 0.2rem 0.4rem;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.82rem;
    text-align: left;
  }

  .picker-monster-btn:hover { background: var(--surface); }

  .picker-mon-name { flex: 1; }
  .picker-mon-cr { color: var(--gold); font-size: 0.75rem; margin-left: 0.5rem; }
  .picker-empty { color: var(--ink-muted); font-size: 0.8rem; padding: 0.2rem 0.4rem; }
</style>
