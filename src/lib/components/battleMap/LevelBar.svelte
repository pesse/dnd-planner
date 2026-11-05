<script lang="ts">
  /** Stockwerkwahl über der Karte, oben das höchste: Klick wechselt die SL-Ansicht, das Auge holt die Spieler nach, der Pfeil auch ihre Charaktere. Ein Token lässt sich auf eine Zeile ziehen. */
  import type { MapEditor } from '../../services/battleMap/mapEditor.svelte';
  import { levelStack, partyOn, resolveLevel } from '../../services/battleMap/levels';
  import EyeIcon from '../ui/EyeIcon.svelte';

  let { editor, dropLevel = null }: { editor: MapEditor; dropLevel?: string | null } = $props();

  const map = $derived(editor.map!);
  const stack = $derived(levelStack(map));
  const playerLevel = $derived(resolveLevel(map, map.playerLevel));
  const party = $derived(partyOn(map, playerLevel).length);
  const playerElevation = $derived(stack.find((l) => l.id === playerLevel)?.elevation ?? 0);
</script>

<!-- Eigene Zeigerereignisse: sonst griffe das Kartenwerkzeug durch die Leiste hindurch. -->
<nav class="levels" aria-label="Ebenen" onpointerdown={(e) => e.stopPropagation()} onwheel={(e) => e.stopPropagation()}>
  {#each stack as l (l.id)}
    {@const here = partyOn(map, l.id).length}
    <div class="row" class:active={l.id === editor.level} class:drop={l.id === dropLevel} data-level-id={l.id}>
      <button class="name" aria-current={l.id === editor.level} onclick={() => (editor.level = l.id)}>
        {l.name}
        {#if here}<span class="count" title="{here} sichtbare Charaktere">{here}</span>{/if}
      </button>
      {#if l.id !== playerLevel && party}
        <button class="bring" title="Die {party} Charaktere der Spieler-Ebene hierher holen und den Spielern diese Ebene zeigen" onclick={() => editor.bringPartyTo(l.id)}>
          {l.elevation > playerElevation ? '↥' : '↧'}
        </button>
      {/if}
      {#if l.id === playerLevel}
        <span class="eye shown" title="Die Spieler sehen diese Ebene"><EyeIcon /></span>
      {:else}
        <button class="eye" title="Spielern diese Ebene zeigen" onclick={() => editor.showLevelToPlayers(l.id)}><EyeIcon closed /></button>
      {/if}
    </div>
  {/each}
</nav>

<style>
  .levels {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    background: rgba(20, 14, 10, 0.82);
    border: 1px solid rgba(243, 230, 200, 0.18);
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    cursor: default;
  }
  .row {
    display: flex;
    align-items: stretch;
    gap: 2px;
    border-radius: 4px;
  }
  .row.active {
    background: rgba(255, 211, 107, 0.2);
  }
  .row.drop {
    outline: 2px dashed #6fc3ff;
    outline-offset: -2px;
  }
  button {
    background: none;
    border: none;
    color: #f3e6c8;
    cursor: pointer;
    font: inherit;
  }
  .name {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.6rem;
    text-align: left;
    font-size: 0.85rem;
    opacity: 0.75;
  }
  .row.active .name {
    opacity: 1;
    font-weight: 600;
  }
  .name:hover {
    opacity: 1;
  }
  .count {
    margin-left: auto;
    min-width: 1.3em;
    padding: 0 0.3em;
    font-size: 0.7rem;
    text-align: center;
    background: rgba(111, 195, 255, 0.35);
    border-radius: 0.65em;
  }
  .eye {
    display: flex;
    align-items: center;
    padding: 0 0.4rem;
    color: rgba(243, 230, 200, 0.4);
  }
  .bring {
    padding: 0 0.35rem;
    font-size: 0.95rem;
    color: rgba(111, 195, 255, 0.7);
  }
  .bring:hover {
    color: #6fc3ff;
  }
  button.eye:hover {
    color: #f3e6c8;
  }
  .eye.shown {
    color: #6fc3ff;
  }
</style>
