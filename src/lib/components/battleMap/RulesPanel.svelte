<script lang="ts">
  /** Regelglossar im Spiel-Tab: durchsuchbar, der Regeltext steht im Tooltip. */
  import { getRules, ruleDisplayName, ruleText, type RuleInfo } from '../../rulesLibrary';
  import { RULE_CATEGORIES, RULE_CATEGORY_DE, type RuleCategory } from '../../schemas/rule';
  import { ruleTipMarkdown } from '../ruleRefLinks.svelte';
  import { pinnableTip } from './tips/pinnableTip';
  import PanelSection from './PanelSection.svelte';

  let rules = $state<RuleInfo[]>([]);
  let query = $state('');
  let category = $state<RuleCategory | ''>('');

  let failed = $state(false);

  getRules().then(
    (all) => (rules = [...all].sort((a, b) => ruleDisplayName(a).localeCompare(ruleDisplayName(b), 'de'))),
    () => (failed = true),
  );

  const categories = $derived(RULE_CATEGORIES.filter((c) => rules.some((r) => r.category === c)));

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const inCategory = rules.filter((r) => !category || r.category === category);
    if (!q) return inCategory;
    const names = (r: RuleInfo) => `${r.nameDe ?? ''} ${r.name}`.toLowerCase();
    const starts = (r: RuleInfo) => names(r).split(' ').some((w) => w.startsWith(q));
    const byName = inCategory.filter((r) => names(r).includes(q)).sort((a, b) => Number(starts(b)) - Number(starts(a)));
    const byText = inCategory.filter((r) => !byName.includes(r) && ruleText(r).toLowerCase().includes(q));
    return [...byName, ...byText];
  });
</script>

<PanelSection title="Regeln">
  <input type="search" placeholder="Regel suchen …" bind:value={query} />
  <div class="cats">
    <button class:on={!category} onclick={() => (category = '')}>Alle</button>
    {#each categories as c (c)}
      <button class:on={category === c} onclick={() => (category = category === c ? '' : c)}>{RULE_CATEGORY_DE[c]}</button>
    {/each}
  </div>
  <ul>
    {#each shown as r (r.key)}
      <li use:pinnableTip={ruleTipMarkdown(r)}>{ruleDisplayName(r)}</li>
    {:else}
      <li class="none">{rules.length ? 'Nichts gefunden.' : failed ? 'Regeln nicht lesbar.' : 'Lade …'}</li>
    {/each}
  </ul>
</PanelSection>

<style>
  input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.25rem 0.45rem;
    font-size: 0.8rem;
  }
  .cats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
    margin: 0.35rem 0;
  }
  .cats button {
    padding: 0.05rem 0.45rem;
    font-size: 0.7rem;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .cats button.on {
    background: #5a1e6e;
    border-color: #5a1e6e;
    color: #fff;
  }
  ul {
    max-height: 16rem;
    overflow-y: auto;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    padding: 0.15rem 0.3rem;
    font-size: 0.82rem;
    border-radius: 3px;
    cursor: help;
  }
  li:hover {
    background: var(--surface);
  }
  .none {
    color: var(--ink-muted);
    font-style: italic;
    cursor: default;
  }
</style>
