<script lang="ts">
  /** Die Encounter, die diese Karte anbietet — im Spiel nur die platzierten, in der Vorbereitung mit Ausblenden, Duplizieren und Anlegen. */
  import { encounterSummaries, refreshEncounterSummaries } from '../../../stores/context';
  import type { MapEditor } from '../../../services/battleMap/mapEditor.svelte';
  import { mapEncounters, splitHiddenEncounters } from '../../../services/battleMap/tokenDetails';
  import { isMapTemplatePath } from '../../../services/battleMap/mapTemplates';
  import { duplicateEncounter } from '../../../services/battleMap/encounterEdit';
  import { cockpit } from '../../../services/battleMap/cockpitTab.svelte';
  import EyeIcon from '../../ui/EyeIcon.svelte';
  import NewEncounterForm from './NewEncounterForm.svelte';

  let { editor, campaignDir }: { editor: MapEditor; campaignDir: string } = $props();

  let showHidden = $state(false);
  const map = $derived(editor.map!);
  const isTemplate = $derived(isMapTemplatePath(editor.path));
  const prep = $derived(cockpit.tab === 'prep');
  const placed = $derived(new Set(map.tokens.map((t) => t.encounter).filter(Boolean)));
  const offered = $derived(
    mapEncounters($encounterSummaries, map, isTemplate).sort((a, b) => Number(placed.has(b.key)) - Number(placed.has(a.key))),
  );
  const split = $derived(splitHiddenEncounters(offered, map));
  const listed = $derived(prep ? split.shown : split.shown.filter((e) => placed.has(e.key)));

  async function duplicate(key: string) {
    try {
      const copy = await duplicateEncounter(campaignDir, key);
      await refreshEncounterSummaries(campaignDir.split('/').pop()!);
      editor.details.show({ kind: 'encounter', key: copy });
    } catch (e) {
      editor.error = String(e);
    }
  }
</script>

{#snippet card(e: (typeof offered)[number], hidden: boolean)}
  <div class="encounter" class:hidden class:unplaced={!placed.has(e.key)}>
    <button class="open" onclick={() => editor.details.show({ kind: 'encounter', key: e.key })}>
      <span class="name">{e.name}</span>
      <span class="sub">{placed.has(e.key) ? 'auf der Karte · ' : 'nicht platziert · '}{e.monsterList}</span>
    </button>
    {#if prep}
      <div class="tools">
        <button title="Duplizieren" onclick={() => duplicate(e.key)}>⧉</button>
        <button
          title={hidden ? 'Für diese Karte wieder anbieten — seine Tokens kehren zurück' : placed.has(e.key) ? 'Für diese Karte ausblenden — nimmt seine Tokens mit' : 'Für diese Karte ausblenden'}
          onclick={() => editor.setEncounterOffered(e.key, hidden)}
        >
          <EyeIcon closed={!hidden} />
        </button>
      </div>
    {/if}
  </div>
{/snippet}

<section>
  <h3>Encounter</h3>
  {#each listed as e (e.key)}
    {@render card(e, false)}
  {:else}
    <p class="hint">
      {!prep && split.shown.length ? 'Kein Encounter steht auf der Karte.' : split.hidden.length ? 'Alle Encounter sind für diese Karte ausgeblendet.' : isTemplate ? 'Diese Kampagne hat noch keine Encounter.' : 'Die Akte dieser Karte und die Kampagne haben keine Encounter.'}
    </p>
  {/each}
  {#if prep && split.hidden.length}
    <button class="toggle" onclick={() => (showHidden = !showHidden)}>
      {showHidden ? '▾' : '▸'} Ausgeblendet ({split.hidden.length})
    </button>
    {#if showHidden}
      {#each split.hidden as e (e.key)}{@render card(e, true)}{/each}
    {/if}
  {/if}
  {#if prep}<NewEncounterForm {editor} {campaignDir} {isTemplate} />{/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.75rem 1rem;
  }
  h3 {
    margin: 0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
  }
  .encounter {
    position: relative;
    display: flex;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .encounter:hover {
    border-color: var(--red);
  }
  .encounter.unplaced {
    border-style: dashed;
    background: none;
  }
  .encounter.hidden {
    opacity: 0.6;
  }
  .open {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.5rem 0.7rem;
    text-align: left;
    background: none;
    border: none;
    color: var(--ink);
    cursor: pointer;
  }
  .name {
    font-family: var(--font-display);
  }
  .sub {
    font-size: 0.75rem;
    color: var(--ink-muted);
  }
  .tools {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.3rem 0.3rem 0.3rem 0;
    visibility: hidden;
  }
  .encounter:hover .tools,
  .encounter:focus-within .tools,
  .encounter.hidden .tools {
    visibility: visible;
  }
  .tools button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.6rem;
    height: 1.6rem;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .tools button:hover {
    border-color: var(--border);
    background: var(--bg-raised);
  }
  .toggle {
    align-self: flex-start;
    background: none;
    border: none;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.78rem;
    padding: 0.1rem 0;
  }
  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
</style>
