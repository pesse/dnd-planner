<script lang="ts" module>
  /** Verlauf und Lage der Box überdauern das Schließen der Box und der Karte. */
  interface Roll {
    id: number;
    /** Zum erneuten Würfeln per Klick auf den Verlauf; bei Vorteil/Nachteil leer. */
    formula: string;
    label: string;
    dice: { sides: number; value: number }[];
    kept: number | null;
    bonus: number;
    total: number;
    crit: 'hit' | 'miss' | null;
  }

  let history = $state<Roll[]>([]);
  let formula = $state('');
  let pos = $state<{ x: number; y: number } | null>(null);
  let nextId = 0;
</script>

<script lang="ts">
  /** Verdeckte Würfe der SL als frei verschiebbare Box über der Karte; der letzte Wurf rollt in 3D. */
  import { addToPool, EMPTY_POOL, parsePool, poolDe, throwDice, throwPool } from '../../utils/dice';
  import Dice from '../ui/die/Dice.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const QUICK = [4, 6, 8, 10, 12, 20, 100];
  const LIMIT = { count: 100, sides: 1000 };
  const SOLIDS = [4, 6, 8, 10, 12, 20];
  /** Mehr Körper sind im Kasten nicht mehr zu lesen; dann zählt nur die Summe. */
  const MAX_SOLIDS = 20;

  let box = $state<HTMLElement>();
  let invalid = $state(false);
  let drag: { dx: number; dy: number } | null = null;

  const latest = $derived(history[0]);
  const solid = $derived(latest && latest.dice.every((d) => SOLIDS.includes(d.sides)) && latest.dice.length <= MAX_SOLIDS);
  const pool = $derived(formula.trim() ? parsePool(formula) : EMPTY_POOL);
  const counts = $derived(new Map(pool?.dice.map((d) => [d.sides, d.count])));

  const critOf = (d20: number): Roll['crit'] => (d20 === 20 ? 'hit' : d20 === 1 ? 'miss' : null);

  function push(roll: Omit<Roll, 'id'>) {
    history = [{ id: nextId++, ...roll }, ...history].slice(0, 12);
  }

  function pick(sides: number) {
    if (!pool) return void (invalid = true);
    formula = poolDe(addToPool(pool, sides));
  }

  function rollD20(mode: 'adv' | 'dis') {
    const { rolls } = throwDice({ count: 2, sides: 20, bonus: 0 });
    const kept = mode === 'adv' ? Math.max(...rolls) : Math.min(...rolls);
    const dice = rolls.map((value) => ({ sides: 20, value }));
    push({ formula: '', label: mode === 'adv' ? 'W20 Vorteil' : 'W20 Nachteil', dice, kept, bonus: 0, total: kept, crit: critOf(kept) });
  }

  function rollPool() {
    const count = pool?.dice.reduce((n, d) => n + d.count, 0) ?? 0;
    invalid = !pool || !count || count > LIMIT.count || pool.dice.some((d) => d.sides < 2 || d.sides > LIMIT.sides);
    if (invalid) return;
    const t = throwPool(pool!);
    const label = poolDe(pool!);
    push({ formula: label, label, dice: t.dice, kept: null, bonus: pool!.bonus, total: t.total, crit: t.dice.length === 1 && t.dice[0].sides === 20 ? critOf(t.dice[0].value) : null });
    formula = '';
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

<section bind:this={box} class="tray" style={pos ? `left: ${pos.x}px; top: ${pos.y}px; right: auto;` : ''} aria-label="Würfel">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <header onpointerdown={grab} onpointermove={move} onpointerup={() => (drag = null)}>
    <span class="title">🎲 Würfel</span>
    {#if history.length}<button title="Verlauf leeren" onclick={() => (history = [])}>🧹</button>{/if}
    <button title="Würfel schließen (W)" onclick={onclose}>✕</button>
  </header>

  <div class="content">
    {#if latest}
      <div class="stage">
        {#if solid}
          <div class="dice">
            <Dice dice={latest.dice.map((d) => ({ ...d, dim: latest.kept != null && d.value !== latest.kept }))} roll={latest.id} size={56} gap={4} />
          </div>
        {/if}
        <span class="sum" class:hit={latest.crit === 'hit'} class:miss={latest.crit === 'miss'}>{latest.total}</span>
      </div>
    {/if}

    <div class="quick">
      {#each QUICK as sides}
        <button class:picked={counts.has(sides)} title="W{sides} in den Wurf legen" onclick={() => pick(sides)}>
          W{sides}{#if counts.get(sides)}<span class="count">×{counts.get(sides)}</span>{/if}
        </button>
      {/each}
    </div>
    <div class="pair">
      <button onclick={() => rollD20('adv')}>W20 Vorteil</button>
      <button onclick={() => rollD20('dis')}>W20 Nachteil</button>
    </div>
    <form class="pair" onsubmit={(e) => { e.preventDefault(); rollPool(); }}>
      <span class="pool">
        <input bind:value={formula} class:invalid placeholder="z. B. 3W8+2" aria-label="Wurf" oninput={() => (invalid = false)} />
        {#if formula}<button type="button" class="clear" title="Wurf leeren" onclick={() => { formula = ''; invalid = false; }}>✕</button>{/if}
      </span>
      <button type="submit" class="go" disabled={!formula.trim()}>Würfeln</button>
    </form>

    {#if history.length}
      <ol class="history">
        {#each history as r, i (r.id)}
          <li class:latest={i === 0}>
            <span class="total" class:hit={r.crit === 'hit'} class:miss={r.crit === 'miss'}>{r.total}</span>
            {#if r.formula}
              <button class="detail again" title="{r.formula} wieder in den Wurf legen" onclick={() => (formula = r.formula)}>{@render detail(r)}</button>
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
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.5rem 0.35rem 0.75rem;
    border-bottom: 1px solid var(--surface);
    cursor: move;
    user-select: none;
    touch-action: none;
  }
  .title {
    flex: 1;
    font-family: var(--font-display);
    color: var(--red);
  }
  header button {
    background: none;
    border: none;
    padding: 0.1rem 0.3rem;
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.5rem 0.75rem 0.75rem;
    overflow-y: auto;
  }
  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .dice {
    align-self: stretch;
    text-align: center;
  }
  .sum {
    font-family: var(--font-display);
    font-size: 2rem;
    line-height: 1.1;
    color: var(--red);
  }
  .quick {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.25rem;
  }
  .pair {
    display: flex;
    gap: 0.25rem;
  }
  .pair > * {
    flex: 1;
    min-width: 0;
  }
  button {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.25rem 0.3rem;
  }
  button:hover {
    border-color: var(--red);
  }
  button.picked {
    border-color: var(--red);
    color: var(--red);
  }
  .count {
    margin-left: 0.15em;
    font-size: 0.7rem;
    font-weight: 700;
  }
  .pool {
    position: relative;
    flex: 2;
  }
  .pool input {
    width: 100%;
    padding-right: 1.4rem;
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
    background: var(--red);
    border-color: var(--red);
    color: var(--on-accent);
    font-weight: 600;
  }
  .go:disabled {
    opacity: 0.5;
    cursor: default;
  }
  input.invalid {
    border-color: var(--danger);
  }
  .detail.again {
    all: unset;
    cursor: pointer;
  }
  .detail.again:hover {
    text-decoration: underline dotted;
  }
  .history {
    list-style: none;
    margin: 0.2rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  li {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
    font-size: 0.78rem;
    color: var(--ink-muted);
  }
  li.latest {
    color: var(--ink);
  }
  .total {
    min-width: 2rem;
    text-align: right;
    font-weight: 700;
    font-size: 0.95rem;
  }
  .sum.hit,
  li .total.hit {
    color: #1d8a3a;
  }
  .sum.miss,
  li .total.miss {
    color: var(--danger);
  }
  li .dropped {
    text-decoration: line-through;
    opacity: 0.6;
  }
</style>
