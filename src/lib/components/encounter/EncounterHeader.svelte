<script lang="ts">
  /** Kopfzeile des Encounters: Name, Schwierigkeit, Spielstand. */
  import { ENCOUNTER_DIFFICULTIES, ENCOUNTER_STATUSES, type Encounter } from '../../schemas/encounter';
  import './encounterCard.css';

  let { encounter }: { encounter: Encounter } = $props();

  const DIFFICULTY_COLOR: Record<string, string> = {
    leicht: 'var(--green)',
    mittel: 'var(--gold)',
    schwer: 'var(--copper)',
    tödlich: 'var(--danger)',
  };

  const STATUS_LABEL: Record<string, string> = {
    planned: 'Geplant',
    done: 'Gespielt',
    skipped: 'Übersprungen',
  };

  const STATUS_COLOR: Record<string, string> = {
    planned: 'var(--red)',
    done: 'var(--green)',
    skipped: 'var(--gold)',
  };

  const color = $derived(DIFFICULTY_COLOR[encounter.difficulty] ?? 'var(--ink-soft)');
</script>

<div class="enc-header">
  <input class="editable-field enc-name-input" bind:value={encounter.name} placeholder="Encounter-Name" />
  <select class="editable-field diff-select" bind:value={encounter.difficulty} style="color: {color}">
    {#each ENCOUNTER_DIFFICULTIES as d}
      <option value={d}>{d.toUpperCase()}</option>
    {/each}
  </select>
  <div class="status-toggle">
    {#each ENCOUNTER_STATUSES as s}
      <button
        class="status-btn"
        class:active={(encounter.status ?? 'planned') === s}
        style="--sc: {STATUS_COLOR[s]}"
        onclick={() => { encounter.status = s; }}
      >{STATUS_LABEL[s]}</button>
    {/each}
  </div>
</div>

<style>
  .enc-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .status-toggle {
    display: flex;
    gap: 0.2rem;
    margin-left: auto;
  }

  .status-btn {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-muted);
    font-size: 0.68rem;
    font-weight: 600;
    padding: 0.15rem 0.4rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .status-btn.active {
    border-color: var(--sc);
    color: var(--sc);
    background: color-mix(in srgb, var(--sc) 12%, transparent);
  }
</style>
