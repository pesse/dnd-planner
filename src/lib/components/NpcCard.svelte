<script lang="ts">
  import { createNpcCardEditor } from './npc/npcCardEditor.svelte';
  import NpcHeader from './npc/NpcHeader.svelte';
  import NpcAttributesBlock from './npc/NpcAttributesBlock.svelte';
  import NpcCombatBlock from './npc/NpcCombatBlock.svelte';
  import NpcSavingThrowsBlock from './npc/NpcSavingThrowsBlock.svelte';
  import NpcSkillsBlock from './npc/NpcSkillsBlock.svelte';
  import NpcSpellSection from './npc/NpcSpellSection.svelte';
  import NpcInventorySection from './npc/NpcInventorySection.svelte';
  import NpcNotesBlock from './npc/NpcNotesBlock.svelte';
  import './npc/npcCard.css';

  const nc = createNpcCardEditor();
  const ed = nc.ed;
  const draft = $derived(ed.draft);
</script>

{#if !draft}
  <div class="npc-empty">NPC konnte nicht geladen werden.</div>
{:else if nc.showJson}
  <div class="npc-json-view">
    <div class="json-toolbar">
      <span class="json-label">JSON</span>
      {#if nc.jsonError}<span class="json-error">{nc.jsonError}</span>{/if}
      <div style="flex:1"></div>
      <button onclick={() => nc.applyJson()}>Übernehmen</button>
      <button onclick={() => { nc.showJson = false; }}>Abbrechen</button>
    </div>
    <textarea class="json-ta" bind:value={nc.rawJson} spellcheck="false"></textarea>
  </div>
{:else}
  <div class="npc-sheet">
    <NpcHeader npc={draft} dirty={ed.dirty} saveError={ed.saveError} onopenjson={() => nc.openJson()} />

    <div class="npc-content">
      <NpcAttributesBlock npc={draft} />

      <div class="two-col">
        <NpcCombatBlock npc={draft} />
        <NpcSavingThrowsBlock npc={draft} />
      </div>

      <NpcSkillsBlock npc={draft} />
      <NpcSpellSection npc={draft} />
      <NpcInventorySection npc={draft} />
      <NpcNotesBlock npc={draft} />
    </div>
  </div>
{/if}

<style>
  .npc-empty { padding: 2rem; color: var(--ink-muted); }

  .npc-sheet {
    flex: 1;
    overflow-y: auto;
    background: var(--bg);
    color: var(--ink);
    font-size: 0.9rem;
  }

  .npc-content {
    padding: 1rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .npc-json-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }

  .json-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 1rem;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--surface);
  }
  .json-label { font-size: 0.75rem; color: var(--ink-muted); }
  .json-error { font-size: 0.75rem; color: var(--danger); }
  .json-toolbar button {
    background: none;
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink);
    font-size: 0.8rem;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
    font-family: inherit;
  }
  .json-toolbar button:hover { border-color: var(--red); color: var(--red); }

  .json-ta {
    flex: 1;
    padding: 1rem 1.5rem;
    background: var(--bg);
    color: var(--ink);
    border: none;
    outline: none;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.88rem;
    line-height: 1.7;
    resize: none;
  }
</style>
