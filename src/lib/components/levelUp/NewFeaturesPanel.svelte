<script lang="ts">
  import './levelUp.css';
  import Markdown from '../Markdown.svelte';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);
  const d = $derived(st.delta!);

  interface Shown { id: string; name: string; text: string; subclass: boolean }

  // `subclassFeaturesGained` (Subklasse schon gewählt) und `subFeatures` (in diesem Aufstieg
  // gewählt) schließen sich aus — der Schlüssel fängt nur Dubletten im Vault.
  const features = $derived.by<Shown[]>(() => {
    const seen = new Set<string>();
    const out: Shown[] = [];
    const add = (f: { key?: string; name: string; nameDe?: string; desc?: string; descDe?: string }, subclass: boolean) => {
      const id = f.key || f.name;
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ id, name: f.nameDe || f.name, text: f.descDe || f.desc || '', subclass });
    };
    d.featuresGained.forEach((f) => add(f, false));
    d.subclassFeaturesGained.forEach((f) => add(f, true));
    st.subFeatures.forEach((f) => add(f, true));
    return out;
  });

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

<div class="row">
  <span class="field-label">Das bekommst du auf Stufe {d.toLevel}</span>
  {#if numbers.length}
    <div class="facts">
      {#each numbers as l}<div class="fact">• {l}</div>{/each}
    </div>
  {/if}
  {#if features.length}
    <div class="new-features">
      {#each features as f (f.id)}
        <article class="new-feature">
          <h4>{f.name}{#if f.subclass}<span class="badge">Unterklasse</span>{/if}</h4>
          {#if f.text}<Markdown source={f.text} />{/if}
        </article>
      {/each}
    </div>
  {:else}
    <span class="field-hint">Auf dieser Stufe kommen keine neuen Merkmale hinzu.</span>
  {/if}
</div>

<style>
  .new-features { display: flex; flex-direction: column; gap: 0.6rem; }
  .new-feature {
    border: 1px solid var(--border); border-radius: 6px; background: var(--surface);
    padding: 0.6rem 0.8rem; font-size: 0.82rem; color: var(--ink-soft);
  }
  h4 { margin: 0 0 0.3rem; font-size: 0.9rem; color: var(--ink); display: flex; align-items: center; gap: 0.4rem; }
  .badge {
    font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: normal;
    border: 1px solid var(--arcane, var(--red)); border-radius: 999px; padding: 0 0.4rem; color: var(--ink-muted);
  }
</style>
