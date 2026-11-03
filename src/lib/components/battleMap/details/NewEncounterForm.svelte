<script lang="ts">
  /** Legt einen Encounter im Akt der Karte oder kampagnenweit an und öffnet ihn zum Bearbeiten. */
  import type { MapEditor } from '../../../services/battleMap/mapEditor.svelte';
  import { createEncounter } from '../../../services/battleMap/encounterEdit';
  import { actSummaries, refreshEncounterSummaries } from '../../../stores/context';

  let { editor, campaignDir, isTemplate }: { editor: MapEditor; campaignDir: string; isTemplate: boolean } = $props();

  let open = $state(false);
  let name = $state('');
  let scope = $state('');
  let busy = $state(false);

  const scopes = $derived([
    ...$actSummaries
      .filter((a) => isTemplate || editor.map?.acts.includes(a.name))
      .map((a) => ({ value: a.name, label: `Akt: ${a.title || a.name}` })),
    { value: '', label: 'Ganze Kampagne' },
  ]);

  function start() {
    name = '';
    scope = isTemplate ? '' : (editor.map?.acts[0] ?? '');
    open = true;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    busy = true;
    try {
      const key = await createEncounter(campaignDir, scope, name.trim());
      await refreshEncounterSummaries(campaignDir.split('/').pop()!);
      open = false;
      editor.details.show({ kind: 'encounter', key });
    } finally {
      busy = false;
    }
  }
</script>

{#if open}
  <form onsubmit={submit}>
    <!-- svelte-ignore a11y_autofocus -->
    <input bind:value={name} placeholder="Name des Encounters" aria-label="Name des Encounters" autofocus />
    <select bind:value={scope} aria-label="Gehört zu">
      {#each scopes as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
    </select>
    <div class="actions">
      <button type="button" onclick={() => (open = false)}>Abbrechen</button>
      <button type="submit" class="ok" disabled={!name.trim() || busy}>Anlegen</button>
    </div>
  </form>
{:else}
  <button class="new" onclick={start}>+ Neuer Encounter</button>
{/if}

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.5rem 0.6rem;
    border: 1px dashed var(--border);
    border-radius: 6px;
  }
  input,
  select {
    padding: 0.25rem 0.4rem;
    font-size: 0.85rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
  }
  button {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.25rem 0.6rem;
  }
  .ok:not(:disabled) {
    border-color: var(--red);
    color: var(--red);
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .new {
    align-self: flex-start;
    border-style: dashed;
  }
</style>
