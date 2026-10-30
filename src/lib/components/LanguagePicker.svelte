<script lang="ts">
  /** Sprachwahl als Chips aus den SRD-Sprachtabellen, dazu frei getippte Sprachen (Homebrew). */
  import { RARE_LANGUAGES, STANDARD_LANGUAGES } from '../services/wizard/personal';

  let {
    selected,
    max,
    known = [],
    rareCaveat = '',
    onchange,
  }: {
    selected: string[];
    max: number;
    /** Schon beherrscht — sichtbar, aber nicht wählbar. */
    known?: readonly string[];
    /** Gesetzt, wenn seltene Sprachen nur ausnahmsweise wählbar sind: sie klappen dann ein. */
    rareCaveat?: string;
    onchange: (next: string[]) => void;
  } = $props();

  const listed = new Set<string>([...STANDARD_LANGUAGES, ...RARE_LANGUAGES]);
  const custom = $derived(selected.filter((l) => !listed.has(l)));
  const full = $derived(selected.length >= max);
  const rarePicked = $derived(selected.some((l) => (RARE_LANGUAGES as readonly string[]).includes(l)));

  let draft = $state('');

  function toggle(lang: string) {
    if (selected.includes(lang)) onchange(selected.filter((l) => l !== lang));
    else if (!full) onchange([...selected, lang]);
  }

  function addDraft() {
    const lang = draft.trim();
    if (!lang || full || selected.includes(lang) || known.includes(lang)) return;
    onchange([...selected, lang]);
    draft = '';
  }
</script>

{#snippet chip(lang: string)}
  {@const isKnown = known.includes(lang)}
  <button type="button" class="lp-chip" class:sel={selected.includes(lang)} class:known={isKnown}
          title={isKnown ? 'Beherrschst du schon' : undefined}
          disabled={isKnown || (!selected.includes(lang) && full)} onclick={() => toggle(lang)}>{lang}</button>
{/snippet}

<div class="lp">
  <div class="lp-group">
    <span class="lp-title">Standardsprachen</span>
    <div class="lp-chips">{#each STANDARD_LANGUAGES as lang}{@render chip(lang)}{/each}</div>
  </div>

  {#if rareCaveat}
    <details class="lp-rare" open={rarePicked}>
      <summary>Seltene Sprachen</summary>
      <p class="lp-note">{rareCaveat}</p>
      <div class="lp-chips">{#each RARE_LANGUAGES as lang}{@render chip(lang)}{/each}</div>
    </details>
  {:else}
    <div class="lp-group">
      <span class="lp-title">Seltene Sprachen</span>
      <div class="lp-chips">{#each RARE_LANGUAGES as lang}{@render chip(lang)}{/each}</div>
    </div>
  {/if}

  <div class="lp-group">
    <span class="lp-title">Andere Sprache</span>
    <div class="lp-chips">
      {#each custom as lang}
        <button type="button" class="lp-chip sel" title="Entfernen" onclick={() => toggle(lang)}>{lang} ✕</button>
      {/each}
      <input class="lp-input" type="text" placeholder="z. B. aus der Kampagne" bind:value={draft} disabled={full}
             onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }} onblur={addDraft} />
    </div>
  </div>

  <p class="lp-note">Gewählt: {selected.length} / {max}</p>
</div>

<style>
  .lp { display: flex; flex-direction: column; gap: 0.5rem; }
  .lp-group { display: flex; flex-direction: column; gap: 0.25rem; }
  .lp-title, .lp-rare summary { font-size: 0.74rem; color: var(--ink-muted); }
  .lp-rare summary { cursor: pointer; }
  .lp-rare .lp-chips { margin-top: 0.25rem; }
  .lp-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; }
  .lp-chip {
    background: var(--surface); color: var(--ink-soft); border: 1px solid var(--border);
    border-radius: 999px; padding: 0.25rem 0.65rem; cursor: pointer; font: inherit; font-size: 0.82rem;
  }
  .lp-chip:hover:not(:disabled) { border-color: var(--border-strong); }
  .lp-chip.sel { background: var(--arcane, var(--gold)); color: #fff; border-color: transparent; font-weight: 600; }
  .lp-chip:disabled { opacity: 0.45; cursor: not-allowed; }
  .lp-chip.known { text-decoration: line-through; }
  .lp-input {
    font: inherit; font-size: 0.82rem; padding: 0.2rem 0.5rem; min-width: 12rem;
    background: var(--surface); color: var(--ink); border: 1px solid var(--border); border-radius: 999px;
  }
  .lp-note { margin: 0; font-size: 0.74rem; color: var(--ink-muted); }
</style>
