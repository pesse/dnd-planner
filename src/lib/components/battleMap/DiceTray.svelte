<script lang="ts" module>
  /** Wurf in Arbeit und Lage der Box überdauern das Schließen der Box und der Karte. */
  let pos = $state<{ x: number; y: number } | null>(null);
  let historyOpen = $state(false);
</script>

<script lang="ts">
  /** Verdeckte Würfe der SL als frei verschiebbare Box über der Karte; der letzte Wurf rollt in 3D. */
  import { pinnableTip } from './tips/pinnableTip';
  import { withRule } from '../ruleTips.svelte';
  import { addToPool, EMPTY_POOL, parsePool, poolDe, throwDice, throwPool } from '../../utils/dice';
  import Dice from '../ui/die/Dice.svelte';
  import { diceLog, logRoll, type Roll } from '../../services/battleMap/diceLog.svelte';
  import { diceTray } from '../../services/battleMap/diceTray.svelte';
  import type { MapEditor } from '../../services/battleMap/mapEditor.svelte';
  import { hpAfter } from '../../services/battleMap/tokenDetails';

  let { editor, campaignDir, onclose }: { editor: MapEditor; campaignDir: string; onclose: () => void } = $props();

  const QUICK = [4, 6, 8, 10, 12, 20, 100];
  const LIMIT = { count: 100, sides: 1000 };
  const SOLIDS = [4, 6, 8, 10, 12, 20];
  const GLYPHS: Record<number, string> = {
    4: '12,2.5 22,20.5 2,20.5',
    6: '3.5,3.5 20.5,3.5 20.5,20.5 3.5,20.5',
    8: '12,1.5 21.5,12 12,22.5 2.5,12',
    10: '12,1.5 21.5,10 12,22.5 2.5,10',
    12: '12,1.5 22.5,9.2 18.5,21.5 5.5,21.5 1.5,9.2',
    20: '12,1.5 21.5,6.8 21.5,17.2 12,22.5 2.5,17.2 2.5,6.8',
    100: '12,1.5 21.5,10 12,22.5 2.5,10',
  };
  /** Mehr Körper sind im Kasten nicht mehr zu lesen; dann zählt nur die Summe. */
  const MAX_SOLIDS = 20;

  let box = $state<HTMLElement>();
  let invalid = $state(false);
  let drag: { dx: number; dy: number } | null = null;

  const history = $derived(diceLog.rolls);
  const latest = $derived(history[0]);
  const solid = $derived(latest && latest.dice.every((d) => SOLIDS.includes(d.sides)) && latest.dice.length <= MAX_SOLIDS);
  const pool = $derived(diceTray.formula.trim() ? parsePool(diceTray.formula) : EMPTY_POOL);
  const counts = $derived(new Map(pool?.dice.map((d) => [d.sides, d.count])));

  const critOf = (d20: number): Roll['crit'] => (d20 === 20 ? 'hit' : d20 === 1 ? 'miss' : null);

  function pick(sides: number) {
    if (!pool) return void (invalid = true);
    diceTray.formula = poolDe(addToPool(pool, sides));
  }

  function rollD20(mode: 'adv' | 'dis') {
    const { rolls } = throwDice({ count: 2, sides: 20, bonus: 0 });
    const kept = mode === 'adv' ? Math.max(...rolls) : Math.min(...rolls);
    const dice = rolls.map((value) => ({ sides: 20, value }));
    logRoll({ formula: '', label: mode === 'adv' ? 'W20 Vorteil' : 'W20 Nachteil', dice, kept, bonus: 0, total: kept, crit: critOf(kept) });
  }

  function rollPool() {
    const count = pool?.dice.reduce((n, d) => n + d.count, 0) ?? 0;
    invalid = !pool || !count || count > LIMIT.count || pool.dice.some((d) => d.sides < 2 || d.sides > LIMIT.sides);
    if (invalid) return;
    const t = throwPool(pool!);
    const label = poolDe(pool!);
    logRoll({ formula: label, label, dice: t.dice, kept: null, bonus: pool!.bonus, total: t.total, crit: t.dice.length === 1 && t.dice[0].sides === 20 ? critOf(t.dice[0].value) : null });
    diceTray.formula = '';
  }

  const target = $derived(editor.selected?.kind === 'monster' ? editor.selected : null);

  async function applyHp(sign: 1 | -1) {
    if (!target || !latest) return;
    const next = await hpAfter(target, campaignDir, sign * latest.total);
    if (!next) return;
    editor.checkpoint();
    editor.updateToken(target.id, next);
  }

  function grab(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button') || !box) return;
    const r = box.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function move(e: PointerEvent) {
    if (!drag || !box?.offsetParent) return;
    const area = box.offsetParent.getBoundingClientRect();
    const clamp = (v: number, max: number) => Math.min(Math.max(0, v), Math.max(0, max));
    pos = {
      x: clamp(e.clientX - drag.dx - area.left, area.width - box.offsetWidth),
      y: clamp(e.clientY - drag.dy - area.top, area.height - box.offsetHeight),
    };
  }
</script>

{#snippet detail(r: Roll)}
  {r.label}
  {#if r.dice.length > 1 || r.bonus}
    · [{#each r.dice as d, j}{j ? ', ' : ''}<span class:dropped={r.kept != null && d.value !== r.kept}>{d.value}</span>{/each}]{r.bonus > 0 ? ` + ${r.bonus}` : r.bonus < 0 ? ` − ${-r.bonus}` : ''}
  {/if}
{/snippet}

<section bind:this={box} class="tray" data-no-dice-refs style={pos ? `left: ${pos.x}px; top: ${pos.y}px; right: auto;` : ''} aria-label="Würfel">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <header onpointerdown={grab} onpointermove={move} onpointerup={() => (drag = null)}>
    <span class="title">Würfel</span>
    {#if history.length}<button title="Verlauf leeren" onclick={() => (diceLog.rolls = [])}>🧹</button>{/if}
    <button title="Würfel schließen (W)" onclick={onclose}>✕</button>
  </header>

  <div class="stage">
    {#if latest}
      {#if solid}
        <Dice dice={latest.dice.map((d) => ({ ...d, dim: latest.kept != null && d.value !== latest.kept }))} roll={latest.id} size={52} gap={4} />
      {/if}
      <span class="sum" class:hit={latest.crit === 'hit'} class:miss={latest.crit === 'miss'}>{latest.total}</span>
      <span class="what">{latest.label}</span>
    {:else}
      <span class="what">Würfel wählen, dann werfen</span>
    {/if}
    {#if latest}
      <div class="apply">
        <button class="hurt" disabled={!target} title={target ? `${latest.total} Schaden auf ${target.name}` : 'Erst ein Monster-Token auswählen'} onclick={() => applyHp(-1)}>⚔</button>
        <button class="mend" disabled={!target} title={target ? `${latest.total} TP Heilung für ${target.name}` : 'Erst ein Monster-Token auswählen'} onclick={() => applyHp(1)}>✚</button>
      </div>
    {/if}
  </div>

  <div class="content">
    <div class="quick">
      {#each QUICK as sides}
        <button class:picked={counts.has(sides)} title="W{sides} in den Wurf legen" aria-label="W{sides}" onclick={() => pick(sides)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <polygon points={GLYPHS[sides]} />
            <text x="12" y={sides === 4 ? 17.5 : 13}>{sides === 100 ? '%' : sides}</text>
          </svg>
          {#if counts.get(sides)}<span class="count">{counts.get(sides)}</span>{/if}
        </button>
      {/each}
    </div>
    <form class="row" onsubmit={(e) => { e.preventDefault(); rollPool(); }}>
      <span class="pool">
        <input bind:value={diceTray.formula} class:invalid placeholder="z. B. 3W8+2" aria-label="Wurf" oninput={() => (invalid = false)} />
        {#if diceTray.formula}<button type="button" class="clear" title="Wurf leeren" onclick={() => { diceTray.formula = ''; invalid = false; }}>✕</button>{/if}
      </span>
      <button type="submit" class="go" disabled={!diceTray.formula.trim()}>Würfeln</button>
    </form>
    <div class="row">
      <button class="d20" use:pinnableTip={withRule('Zwei W20, der höhere zählt.', 'srd-2024_advantage')} onclick={() => rollD20('adv')}>▲ Vorteil</button>
      <button class="d20" use:pinnableTip={withRule('Zwei W20, der niedrigere zählt.', 'srd-2024_disadvantage')} onclick={() => rollD20('dis')}>▼ Nachteil</button>
      {#if history.length > 1}
        <button class="toggle" aria-expanded={historyOpen} title="Verlauf {historyOpen ? 'zuklappen' : 'aufklappen'}" onclick={() => (historyOpen = !historyOpen)}>
          <span class="caret">▸</span>{history.length - 1}
        </button>
      {/if}
    </div>
    {#if history.length > 1 && historyOpen}
      <ol class="history">
        {#each history.slice(1) as r (r.id)}
          <li>
            <span class="total" class:hit={r.crit === 'hit'} class:miss={r.crit === 'miss'}>{r.total}</span>
            {#if r.formula}
              <button class="detail again" title="{r.formula} wieder in den Wurf legen" onclick={() => (diceTray.formula = r.formula)}>{@render detail(r)}</button>
            {:else}
              <span class="detail">{@render detail(r)}</span>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</section>

<style>
  .tray {
    position: absolute;
    top: 0.75rem;
    right: calc(clamp(20rem, 26vw, 28rem) + 0.75rem);
    z-index: 20;
    width: 17rem;
    max-height: calc(100% - 1.5rem);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    filter: drop-shadow(0 8px 12px rgba(20, 8, 0, 0.55));
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    aspect-ratio: 1100 / 136;
    padding: 0.15rem 2.3rem 0 2.6rem;
    background: url('/branding/dice/header.webp') center / 100% 100% no-repeat;
    cursor: move;
    user-select: none;
    touch-action: none;
  }
  .title {
    flex: 1;
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #f0d68e;
    text-shadow: 0 1px 2px #000;
  }
  header button {
    background: none;
    border: none;
    color: #f0d68e;
    padding: 0.1rem 0.35rem;
  }
  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1rem;
    position: relative;
    min-height: 7.5rem;
    padding: 0.3rem;
    text-align: center;
    border: 12px solid #5a3a1e;
    border-image: url('/branding/dice/tray.webp') 32 fill / 12px stretch;
  }
  .apply {
    position: absolute;
    right: 0.15rem;
    bottom: 0.1rem;
    display: flex;
    gap: 0.2rem;
  }
  .apply button {
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    font-size: 0.8rem;
    line-height: 1;
    color: #fff;
    border: 1px solid rgba(0, 0, 0, 0.4);
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
    cursor: pointer;
  }
  .apply .hurt {
    background: #8e1c12;
  }
  .apply .mend {
    background: #2f6b2a;
  }
  .apply button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .sum {
    font-family: var(--font-display);
    font-size: 2.2rem;
    font-weight: 700;
    line-height: 1;
    color: #f6dc8c;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8);
  }
  .sum.hit {
    color: #9df0a0;
  }
  .sum.miss {
    color: #ff9c8a;
  }
  .what {
    font-size: 0.72rem;
    color: rgba(246, 230, 190, 0.85);
    text-shadow: 0 1px 2px #000;
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.55rem 0.6rem 0.6rem;
    min-height: 0;
    background: var(--bg-panel);
    border: 1px solid #3a2416;
    border-radius: 10px;
  }
  .quick {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.2rem;
  }
  .quick button {
    position: relative;
    padding: 0.15rem;
    aspect-ratio: 1;
    border-radius: 6px;
  }
  .quick svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .quick polygon {
    fill: color-mix(in srgb, var(--arcane) 14%, transparent);
    stroke: var(--arcane);
    stroke-width: 1.4;
    stroke-linejoin: round;
  }
  .quick text {
    font: 700 7.5px var(--font-ui);
    fill: var(--ink);
    text-anchor: middle;
    dominant-baseline: middle;
  }
  .quick button.picked {
    border-color: var(--red);
    background: color-mix(in srgb, var(--red) 10%, var(--bg-raised));
  }
  .quick button.picked polygon {
    fill: var(--arcane);
  }
  .quick button.picked text {
    fill: #fff;
  }
  .count {
    position: absolute;
    top: -0.35rem;
    right: -0.3rem;
    min-width: 1rem;
    padding: 0 0.2rem;
    border-radius: 0.5rem;
    background: var(--red);
    color: var(--on-accent);
    font-size: 0.65rem;
    font-weight: 700;
    line-height: 1rem;
  }
  .row {
    display: flex;
    gap: 0.25rem;
  }
  button {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.2rem 0.3rem;
  }
  button:hover {
    border-color: var(--red);
  }
  .d20 {
    flex: 1;
  }
  .pool {
    position: relative;
    flex: 1;
    min-width: 0;
  }
  .pool input {
    width: 100%;
    padding-right: 1.4rem;
    font-size: 0.8rem;
  }
  .clear {
    position: absolute;
    right: 0.1rem;
    top: 50%;
    transform: translateY(-50%);
    border: none;
    background: none;
    padding: 0 0.3rem;
  }
  .go {
    padding: 0.2rem 0.7rem;
    background: var(--red);
    border-color: var(--red);
    color: var(--on-accent);
    font-family: var(--font-display);
    font-weight: 700;
  }
  .go:disabled {
    opacity: 0.45;
    cursor: default;
  }
  input.invalid {
    border-color: var(--danger);
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    color: var(--ink-muted);
    font-size: 0.7rem;
  }
  .caret {
    transition: transform 0.15s;
  }
  .toggle[aria-expanded='true'] .caret {
    transform: rotate(90deg);
  }
  .history {
    list-style: none;
    margin: 0;
    padding: 0.25rem 0 0;
    border-top: 1px solid var(--border);
    max-height: 7.5rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  li {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
    font-size: 0.75rem;
    color: var(--ink-muted);
  }
  .total {
    min-width: 1.8rem;
    text-align: right;
    font-weight: 700;
    color: var(--ink-soft);
  }
  .total.hit {
    color: var(--green);
  }
  .total.miss {
    color: var(--danger);
  }
  .detail.again {
    all: unset;
    cursor: pointer;
  }
  .detail.again:hover {
    text-decoration: underline dotted;
  }
  .dropped {
    text-decoration: line-through;
    opacity: 0.6;
  }
</style>
