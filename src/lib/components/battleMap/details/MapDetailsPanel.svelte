<script lang="ts">
  /** Rechte Seite des Cockpits: was gerade ausgewählt oder verlinkt ist, mit eigenem Zurück. */
  import { encounterSummaries } from '../../../stores/context';
  import type { MapEditor } from '../../../services/battleMap/mapEditor.svelte';
  import { encounterKeyOf, mapEncounters } from '../../../services/battleMap/tokenDetails';
  import { isMapTemplatePath } from '../../../services/battleMap/mapTemplates';
  import type { Point } from '../../../services/battleMap/geometry';
  import type { FileEntry } from '../../../types';
  import EntryCard from '../../ui/EntryCard.svelte';
  import TokenDetails from './TokenDetails.svelte';
  import EncounterDetails from './EncounterDetails.svelte';

  let { editor, campaignDir, center, onleave }: {
    editor: MapEditor;
    campaignDir: string;
    center: () => Point;
    onleave: (entry: FileEntry) => void;
  } = $props();

  const detail = $derived(editor.details.current);
  const token = $derived(detail.kind === 'token' ? (editor.map?.tokens.find((t) => t.id === detail.id) ?? null) : null);
  const placed = $derived(new Set(editor.map?.tokens.map((t) => t.encounter).filter(Boolean)));
  const encounters = $derived(
    editor.map ? mapEncounters($encounterSummaries, editor.map, isMapTemplatePath(editor.path)).sort((a, b) => Number(placed.has(b.key)) - Number(placed.has(a.key))) : [],
  );
  const linkedEncounter = $derived(
    detail.kind === 'entry' && detail.entry.type === 'encounter' && detail.entry.path.startsWith(`${campaignDir}/`)
      ? encounterKeyOf(detail.entry.path)
      : '',
  );
</script>

<div class="nav">
  <button class="back" disabled={!editor.details.canBack} title="Zurück" onclick={() => editor.details.back()}>←</button>
  <span class="crumb">
    {#if detail.kind === 'overview'}Übersicht
    {:else if detail.kind === 'token'}{token?.name ?? 'Token'}
    {:else if detail.kind === 'encounter'}Encounter
    {:else}{detail.entry.name}{/if}
  </span>
  {#if detail.kind !== 'overview'}
    <button class="home" title="Zur Übersicht" onclick={() => editor.details.show({ kind: 'overview' })}>⌂</button>
  {/if}
</div>

<div class="content">
  {#if detail.kind === 'token' && token}
    {#key token.id}<TokenDetails {editor} {token} {campaignDir} />{/key}
  {:else if detail.kind === 'encounter'}
    <EncounterDetails {editor} key={detail.key} {campaignDir} {center} />
  {:else if detail.kind === 'entry' && linkedEncounter}
    <EncounterDetails {editor} key={linkedEncounter} {campaignDir} {center} />
  {:else if detail.kind === 'entry'}
    <div class="entry"><EntryCard entry={detail.entry} /></div>
    <button class="leave" onclick={() => onleave(detail.entry)}>Seite öffnen (verlässt die Karte)</button>
  {:else}
    <section>
      <h3>Encounter</h3>
      {#each encounters as e (e.key)}
        <button class="encounter" onclick={() => editor.details.show({ kind: 'encounter', key: e.key })}>
          <span class="name">{e.name}</span>
          <span class="sub">{placed.has(e.key) ? 'auf der Karte · ' : ''}{e.monsterList}</span>
        </button>
      {:else}
        <p class="hint">{isMapTemplatePath(editor.path) ? 'Diese Kampagne hat noch keine Encounter.' : 'Die Akte dieser Karte und die Kampagne haben keine Encounter.'}</p>
      {/each}
    </section>
    <p class="hint">Klicke ein Token an, um seine Werte, Notizen und seinen Encounter zu sehen.</p>
  {/if}
</div>

<style>
  .nav {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid var(--surface);
    background: var(--bg-panel);
  }
  .nav button {
    width: 1.9rem;
    height: 1.9rem;
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .nav button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .crumb {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
  .content {
    flex: 1;
    overflow-y: auto;
    background: var(--bg);
  }
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
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.5rem 0.7rem;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--ink);
    cursor: pointer;
  }
  .encounter:hover {
    border-color: var(--red);
  }
  .name {
    font-family: var(--font-display);
  }
  .sub {
    font-size: 0.75rem;
    color: var(--ink-muted);
  }
  .entry {
    padding: 0.75rem;
  }
  .leave {
    margin: 0 0.75rem 0.75rem;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.3rem 0.6rem;
  }
  .hint {
    margin: 0;
    padding: 0 1rem 1rem;
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
</style>
