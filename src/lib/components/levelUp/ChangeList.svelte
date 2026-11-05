<script lang="ts">
  /** „Was sich ändert" neben dem Aufstieg: je Schritt die Änderungen, Merkmale, Talente und Zauber als Verweis. */
  import type { Change } from '$lib/schemas/levelUp';
  import FactList from '../ui/FactList.svelte';
  import type { Fact, FactGroup } from '../ui/factList';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);

  const featureOf = (key: string) => ui.newFeatures.find((f) => f.key === key || f.id === key);
  const featOf = (key: string) => st.featLib.find((f) => f.sourceKey === key);

  /** Das Label trägt den Namen am Ende — davor steht der Zusatz („Zaubertrick: "). */
  const prefixOf = (label: string, name: string) => (label.endsWith(name) ? label.slice(0, -name.length) : `${label} · `);

  function factOf(c: Change): Fact {
    if (c.target === 'featureGained') {
      const f = featureOf(c.sourceKey || c.name);
      if (f) return { kind: 'feature', prefix: prefixOf(c.label, f.name), name: f.name, text: f.text, pinned: c.pinned };
    }
    if (c.target === 'feat') {
      const feat = featOf(c.sourceKey);
      if (feat?.path) return { kind: 'feat', prefix: prefixOf(c.label, c.name), feat, name: c.name };
    }
    if ((c.target === 'cantrip' || c.target === 'preparedSpell') && c.key)
      return { kind: 'spell', prefix: prefixOf(c.label, c.name), name: c.name, key: c.key };
    return { kind: 'text', text: ui.changeLine(c) };
  }

  const groups = $derived<FactGroup[]>(ui.progressionGroups.map((g) => ({ heading: g.heading, facts: g.changes.map(factOf) })));
</script>

<FactList title="Was sich ändert" {groups} emptyText="Noch keine Änderungen.">
  {#if st.flagged.length}
    <div class="flagged">
      <p class="warn">Nicht in der Bibliothek gefunden</p>
      {#each st.flagged as f}
        <div class="flagged-line">⚠ {f}
          <button type="button" class="link-btn" onclick={() => ui.openSpellCreator(f, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], null)}>anlegen</button>
        </div>
      {/each}
    </div>
  {/if}
</FactList>
