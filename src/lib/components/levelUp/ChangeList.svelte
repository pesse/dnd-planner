<script lang="ts">
  /**
   * „Was sich ändert" neben dem Aufstieg: je Schritt die Änderungen, Merkmale, Talente und
   * Zauber als Verweis mit Tooltip. Der Klick landet in der Vorschau des Assistenten.
   */
  import { featDesc, featDisplayName } from '$lib/featsLibrary';
  import { navigateTo } from '$lib/services/navigation';
  import type { Change } from '$lib/schemas/levelUp';
  import { textTip } from '../textTip.svelte';
  import Markdown from '../Markdown.svelte';
  import Modal from '../ui/Modal.svelte';
  import type { LevelUpAssistantUi, NewFeature } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);

  let shownFeature = $state<NewFeature | null>(null);

  const featureOf = (key: string) => ui.newFeatures.find((f) => f.key === key || f.id === key);
  const featOf = (key: string) => st.featLib.find((f) => f.sourceKey === key);

  /** Das Label trägt den Namen am Ende — davor steht der Zusatz („Zaubertrick: "). */
  const prefixOf = (label: string, name: string) => (label.endsWith(name) ? label.slice(0, -name.length) : `${label} · `);

  const spellLink = (c: Extract<Change, { target: 'cantrip' | 'preparedSpell' }>) =>
    `${prefixOf(c.label, c.name)}[${c.name}](spell:${c.key})`;
</script>

{#snippet line(c: Change)}
  {#if c.target === 'featureGained' && featureOf(c.sourceKey || c.name)}
    {@const f = featureOf(c.sourceKey || c.name)!}
    <div class="fact">• {prefixOf(c.label, f.name)}<button type="button" class="ref" use:textTip={f.text} onclick={() => (shownFeature = f)}>{f.name}</button></div>
  {:else if c.target === 'feat' && featOf(c.sourceKey)?.path}
    {@const feat = featOf(c.sourceKey)!}
    <div class="fact">• {prefixOf(c.label, c.name)}<button type="button" class="ref" use:textTip={featDesc(feat)}
      onclick={() => navigateTo({ name: featDisplayName(feat), path: feat.path!, type: 'feat' })}>{c.name}</button></div>
  {:else if (c.target === 'cantrip' || c.target === 'preparedSpell') && c.key}
    <div class="fact">• <Markdown inline source={spellLink(c)} /></div>
  {:else}
    <div class="fact">• {ui.changeLine(c)}</div>
  {/if}
{/snippet}

<div class="facts">
  <h3>Was sich ändert</h3>
  {#each ui.progressionGroups as g}
    <div class="group">
      <div class="heading">{g.heading}</div>
      {#each g.changes as c}{@render line(c)}{/each}
    </div>
  {:else}
    <p class="hint">Noch keine Änderungen.</p>
  {/each}
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
</div>

{#if shownFeature}
  <Modal title={shownFeature.name} draggable={false} width="min(640px, 94vw)" maxHeight="86vh" onclose={() => (shownFeature = null)}>
    <div class="feature-text"><Markdown source={shownFeature.text} /></div>
  </Modal>
{/if}

<style>
  h3 { margin: 0; font-size: 0.95rem; font-family: var(--font-display, inherit); }
  .group { display: flex; flex-direction: column; gap: 0.15rem; }
  .heading { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }
  .ref {
    background: none; border: none; padding: 0; font: inherit; color: var(--arcane, var(--gold)); cursor: pointer;
    text-decoration: underline dotted; text-underline-offset: 2px;
  }
  .feature-text { font-size: 0.85rem; line-height: 1.55; }
</style>
