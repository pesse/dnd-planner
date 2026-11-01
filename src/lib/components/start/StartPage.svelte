<script lang="ts">
  import StartArtCanvas from './StartArtCanvas.svelte';
  import { characterSection } from '../sidebar/characterSectionState.svelte';
  import CampaignStartCard from './CampaignStartCard.svelte';
  import './startCard.css';
  import { GROUPED_SECTIONS } from '$lib/services/sidebar/groupedSections';
  import { catalogEntry } from '$lib/services/catalog/catalogTypes';
  import { navigateTo } from '$lib/services/navigation';
  import { libraryManagerOpen } from '$lib/stores/libraries';
  import type { Rect } from '$lib/services/startArt/scene';
  import { fade, scale } from 'svelte/transition';

  let root: HTMLDivElement;
  let panel = $state<HTMLDivElement>();

  const catalogs = [
    catalogEntry('character', 'Charaktere'),
    ...GROUPED_SECTIONS.flatMap((s) => (s.catalog ? [catalogEntry(s.catalog, s.label)] : [])),
  ];

  const MINIMIZED_KEY = 'start-minimized';
  let minimized = $state(localStorage.getItem(MINIMIZED_KEY) === '1');

  function setMinimized(value: boolean) {
    minimized = value;
    localStorage.setItem(MINIMIZED_KEY, value ? '1' : '0');
  }

  function keepOut(): Rect | null {
    if (minimized || !root || !panel) return null;
    const r = root.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    return { x: p.left - r.left, y: p.top - r.top, w: p.width, h: p.height };
  }
</script>

<div class="start" bind:this={root}>
  <StartArtCanvas {keepOut} />

  {#if minimized}
    <button class="restore" title="Menü einblenden" onclick={() => setMinimized(false)} transition:fade={{ duration: 200 }}>
      ☰ Menü
    </button>
  {:else}
    <div class="panel" bind:this={panel} transition:scale={{ duration: 220, start: 0.94 }}>
      <button class="minimize" title="Menü ausblenden, nur die Bilder zeigen" onclick={() => setMinimized(true)}>–</button>
      <img class="logo" src="/branding/logo.png" alt="DnD Planner" />

      <div class="primary">
        <button class="start-card" onclick={() => (characterSection.showWizard = true)}>
          <span class="start-card-title">Charakter erstellen</span>
          <span class="start-card-sub">Schritt für Schritt zur Stufe 1</span>
        </button>
        <CampaignStartCard />
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
  {/if}
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
    background: color-mix(in srgb, var(--bg) 62%, transparent);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(47, 33, 16, 0.18);
    backdrop-filter: blur(2px);
  }

  .logo {
    width: min(16rem, 70%);
  }

  .minimize {
    position: absolute;
    top: 0.5rem;
    right: 0.6rem;
    width: 1.6rem;
    height: 1.6rem;
    padding: 0;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--ink-muted);
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
  }
  .minimize:hover {
    color: var(--red);
    border-color: var(--border);
  }

  .restore {
    position: absolute;
    top: 2.75rem;
    right: 2.5rem;
    padding: 0.4rem 0.8rem;
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--ink-soft);
    font-family: inherit;
    font-size: 0.85rem;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.15s, color 0.15s, border-color 0.15s;
  }
  .restore:hover {
    opacity: 1;
    color: var(--red);
    border-color: var(--red);
  }

  .primary {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
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
