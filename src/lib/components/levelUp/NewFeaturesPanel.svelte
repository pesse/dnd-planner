<script lang="ts">
  import './levelUp.css';
  import Markdown from '../Markdown.svelte';
  import PinToggle from '../featurePanel/PinToggle.svelte';
  import type { FeaturePins } from '$lib/services/featurePins';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);
  const d = $derived(st.delta!);

  const pins: FeaturePins = {
    has: (key) => !!key && st.pins.includes(key),
    toggle: (key) => { st.pins = st.pins.includes(key) ? st.pins.filter((k) => k !== key) : [...st.pins, key]; },
  };

  const numbers = $derived.by<string[]>(() => {
    const lines: string[] = [];
    if (d.hitDie) lines.push(`Trefferpunkte: +1W${d.hitDie} + KON-Modifikator pro Stufe`);
    if (d.profBonusTo > d.profBonusFrom) lines.push(`Übungsbonus: +${d.profBonusFrom} → +${d.profBonusTo}`);
    if (d.cantripDelta > 0) lines.push(`Zaubertricks: +${d.cantripDelta}`);
    if (d.preparedDelta > 0) lines.push(`Vorbereitete Zauber: ${d.preparedFrom} → ${d.preparedTo}`);
    d.spellSlotDelta.forEach((n, i) => { if (n > 0) lines.push(`Zauberplätze Grad ${i + 1}: +${n}`); });
    if (d.masteryTo > d.masteryFrom) lines.push(`Waffenbeherrschung: ${d.masteryFrom} → ${d.masteryTo}`);
    return lines;
  });
</script>

<div class="field">
  <span>Das bekommst du auf Stufe {d.toLevel}</span>
  {#if numbers.length}
    <div class="facts">
      {#each numbers as l}<div class="fact">• {l}</div>{/each}
    </div>
  {/if}
  {#if ui.newFeatures.length}
    <div class="new-features">
      {#each ui.newFeatures as f (f.id)}
        <article class="new-feature">
          <h4>{f.name}{#if f.subclass}<span class="badge">Unterklasse</span>{/if}<span class="pin"><PinToggle {pins} featureKey={f.key} /></span></h4>
          {#if f.text}<Markdown source={f.text} />{/if}
        </article>
      {/each}
    </div>
  {:else}
    <span class="hint">Auf dieser Stufe kommen keine neuen Merkmale hinzu.</span>
  {/if}
</div>

<style>
  .new-features { display: flex; flex-direction: column; gap: 0.6rem; }
  .new-feature {
    border: 1px solid var(--border); border-radius: 6px; background: var(--surface);
    padding: 0.6rem 0.8rem; font-size: 0.82rem; color: var(--ink-soft);
  }
  h4 { margin: 0 0 0.3rem; font-size: 0.9rem; color: var(--ink); display: flex; align-items: center; gap: 0.4rem; }
  .pin { margin-left: auto; }
  .badge {
    font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: normal;
    border: 1px solid var(--arcane, var(--red)); border-radius: 999px; padding: 0 0.4rem; color: var(--ink-muted);
  }
</style>
