<script lang="ts">
  import { formatSpecies } from '../../schemas/classLevelText';
  import type { Character } from '../../schemas/characterSchema';

  let { character, portraitUrl, onPrint, onLevelUp }: {
    character: Character;
    portraitUrl: string;
    onPrint(): void;
    onLevelUp(): void;
  } = $props();
</script>

<div class="header">
  {#if portraitUrl}
    <img class="portrait-thumb" src={portraitUrl} alt="Portrait von {character.name}" />
  {/if}
  <div class="name-block">
    <h1>{character.name}</h1>
    <span class="sub">{character.classLevel} · {character.race || formatSpecies(character.species)}</span>
  </div>
  <div class="header-meta">
    <span>Spieler: <strong>{character.playerName}</strong></span>
    <span>Hintergrund: <strong>{character.background}</strong></span>
    <span>EP: <strong>{character.xp}</strong></span>
  </div>
  <div class="header-actions">
    <button class="icon-btn print" onclick={onPrint}
            aria-label="Charakterbogen drucken" title="Charakterbogen drucken (Vorschau)">🖨</button>
    <button class="icon-btn levelup" onclick={onLevelUp}
            aria-label="Stufenaufstieg" title="Stufenaufstieg">⬆</button>
  </div>
</div>

<style>
  .header {
    padding: 1rem 1.5rem 0;
    border-bottom: 1px solid var(--surface);
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 1rem;
  }

  .portrait-thumb {
    width: 64px;
    height: 80px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg);
  }

  .name-block h1 {
    margin: 0;
    font-size: 1.4rem;
    color: var(--arcane);
  }

  .sub { color: var(--ink-muted); font-size: 0.85rem; }

  .header-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.8rem;
    color: var(--ink-soft);
  }

  .header-actions {
    display: flex;
    align-items: center;
    align-self: center;
    gap: 0.5rem;
    margin-left: auto;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.4rem 0.7rem;
    font-size: 1.15rem;
    font-family: inherit;
    white-space: nowrap;
    cursor: pointer;
  }
  .icon-btn:hover { border-color: var(--arcane); color: var(--arcane); }
  .icon-btn.levelup { font-weight: 700; }
</style>
