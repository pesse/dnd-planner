<script lang="ts" module>
  /** Verlauf und Lage der Box überdauern das Schließen der Box und der Karte. */
  interface Roll {
    id: number;
    label: string;
    sides: number;
    rolls: number[];
    kept: number | null;
    bonus: number;
    total: number;
    crit: 'hit' | 'miss' | null;
  }

  let history = $state<Roll[]>([]);
  let pos = $state<{ x: number; y: number } | null>(null);
  let nextId = 0;
</script>

<script lang="ts">
  /** Verdeckte Würfe der SL als frei verschiebbare Box über der Karte; der letzte Wurf rollt in 3D. */
  import { diceDe, parseDice, throwDice, type DiceFormula } from '../../utils/dice';
  import Die from '../ui/die/Die.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const QUICK = [4, 6, 8, 10, 12, 20, 100];
  const LIMIT = { count: 100, sides: 1000 };
  const SOLIDS = [4, 6, 8, 10, 12, 20];
  /** Jeder Würfel ist ein eigener WebGL-Kontext, und der Browser hält nur ein gutes Dutzend gleichzeitig. */
  const MAX_SOLIDS = 6;

  let box = $state<HTMLElement>();
  let formula = $state('');
  let invalid = $state(false);
  let drag: { dx: number; dy: number } | null = null;

  const latest = $derived(history[0]);
  const solid = $derived(latest && SOLIDS.includes(latest.sides) && latest.rolls.length <= MAX_SOLIDS);

  const critOf = (sides: number, count: number, face: number): Roll['crit'] =>
    sides === 20 && count === 1 ? (face === 20 ? 'hit' : face === 1 ? 'miss' : null) : null;

  function push(roll: Omit<Roll, 'id'>) {
    history = [{ id: nextId++, ...roll }, ...history].slice(0, 12);
  }

  function roll(f: DiceFormula) {
    const t = throwDice(f);
    push({ label: diceDe(f), sides: f.sides, rolls: t.rolls, kept: null, bonus: f.bonus, total: t.total, crit: critOf(f.sides, f.count, t.rolls[0]) });
  }

  function rollD20(mode: 'adv' | 'dis') {
    const { rolls } = throwDice({ count: 2, sides: 20, bonus: 0 });
    const kept = mode === 'adv' ? Math.max(...rolls) : Math.min(...rolls);
    push({ label: mode === 'adv' ? 'W20 Vorteil' : 'W20 Nachteil', sides: 20, rolls, kept, bonus: 0, total: kept, crit: critOf(20, 1, kept) });
  }

  function rollFormula() {
    const f = parseDice(formula.replace(/w/gi, 'd'));
    invalid = !f || f.count < 1 || f.count > LIMIT.count || f.sides < 2 || f.sides > LIMIT.sides;
    if (invalid) return;
    roll(f!);
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

<section bind:this={box} class="tray" style={pos ? `left: ${pos.x}px; top: ${pos.y}px; right: auto;` : ''} aria-label="Würfel">
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
            {#each latest.rolls as value, i (`${latest.id}-${i}`)}
              <span class:dropped={latest.kept != null && value !== latest.kept}>
                <Die sides={latest.sides} {value} roll={latest.id} delay={i * 90} />
              </span>
            {/each}
          </div>
        {/if}
        <span class="sum" class:hit={latest.crit === 'hit'} class:miss={latest.crit === 'miss'}>{latest.total}</span>
      </div>
    {/if}

    <div class="quick">
      {#each QUICK as sides}
        <button onclick={() => roll({ count: 1, sides, bonus: 0 })}>W{sides}</button>
      {/each}
    </div>
    <div class="pair">
      <button onclick={() => rollD20('adv')}>W20 Vorteil</button>
      <button onclick={() => rollD20('dis')}>W20 Nachteil</button>
    </div>
    <form class="pair" onsubmit={(e) => { e.preventDefault(); rollFormula(); }}>
      <input bind:value={formula} class:invalid placeholder="z. B. 2W6+3" aria-label="Würfelformel" oninput={() => (invalid = false)} />
      <button type="submit">Würfeln</button>
    </form>

    {#if history.length}
      <ol class="history">
        {#each history as r, i (r.id)}
          <li class:latest={i === 0}>
            <span class="total" class:hit={r.crit === 'hit'} class:miss={r.crit === 'miss'}>{r.total}</span>
            <span class="detail">
              {r.label}
              {#if r.rolls.length > 1 || r.bonus}
                · [{#each r.rolls as d, j}{j ? ', ' : ''}<span class:dropped={r.kept != null && d !== r.kept}>{d}</span>{/each}]{r.bonus > 0 ? ` + ${r.bonus}` : r.bonus < 0 ? ` − ${-r.bonus}` : ''}
              {/if}
            </span>
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
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
  }
  .dice .dropped {
    opacity: 0.35;
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
  input.invalid {
    border-color: var(--danger);
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
