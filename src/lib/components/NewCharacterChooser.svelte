<script lang="ts">
  /** Der Einstieg zu „Neuer Charakter": selbst erstellen, aus einer Vorlage oder aus D&D Beyond. */
  import Modal from './ui/Modal.svelte';
  import type { CharacterTemplateRef } from '../services/templates/templates';
  import { listOfferedCharacterTemplates } from '../services/templates/campaignCharacterTemplates';

  let { onwizard, onrandom, onimport, ontemplate, oncancel }: {
    onwizard: () => void;
    onrandom: () => void;
    onimport: () => void;
    ontemplate: (templateDir: string, level: number) => Promise<void>;
    oncancel: () => void;
  } = $props();

  let templates = $state<CharacterTemplateRef[] | null>(null);
  let showTemplates = $state(false);
  let level = $state(1);
  let busy = $state('');
  let error = $state('');

  $effect(() => {
    void listOfferedCharacterTemplates().then((t) => (templates = t)).catch(() => (templates = []));
  });

  const groups = $derived.by(() => {
    const out = new Map<string, CharacterTemplateRef[]>();
    for (const t of templates ?? []) out.set(t.campaign, [...(out.get(t.campaign) ?? []), t]);
    return [...out];
  });

  const offered = $derived([...new Set((templates ?? []).flatMap((t) => t.levels.map((l) => l.level)))].sort((a, b) => a - b));
  const atLevel = (t: CharacterTemplateRef) => t.levels.find((l) => l.level === level);

  async function pick(t: CharacterTemplateRef) {
    busy = t.dir;
    error = '';
    try {
      await ontemplate(t.dir, level);
    } catch (e) {
      error = `Vorlage konnte nicht angelegt werden: ${e instanceof Error ? e.message : e}`;
    } finally {
      busy = '';
    }
  }
</script>

<Modal title="Neuer Charakter" draggable={false} width="min(640px, 94vw)" onclose={oncancel}>
  {#if !showTemplates}
    <div class="options">
      <button class="option" onclick={onwizard}>
        <span class="title">Neuer Charakter</span>
        <span class="sub">Schritt für Schritt zur Stufe 1</span>
      </button>
      <button class="option" onclick={onrandom}>
        <span class="title">Zufälliger Charakter</span>
        <span class="sub">Gewürfelt, aber spielbar — danach im Wizard anpassen</span>
      </button>
      <button class="option" disabled={!templates?.length} onclick={() => (showTemplates = true)}>
        <span class="title">Aus Vorlage erstellen</span>
        <span class="sub">
          {#if templates === null}Vorlagen werden gesucht…
          {:else if templates.length}Vorgefertigte Charaktere aus einem Abenteuer oder deinen Kampagnen
          {:else}Keine Vorlagen — sie kommen mit Inhaltspaketen wie „Hellfire Club"{/if}
        </span>
      </button>
      <button class="option" onclick={onimport}>
        <span class="title">Aus D&D Beyond importieren</span>
        <span class="sub">Über den Link zu einem öffentlichen Charakter</span>
      </button>
    </div>
  {:else}
    <button class="back" onclick={() => (showTemplates = false)}>← Zurück</button>
    {#if offered.length > 1}
      <div class="levels" role="radiogroup" aria-label="Stufe">
        <span>Stufe</span>
        {#each offered as l (l)}
          <button role="radio" aria-checked={level === l} onclick={() => (level = l)}>{l}</button>
        {/each}
      </div>
    {/if}
    {#each groups as [campaign, list] (campaign)}
      <h3>{campaign || 'Weitere Vorlagen'}</h3>
      <div class="grid">
        {#each list as t (t.dir)}
          {@const at = atLevel(t)}
          <button class="template" disabled={!!busy || !at} title={at ? '' : `Diese Vorlage gibt es nicht auf Stufe ${level}`} onclick={() => pick(t)}>
            {#if t.portraitSrc}
              <img src={t.portraitSrc} alt="" />
            {:else}
              <span class="placeholder">{t.name.slice(0, 1)}</span>
            {/if}
            <span class="name">{busy === t.dir ? 'Wird angelegt…' : t.name}</span>
            <span class="meta">{[t.species, at?.classLevel ?? t.classLevel].filter(Boolean).join(' · ')}</span>
          </button>
        {/each}
      </div>
    {/each}
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</Modal>

<style>
  .options {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .option,
  .template {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.8rem 1rem;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--ink);
    cursor: pointer;
  }
  .option:hover:not(:disabled),
  .template:hover:not(:disabled) {
    border-color: var(--red);
  }
  .option:disabled,
  .template:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .title {
    font-family: var(--font-display);
    font-size: 1.05rem;
  }
  .sub,
  .meta {
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
  .back {
    display: block;
    background: none;
    border: none;
    padding: 0;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .levels {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.8rem;
    font-size: 0.85rem;
  }
  .levels button {
    min-width: 2rem;
    padding: 0.2rem 0.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink);
    cursor: pointer;
  }
  .levels button[aria-checked='true'] {
    border-color: var(--red);
    box-shadow: inset 0 0 0 1px var(--red);
  }
  h3 {
    margin: 0.9rem 0 0.5rem;
    font-size: 0.95rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.6rem;
  }
  .template {
    align-items: center;
    text-align: center;
    padding: 0.7rem;
  }
  .template img,
  .placeholder {
    width: 84px;
    height: 84px;
    border-radius: 50%;
    object-fit: cover;
  }
  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-deep);
    font-size: 2rem;
  }
  .name {
    font-weight: 600;
  }
  .error {
    margin: 0.8rem 0 0;
    color: var(--danger);
  }
</style>
