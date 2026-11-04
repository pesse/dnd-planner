<script lang="ts">
  /** Ein Monster-Token ohne Encounter einem der Encounter dieser Karte zuschlagen. */
  import type { Token } from '../../../schemas/battleMap';
  import type { MapEditor } from '../../../services/battleMap/mapEditor.svelte';
  import { mapEncounters, splitHiddenEncounters } from '../../../services/battleMap/tokenDetails';
  import { isMapTemplatePath } from '../../../services/battleMap/mapTemplates';
  import { addMonsterToEncounter } from '../../../services/battleMap/encounterEdit';
  import { encounterSummaries, refreshEncounterSummaries } from '../../../stores/context';

  let { editor, token, campaignDir }: { editor: MapEditor; token: Token; campaignDir: string } = $props();

  let busy = $state(false);
  const options = $derived(
    editor.map ? splitHiddenEncounters(mapEncounters($encounterSummaries, editor.map, isMapTemplatePath(editor.path)), editor.map).shown : [],
  );

  async function assign(select: HTMLSelectElement) {
    const key = select.value;
    select.value = '';
    if (!key || busy) return;
    busy = true;
    try {
      await addMonsterToEncounter(campaignDir, key, token.ref);
      editor.checkpoint();
      editor.updateToken(token.id, { encounter: key });
      await refreshEncounterSummaries(campaignDir.split('/').pop()!);
    } catch (e) {
      editor.error = String(e);
    } finally {
      busy = false;
    }
  }
</script>

{#if options.length}
  ·
  <select aria-label="Zu Encounter hinzufügen" title="Diesem Encounter hinzufügen" disabled={busy} onchange={(e) => assign(e.currentTarget)}>
    <option value="">+ Encounter…</option>
    {#each options as e (e.key)}<option value={e.key}>{e.name}</option>{/each}
  </select>
{/if}

<style>
  select {
    max-width: 9rem;
    padding: 0 0.2rem;
    font-size: 0.75rem;
    vertical-align: baseline;
  }
</style>
