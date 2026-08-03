<script lang="ts">
  /**
   * Der Ersatzrahmen einer Bibliothekskarte, wenn das Schema den Inhalt nicht lesen kann:
   * Karte und Bearbeiten melden, der JSON-Tab bleibt der Weg zur Reparatur.
   */
  import type { CardTab } from '$lib/editor/cardEditor.svelte';
  import EditorPanel from '../EditorPanel.svelte';
  import ParseError from './ParseError.svelte';

  let { tab = $bindable(), noun, json, onsavejson }: {
    tab: CardTab;
    /** Bestimmungswort beider Meldungen: „Talent" → „Talent-Datensatz", „Talent-JSON". */
    noun: string;
    json: string;
    onsavejson: (json: string) => Promise<void> | void;
  } = $props();
</script>

<EditorPanel bind:tab dirty={false} {onsavejson} getJson={() => json}>
  {#snippet karte()}
    <ParseError message="Kein gültiger {noun}-Datensatz." />
  {/snippet}
  {#snippet bearbeiten()}
    <ParseError message="Ungültiges {noun}-JSON." onjson={() => (tab = 'json')} />
  {/snippet}
</EditorPanel>
