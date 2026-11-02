<script lang="ts">
  /** Verdeckte Würfe der SL: Schnellwürfel, W20 mit Vorteil/Nachteil, freie Formel. */
  import { diceDe, parseDice, throwDice, type DiceFormula } from '../../utils/dice';
  import PanelSection from './PanelSection.svelte';

  interface Roll {
    id: number;
    label: string;
    rolls: number[];
    kept: number | null;
    bonus: number;
    total: number;
    crit: 'hit' | 'miss' | null;
  }

  const QUICK = [4, 6, 8, 10, 12, 20, 100];
  const LIMIT = { count: 100, sides: 1000 };

  let formula = $state('');
  let invalid = $state(false);
  let history = $state<Roll[]>([]);
  let nextId = 0;

  const critOf = (sides: number, count: number, face: number): Roll['crit'] =>
    sides === 20 && count === 1 ? (face === 20 ? 'hit' : face === 1 ? 'miss' : null) : null;

  function push(roll: Omit<Roll, 'id'>) {
    history = [{ id: nextId++, ...roll }, ...history].slice(0, 12);
  }

  function roll(f: DiceFormula) {
    const t = throwDice(f);
    push({ label: diceDe(f), rolls: t.rolls, kept: null, bonus: f.bonus, total: t.total, crit: critOf(f.sides, f.count, t.rolls[0]) });
  }

  function rollD20(mode: 'adv' | 'dis') {
    const { rolls } = throwDice({ count: 2, sides: 20, bonus: 0 });
    const kept = mode === 'adv' ? Math.max(...rolls) : Math.min(...rolls);
    push({ label: mode === 'adv' ? 'W20 Vorteil' : 'W20 Nachteil', rolls, kept, bonus: 0, total: kept, crit: critOf(20, 1, kept) });
  }

  function rollFormula() {
    const f = parseDice(formula.replace(/w/gi, 'd'));
    invalid = !f || f.count < 1 || f.count > LIMIT.count || f.sides < 2 || f.sides > LIMIT.sides;
    if (invalid) return;
    roll(f!);
  }
</script>

<PanelSection title="Würfel">
  {#snippet actions()}
    {#if history.length}<button title="Verlauf leeren" onclick={() => (history = [])}>🧹</button>{/if}
  {/snippet}

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
</PanelSection>

<style>
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
  li.latest .total {
    font-size: 1.25rem;
    color: var(--red);
  }
  li .total.hit {
    color: #1d8a3a;
  }
  li .total.miss {
    color: var(--danger);
  }
  .dropped {
    text-decoration: line-through;
    opacity: 0.6;
  }
</style>
