<script lang="ts">
  /** Initiative-Leiste: Reihenfolge, wer am Zug ist, Runden. */
  import { pinnableTip } from './tips/pinnableTip';
  import { badgeTip } from '../ruleTips.svelte';
  import { CONDITIONS } from '../../schemas/vocabulary';
  import { isFighter, TOKEN_EFFECTS } from '../../schemas/battleMap';
  import { rollNow } from '../../services/battleMap/diceTray.svelte';
  import { badgeIconUrl } from '../../conditionIcon';
  import { isBloodied } from '../../services/battleMap/tokenDetails';
  import type { MapEditor } from '../../services/battleMap/mapEditor.svelte';
  import { initiativeOrder, rollMonsterInitiatives } from '../../services/battleMap/initiative';
  import PanelSection from './PanelSection.svelte';

  let { editor, campaignDir }: { editor: MapEditor; campaignDir: string } = $props();

  const map = $derived(editor.map!);
  const combat = $derived(map.combat);
  const fighters = $derived(map.tokens.filter(isFighter));
  const order = $derived(initiativeOrder(fighters));
  const waiting = $derived(fighters.filter((t) => t.initiative == null && (t.kind === 'character' || !t.hidden)));
  let busy = $state(false);

  async function rollVisible() {
    busy = true;
    try {
      editor.setInitiatives(await rollMonsterInitiatives(map.tokens.filter((t) => !t.hidden), campaignDir));
    } finally {
      busy = false;
    }
  }

  const setIni = (id: string, raw: string) =>
    editor.setInitiatives({ [id]: raw.trim() === '' ? null : Math.round(Number(raw)) });
</script>

<PanelSection title={combat.round ? `Kampf · Runde ${combat.round}` : 'Initiative'}>
  {#snippet actions()}
    <button disabled={busy} title="Initiative für alle sichtbaren Monster ohne Wert würfeln (W20 + GES)" onclick={rollVisible}>🎲</button>
  {/snippet}

  {#if combat.round}
    <div class="turns">
      <button title="Vorheriger Zug" onclick={() => editor.nextTurn(-1)}>◀</button>
      <button class="primary" onclick={() => editor.nextTurn(1)}>Nächster Zug ▶</button>
    </div>
    <button class="end" onclick={() => editor.endCombat()}>Kampf beenden</button>
  {:else}
    <button class="primary start" disabled={!order.length} onclick={() => editor.startCombat()}>Kampf beginnen</button>
  {/if}

  {#each [...order, ...waiting] as t (t.id)}
    <div class="row" class:turn={t.id === combat.turn} class:down={t.hp === 0} class:hidden={t.hidden}>
      <input
        type="number"
        aria-label="Initiative von {t.name}"
        value={t.initiative ?? ''}
        placeholder="–"
        onchange={(e) => setIni(t.id, e.currentTarget.value)}
      />
      <button class="name" onclick={() => (editor.selectedId = t.id)}>{t.name}</button>
      {#each t.effects as e (e)}<img class="cond" src={badgeIconUrl(e)} alt={TOKEN_EFFECTS[e]} use:pinnableTip={badgeTip(e)} />{/each}
      {#each t.conditions as c (c)}<img class="cond" src={badgeIconUrl(c)} alt={CONDITIONS[c]} use:pinnableTip={badgeTip(c)} />{/each}
      {#if t.hp != null && t.hpMax}<span class="hp" class:bloodied={isBloodied(t)}>{t.hp}/{t.hpMax}</span>{/if}
    </div>
    {#if t.id === combat.turn && t.effects.includes('burning')}
      <div class="reminder" use:pinnableTip={badgeTip('burning')}>
        <img src={badgeIconUrl('burning')} alt="" />
        <span>Brand zu Zugbeginn</span>
        <button title="Feuerschaden würfeln (1W4)" onclick={(e) => rollNow('1W4', e.ctrlKey || e.metaKey)}>🎲 1W4 Feuer</button>
        <button title="Brand entfernen" onclick={() => editor.toggleEffect(t.id, 'burning')}>gelöscht</button>
      </div>
    {/if}
  {:else}
    <p class="hint">Noch keine Charaktere oder Monster auf der Karte.</p>
  {/each}
</PanelSection>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.1rem 0.25rem;
    border-radius: 4px;
    border-left: 3px solid transparent;
  }
  .row.turn {
    background: var(--surface);
    border-left-color: #2a9fd6;
  }
  .row.down .name {
    text-decoration: line-through;
    color: var(--ink-muted);
  }
  .row.hidden .name {
    font-style: italic;
    color: var(--ink-muted);
  }
  input {
    width: 2.6rem;
    padding: 0.1rem 0.2rem;
    font-size: 0.8rem;
  }
  button {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.2rem 0.4rem;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    color: var(--ink);
  }
  .name:hover {
    color: var(--red);
  }
  .cond {
    width: 1.1rem;
    height: 1.1rem;
    cursor: help;
  }
  .reminder {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    margin: 0 0 0.2rem 0.6rem;
    padding: 0.2rem 0.35rem;
    font-size: 0.75rem;
    color: #7a2a06;
    background: #f6dcc4;
    border-left: 3px solid #c2410c;
    border-radius: 4px;
  }
  .reminder img {
    width: 1rem;
    height: 1rem;
  }
  .reminder span {
    flex: 1 0 70%;
  }
  .reminder button {
    padding: 0.05rem 0.35rem;
    white-space: nowrap;
    font-size: 0.7rem;
  }
  .hp.bloodied {
    color: var(--danger);
    font-weight: 700;
  }
  .hp {
    font-size: 0.7rem;
    color: var(--ink-muted);
  }
  .turns {
    display: flex;
    gap: 0.3rem;
  }
  .turns .primary {
    flex: 1;
  }
  .primary {
    background: var(--red);
    border-color: var(--red);
    color: var(--on-accent);
  }
  .primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .end {
    font-size: 0.75rem;
    margin-bottom: 0.3rem;
  }
  .start {
    margin-bottom: 0.3rem;
  }
  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
</style>
