<script lang="ts">
  import StartArtCanvas from './StartArtCanvas.svelte';
  import { characterSection } from '../sidebar/characterSectionState.svelte';
  import { campaignTree } from '../sidebar/campaign/campaignTreeState.svelte';
  import { GROUPED_SECTIONS } from '$lib/services/sidebar/groupedSections';
  import { catalogEntry } from '$lib/services/catalog/catalogTypes';
  import { navigateTo } from '$lib/services/navigation';
  import { libraryManagerOpen } from '$lib/stores/libraries';
  import type { Rect } from '$lib/services/startArt/scene';

  let root: HTMLDivElement;
  let panel: HTMLDivElement;

  const catalogs = [
    catalogEntry('character', 'Charaktere'),
    ...GROUPED_SECTIONS.flatMap((s) => (s.catalog ? [catalogEntry(s.catalog, s.label)] : [])),
  ];

  let naming = $state(false);
  let campaignName = $state('');
  let creating = $state(false);

  async function createCampaign() {
    creating = true;
    if (await campaignTree.createNamedCampaign(campaignName)) {
      naming = false;
      campaignName = '';
    }
    creating = false;
  }

  function onNameKey(e: KeyboardEvent) {
    if (e.key === 'Enter') void createCampaign();
    if (e.key === 'Escape') naming = false;
  }

  function keepOut(): Rect | null {
    if (!root || !panel) return null;
    const r = root.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    return { x: p.left - r.left, y: p.top - r.top, w: p.width, h: p.height };
  }
</script>

<div class="start" bind:this={root}>
  <StartArtCanvas {keepOut} />

  <div class="panel" bind:this={panel}>
    <img class="logo" src="/branding/logo.png" alt="DnD Planner" />

    <div class="primary">
      <button class="big" onclick={() => (characterSection.showWizard = true)}>
        <span class="big-title">Charakter erstellen</span>
        <span class="big-sub">Schritt für Schritt zur Stufe 1</span>
      </button>
      {#if naming}
        <div class="big naming">
          <span class="big-title">Neue Kampagne</span>
          <!-- svelte-ignore a11y_autofocus -->
          <input bind:value={campaignName} placeholder="Name der Kampagne…" onkeydown={onNameKey} autofocus />
          <div class="naming-actions">
            <button class="ghost" onclick={() => (naming = false)}>Abbrechen</button>
            <button class="confirm" disabled={!campaignName.trim() || creating} onclick={createCampaign}>Anlegen</button>
          </div>
        </div>
      {:else}
        <button class="big" onclick={() => (naming = true)}>
          <span class="big-title">Kampagne erstellen</span>
          <span class="big-sub">Akte, Sessions, NPCs und Welt</span>
        </button>
      {/if}
    </div>

    <h2>Bibliotheken</h2>
    <div class="libraries">
      {#each catalogs as entry (entry.path)}
        <button class="lib" onclick={() => void navigateTo(entry)}>{entry.name}</button>
      {/each}
      <button class="lib manage" onclick={() => libraryManagerOpen.set(true)}>
        <img src="/branding/icons/library.png" alt="" /> Verwalten
      </button>
    </div>
  </div>
</div>

<style>
  .start {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .panel {
    position: relative;
    width: min(34rem, 100%);
    padding: 2rem 2.25rem 1.75rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(47, 33, 16, 0.18);
    backdrop-filter: blur(3px);
  }

  .logo {
    width: min(16rem, 70%);
  }

  .primary {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .big {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
    padding: 1rem 1.1rem;
    background: var(--red);
    color: var(--on-accent);
    border: 1px solid var(--red-bright);
    border-radius: 8px;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
  }
  button.big:hover {
    background: var(--red-bright);
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(138, 32, 18, 0.3);
  }

  .big-title {
    font-family: var(--font-display);
    font-size: 0.95rem;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .big-sub {
    font-size: 0.78rem;
    opacity: 0.85;
  }

  .naming {
    cursor: default;
    gap: 0.5rem;
  }
  .naming input {
    width: 100%;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--ink);
    font: inherit;
    font-size: 0.85rem;
  }
  .naming-actions {
    align-self: flex-end;
    display: flex;
    gap: 0.4rem;
  }
  .naming-actions button {
    padding: 0.2rem 0.6rem;
    border-radius: 4px;
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .ghost {
    background: transparent;
    color: var(--on-accent);
    border: 1px solid color-mix(in srgb, var(--on-accent) 50%, transparent);
  }
  .confirm {
    background: var(--on-accent);
    color: var(--red);
    border: 1px solid var(--on-accent);
  }
  .confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  h2 {
    margin: 0.25rem 0 -0.5rem;
    font-family: var(--font-display);
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .libraries {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .lib {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.55rem 0.5rem;
    background: var(--surface);
    color: var(--ink-soft);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-family: inherit;
    font-size: 0.85rem;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }
  .lib:hover {
    border-color: var(--red);
    color: var(--red);
    background: var(--bg-raised);
  }
  .lib img {
    width: 16px;
    height: 16px;
  }
</style>
