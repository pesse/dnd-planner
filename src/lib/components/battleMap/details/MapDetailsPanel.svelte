<script lang="ts">
  /** Rechte Seite des Cockpits: was gerade ausgewählt oder verlinkt ist, mit eigenem Zurück. */
  import { actSummaries } from '../../../stores/context';
  import type { MapEditor } from '../../../services/battleMap/mapEditor.svelte';
  import { encounterKeyOf } from '../../../services/battleMap/tokenDetails';
  import { isMapTemplatePath } from '../../../services/battleMap/mapTemplates';
  import type { Point } from '../../../services/battleMap/geometry';
  import type { FileEntry } from '../../../types';
  import EntryCard from '../../ui/EntryCard.svelte';
  import TokenDetails from './TokenDetails.svelte';
  import EncounterDetails from './EncounterDetails.svelte';
  import EncounterOverview from './EncounterOverview.svelte';
  import MapActsSection from './MapActsSection.svelte';
  import { cockpit } from '../../../services/battleMap/cockpitTab.svelte';
  import { provideEncounterPicker } from '../../../services/battleMap/encounterPicker.svelte';
  import CatalogDrawer from '../../catalog/CatalogDrawer.svelte';
  import MonsterTooltip from '../../MonsterTooltip.svelte';

  let { editor, campaignDir, center, onleave }: {
    editor: MapEditor;
    campaignDir: string;
    center: () => Point;
    onleave: (entry: FileEntry) => void;
  } = $props();

  const picker = provideEncounterPicker();
  const detail = $derived(editor.details.current);
  const token = $derived(detail.kind === 'token' ? (editor.map?.tokens.find((t) => t.id === detail.id) ?? null) : null);
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
    {#if editor.map && !isMapTemplatePath(editor.path) && $actSummaries.length}<MapActsSection {editor} />{/if}
    <EncounterOverview {editor} {campaignDir} />
    <p class="hint">Klicke ein Token an, um seine Werte, Notizen und seinen Encounter zu sehen.</p>
  {/if}
</div>

{#if picker.built}
  <CatalogDrawer
    kind="monster"
    title={picker.target?.title ?? 'Monster'}
    columns={['cr']}
    extraRows={picker.target?.ownRows ?? []}
    side="left"
    open={picker.open && !!picker.target && cockpit.tab === 'prep'}
    count={(row) => picker.target?.count(row.entryName) ?? 0}
    ondecrement={(row) => picker.target?.remove(row.entryName)}
    onpick={(row) => picker.target?.add(row.entryName)}
    onclose={() => (picker.open = false)}
  >
    {#snippet tip({ row, x, y })}
      <MonsterTooltip monster={row ? (picker.target?.monster(row.entryName) ?? null) : null} {x} {y} />
    {/snippet}
  </CatalogDrawer>
{/if}

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
