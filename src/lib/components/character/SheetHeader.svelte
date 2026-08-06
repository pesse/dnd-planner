<script lang="ts">
  import { formatSpecies } from '../../schemas/classLevelText';
  import type { Character } from '../../schemas/characterSchema';
  import type { CharacterPdf } from '../../pdf/useCharacterPdf.svelte';

  let { character, portraitUrl, pdf, onLevelUp }: {
    character: Character;
    portraitUrl: string;
    pdf: CharacterPdf;
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
    {#snippet pdfIcon()}
      <svg viewBox="0 0 24 24" width="16" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/>
        <text x="11.5" y="18.5" font-size="6.5" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle" font-family="sans-serif">PDF</text>
      </svg>
    {/snippet}
    <button class="icon-btn import" class:busy={pdf.importing} onclick={pdf.importIntoExisting} disabled={pdf.importing}
            aria-label="PDF importieren" title="PDF importieren, aktuelle Werte überschreiben">
      <span class="arrow">&rarr;</span>{@render pdfIcon()}
    </button>
    <button class="icon-btn export" class:busy={pdf.exporting} onclick={pdf.exportToFile} disabled={pdf.exporting}
            aria-label="Als PDF exportieren" title="Ausgefülltes ATaendler-PDF exportieren">
      {@render pdfIcon()}<span class="arrow">&rarr;</span>
    </button>
    <button class="icon-btn levelup" onclick={onLevelUp}
            aria-label="Stufenaufstieg" title="Stufenaufstieg (KI-gestützt)">⬆</button>
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
    gap: 0.5rem;
    margin-left: auto;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.3rem;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    font-size: 0.9rem;
    font-family: inherit;
    white-space: nowrap;
    cursor: pointer;
  }
  .icon-btn .arrow { font-size: 0.95rem; line-height: 1; }
  .icon-btn:disabled { opacity: 0.6; cursor: default; }
  .icon-btn.import:hover { border-color: var(--arcane); color: var(--arcane); }
  .icon-btn.export:hover { border-color: var(--green); color: var(--green); }
  .icon-btn.levelup { justify-content: center; font-weight: 700; }
  .icon-btn.levelup:hover { border-color: var(--arcane); color: var(--arcane); }
  .icon-btn.busy { animation: icon-pulse 1s ease-in-out infinite; }

  @keyframes icon-pulse {
    0%, 100% { opacity: 0.4; }
    50%      { opacity: 1; }
  }
</style>
