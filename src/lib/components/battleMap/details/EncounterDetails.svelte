<script lang="ts">
  /** Ein Encounter im Cockpit: Vorlesetext, Beschreibung, SL-Notizen und seine Tokens auf der Karte. */
  import type { Encounter } from '../../../schemas/encounter';
  import type { MapEditor } from '../../../services/battleMap/mapEditor.svelte';
  import { encounterDrafts } from '../../../services/battleMap/tokenSources';
  import { encounterPath, loadEncounter } from '../../../services/battleMap/tokenDetails';
  import { rollMonsterInitiatives } from '../../../services/battleMap/initiative';
  import { pxToCell, type Point } from '../../../services/battleMap/geometry';
  import Markdown from '../../Markdown.svelte';

  let { editor, key, campaignDir, center }: { editor: MapEditor; key: string; campaignDir: string; center: () => Point } = $props();

  let encounter = $state<Encounter | null>(null);
  let failed = $state(false);
  let busy = $state(false);

  const path = $derived(encounterPath(campaignDir, key));
  const tokens = $derived(editor.map?.tokens.filter((t) => t.encounter === key) ?? []);
  const anyHidden = $derived(tokens.some((t) => t.hidden));

  $effect(() => {
    const p = path;
    encounter = null;
    failed = false;
    let live = true;
    void loadEncounter(p).then((e) => {
      if (!live) return;
      encounter = e;
      failed = !e;
    });
    return () => { live = false; };
  });

  async function rollInitiative() {
    busy = true;
    try {
      editor.setInitiatives(await rollMonsterInitiatives(tokens, campaignDir));
    } finally {
      busy = false;
    }
  }

  async function place() {
    busy = true;
    try {
      const at = pxToCell(editor.map!.grid, center());
      editor.addTokens(await encounterDrafts(path, key), at);
    } catch (e) {
      editor.error = String(e);
    } finally {
      busy = false;
    }
  }
</script>

{#if encounter}
  <header>
    <h2>{encounter.name}</h2>
    <p class="meta">
      {[encounter.location, `Schwierigkeit: ${encounter.difficulty}`, encounter.xp_total ? `${encounter.xp_total} EP` : ''].filter(Boolean).join(' · ')}
    </p>
  </header>

  {#if encounter.read_aloud}
    <blockquote class="read-aloud"><Markdown source={encounter.read_aloud} /></blockquote>
  {/if}
  {#if encounter.description}
    <section><h3>Worum es geht</h3><Markdown source={encounter.description} /></section>
  {/if}

  <section>
    <h3>
      Auf der Karte
      {#if tokens.length}
        <button class="bulk" disabled={busy} title="W20 + GES für alle Monster dieses Encounters ohne Initiative" onclick={rollInitiative}>🎲 Initiative</button>
        <button class="bulk2" onclick={() => editor.setEncounterHidden(key, !anyHidden)}>
          {anyHidden ? '👁 Alle zeigen' : '🙈 Alle verstecken'}
        </button>
      {/if}
    </h3>
    {#if tokens.length}
      <ul>
        {#each tokens as t (t.id)}
          <li>
            <button class="link" class:dim={t.hidden} onclick={() => (editor.selectedId = t.id)}>{t.name}</button>
            {#if t.initiative != null}<span class="tag">Ini {t.initiative}</span>{/if}
            {#if t.hpMax != null && t.hp != null}<span class="tag" class:dead={t.hp === 0}>{t.hp === 0 ? 'besiegt' : `${t.hp}/${t.hpMax} TP`}</span>{/if}
            {#if t.hidden}<span class="tag">versteckt</span>{/if}
          </li>
        {/each}
      </ul>
    {:else}
      <button disabled={busy} onclick={place}>{busy ? 'Wird gesetzt…' : 'Monster auf die Karte setzen'}</button>
    {/if}
  </section>

  {#if encounter.notes}
    <section><h3>SL-Notizen</h3><Markdown source={encounter.notes} /></section>
  {/if}
  {#if encounter.loot}
    <section><h3>Beute</h3><Markdown source={encounter.loot} /></section>
  {/if}
{:else}
  <p class="status">{failed ? 'Den Encounter gibt es in dieser Kampagne nicht mehr.' : 'Lade …'}</p>
{/if}

<style>
  header {
    padding: 0.8rem 1rem 0.4rem;
  }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.25rem;
    color: var(--red);
  }
  .meta {
    margin: 0.2rem 0 0;
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
  .read-aloud {
    margin: 0.5rem 1rem;
    padding: 0.6rem 0.8rem;
    border-left: 3px solid var(--gold);
    background: var(--surface);
    font-style: italic;
    font-size: 0.9rem;
  }
  section {
    padding: 0.5rem 1rem;
    font-size: 0.88rem;
  }
  h3 {
    display: flex;
    align-items: center;
    margin: 0 0 0.3rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
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
  .bulk2 {
    margin-left: 0.3rem;
    text-transform: none;
    letter-spacing: 0;
  }
  .bulk {
    margin-left: auto;
    text-transform: none;
    letter-spacing: 0;
  }
  .link {
    border: none;
    background: none;
    padding: 0.1rem 0;
    color: var(--red);
    font-size: 0.88rem;
  }
  .link:hover {
    text-decoration: underline;
  }
  .link.dim {
    color: var(--ink-muted);
  }
  .tag {
    font-size: 0.7rem;
    color: var(--ink-muted);
  }
  .tag.dead {
    color: var(--danger);
  }
  .status {
    padding: 1rem;
    color: var(--ink-muted);
    font-style: italic;
  }
</style>
