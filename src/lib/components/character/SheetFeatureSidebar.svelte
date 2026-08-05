<script lang="ts">
  import type { Character } from '../../schemas/characterSchema';
  import type { Change } from '../../schemas/levelUp';
  import type { ApplyContext } from '../../services/applyChanges';
  import type { CoverageBadge } from '../../services/declarationCoverage';
  import type { FeaturePanelLayout } from '../../utils/featurePanelLayout.svelte';
  import CharacterFeaturePanel from '../CharacterFeaturePanel.svelte';

  let {
    feats, dirPath, draft, saved, applyContext, onApplyChanges,
    badge = $bindable(null), openCount = $bindable(0),
  }: {
    feats: FeaturePanelLayout;
    dirPath: string;
    draft: Character | null;
    saved: Character | null;
    applyContext: ApplyContext;
    onApplyChanges(changes: Change[]): void;
    badge?: CoverageBadge | null;
    openCount?: number;
  } = $props();
</script>

<div
  class="resize-handle"
  class:hidden={feats.collapsed}
  role="separator"
  aria-label="Merkmals-Leiste verbreitern"
  onmousedown={feats.startResize}
></div>

<!-- Zugeklappt bleibt die Leiste MONTIERT (Breite 0) — sonst stünde der Zähler an
     der Lasche auf 0, sobald man sie zuklappt. -->
<div class="feat-wrap" class:no-transition={feats.dragging} style="width: {feats.width}px">
  <!-- Neuaufbau beim CHARAKTERwechsel, nicht bei jedem Draft-Swap: sonst meldete ein
       Wahl-Platz der alten Auflösung gegen das neue Ledger „1 offene Entscheidung". -->
  {#key dirPath}
    {#if draft}
      <CharacterFeaturePanel character={draft} {saved} {applyContext} {onApplyChanges}
        bind:badge bind:openCount />
    {/if}
  {/key}
</div>

<button
  class="feat-toggle"
  class:no-transition={feats.dragging}
  style="right: {feats.width}px"
  onclick={feats.toggle}
  title={badge?.title || (feats.collapsed ? 'Merkmals-Leiste öffnen' : 'Merkmals-Leiste schließen')}
  aria-label={feats.collapsed ? 'Merkmals-Leiste öffnen' : 'Merkmals-Leiste schließen'}
>
  <span class="ft-arrow">{feats.collapsed ? '☰' : '›'}</span>
  {#if openCount}<span class="ft-count">{openCount}</span>{/if}
</button>

<style>
  .feat-wrap {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    transition: width 0.2s ease;
  }
  .feat-wrap.no-transition { transition: none; }

  .resize-handle {
    width: 4px;
    flex-shrink: 0;
    background: var(--surface);
    cursor: col-resize;
    transition: background 0.15s;
    position: relative;
    z-index: 10;
  }
  .resize-handle:hover,
  .resize-handle:active { background: var(--red); }
  .resize-handle.hidden { display: none; }

  /* Nicht auf halber Höhe: bei zugeklapptem KI-Panel säße die Lasche sonst
     genau unter dessen Lasche. */
  .feat-toggle {
    position: absolute;
    top: 25%;
    z-index: 20;
    width: 24px;
    min-height: 80px;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    padding: 0.4rem 0;
    background: var(--bg-panel);
    color: var(--ink-muted);
    border: 1px solid var(--surface);
    border-right: none;
    border-radius: 8px 0 0 8px;
    cursor: pointer;
    font-size: 1.05rem;
    line-height: 1;
    box-shadow: -2px 0 6px rgba(0, 0, 0, 0.15);
    transition: right 0.2s ease, color 0.1s, background 0.1s;
  }
  .feat-toggle.no-transition { transition: color 0.1s, background 0.1s; }
  .feat-toggle:hover { color: var(--arcane); background: var(--surface); }
  .ft-arrow { line-height: 1; }
  .ft-count {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--gold);
    border: 1px solid color-mix(in srgb, var(--gold) 45%, var(--bg));
    border-radius: 999px;
    padding: 0.05rem 0.25rem;
    line-height: 1.2;
  }
</style>
