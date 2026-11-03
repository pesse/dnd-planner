<script lang="ts">
  /** Eine Falle auf der Karte: Zustand, Aufdecken für die Spieler und die Werte zum Würfeln. */
  import { TRAP_STATES, type Token, type TrapState } from '../../../schemas/battleMap';
  import type { MapEditor } from '../../../services/battleMap/mapEditor.svelte';
  import { rollNow } from '../../../services/battleMap/diceTray.svelte';
  import { getTrapByKey, type TrapInfo } from '../../../trapsLibrary';
  import { checkDe, damageDe, damageFormula, saveDe, trapTiers } from '../../../services/trapFormat';
  import { TRAP_SEVERITIES } from '../../../schemas/trap';
  import Markdown from '../../Markdown.svelte';

  let { editor, token: t }: { editor: MapEditor; token: Token } = $props();

  let trap = $state<TrapInfo | null>(null);
  let missing = $state(false);

  $effect(() => {
    const ref = t.ref;
    trap = null;
    missing = false;
    if (!ref) return;
    let live = true;
    void getTrapByKey(ref).then((found) => {
      if (!live) return;
      trap = found ?? null;
      missing = !found;
    });
    return () => { live = false; };
  });

  const tiers = $derived(trap ? trapTiers(trap) : []);
  const tier = $derived(tiers[Math.min(t.trapTier, tiers.length - 1)]);
  const formula = $derived(tier ? damageFormula(tier.damage) : '');

  function update(patch: Partial<Token>) {
    editor.checkpoint();
    editor.updateToken(t.id, patch);
  }

  /** Eine ausgelöste Falle sehen die Spieler ohnehin — sie wird mit aufgedeckt. */
  const setState = (s: TrapState) => update(s === 'triggered' ? { trapState: s, hidden: false } : { trapState: s });
</script>

<div class="trap">
  <div class="states" role="group" aria-label="Zustand der Falle">
    {#each Object.entries(TRAP_STATES) as [key, label] (key)}
      <button class={key} class:on={t.trapState === key} aria-pressed={t.trapState === key} onclick={() => setState(key as TrapState)}>{label}</button>
    {/each}
  </div>
  {#if t.hidden}
    <button class="reveal" onclick={() => update({ hidden: false })}>Entdeckt — den Spielern zeigen</button>
  {:else}
    <p class="muted">Die Spieler sehen die Falle, aber keine Werte.</p>
  {/if}

  {#if trap}
    <p class="meta">
      {TRAP_SEVERITIES[trap.severity]}
      {#if tiers.length > 1}
        · <label>Stufe
          <select value={Math.min(t.trapTier, tiers.length - 1)} onchange={(e) => update({ trapTier: Number(e.currentTarget.value) })}>
            {#each tiers as tr, i (i)}<option value={i}>{tr.levels}</option>{/each}
          </select>
        </label>
      {:else if trap.levels}
        · Stufe {trap.levels}
      {/if}
    </p>
    <dl>
      {#if trap.triggerDe || trap.trigger}<dt>Auslöser</dt><dd>{trap.triggerDe || trap.trigger}</dd>{/if}
      {#if trap.save}<dt>Rettungswurf</dt><dd>{saveDe(trap.save, tier?.saveDc ?? trap.save.dc)}</dd>{/if}
      {#if tier?.damage.length}
        <dt>Schaden</dt>
        <dd>
          {damageDe(tier.damage)}
          <button class="roll" title="{formula} würfeln" onclick={() => rollNow(formula)}>🎲</button>
        </dd>
      {/if}
      {#if tier?.noteDe || tier?.note}<dt>Außerdem</dt><dd>{tier.noteDe || tier.note}</dd>{/if}
      {#if trap.detect.length}<dt>Entdecken</dt><dd>{trap.detect.map(checkDe).join(' · ')}</dd>{/if}
      {#if trap.disarm.length}<dt>Entschärfen</dt><dd>{trap.disarm.map(checkDe).join(' · ')}</dd>{/if}
    </dl>
    {#if trap.descDe || trap.desc}
      <details>
        <summary>Beschreibung</summary>
        <div class="desc"><Markdown source={trap.descDe || trap.desc} /></div>
      </details>
    {/if}
  {:else if missing}
    <p class="muted">Keine Falle „{t.ref}" in der Bibliothek.</p>
  {/if}
</div>

<style>
  .trap {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.75rem 1rem;
    font-size: 0.85rem;
  }
  .states {
    display: flex;
    gap: 0.25rem;
  }
  .states button {
    flex: 1;
    padding: 0.25rem 0.3rem;
    font-size: 0.8rem;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .states button.on {
    color: #fff;
  }
  .states .armed.on {
    background: #8a2012;
    border-color: #8a2012;
  }
  .states .triggered.on {
    background: #9a3b0c;
    border-color: #9a3b0c;
  }
  .states .disarmed.on {
    background: #2f6b2a;
    border-color: #2f6b2a;
  }
  .reveal {
    padding: 0.3rem;
    font-size: 0.8rem;
    background: var(--bg-raised);
    border: 1px dashed var(--red);
    border-radius: 4px;
    color: var(--red);
    cursor: pointer;
  }
  .meta {
    margin: 0;
    color: var(--ink-muted);
    font-size: 0.78rem;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.2rem 0.6rem;
    margin: 0;
  }
  dt {
    font-weight: 700;
    color: var(--red);
  }
  dd {
    margin: 0;
  }
  .roll {
    padding: 0 0.3rem;
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
  }
  summary {
    cursor: pointer;
    color: var(--ink-muted);
  }
  .desc {
    line-height: 1.5;
  }
  .muted {
    margin: 0;
    color: var(--ink-muted);
    font-size: 0.78rem;
    font-style: italic;
  }
</style>
