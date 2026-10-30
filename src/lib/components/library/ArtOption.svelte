<script lang="ts">
  import { installing, installProgress, type Library } from '../../stores/libraries';
  import InstallProgressBar from './InstallProgressBar.svelte';
  import { kib, needsAppUpdate, stateLabel, stateTone } from './libraryLabels';

  let {
    art,
    // Ohne Fallback: Svelte verbietet `bind:` von `undefined` auf eine Prop mit Fallback, und eine
    // erst nach dem Öffnen im Index aufgetauchte Library hat noch keinen Eintrag in `selected`.
    checked = $bindable(),
    disabled,
    title,
  }: { art: Library; checked?: boolean; disabled: boolean; title?: string } = $props();
</script>

<div class="art">
  <label class="art-row" {title}>
    <input type="checkbox" bind:checked {disabled} />
    <span class="art-name">mit Bildern</span>
    <span class="art-meta">{art.fileCount} Dateien · {kib(art.size)}</span>
    <span class="state {stateTone(art)}">
      {stateTone(art) === 'ok' ? '✓ ' : ''}{stateLabel(art)}
    </span>
  </label>

  {#if $installing.has(art.id)}
    <InstallProgressBar progress={$installProgress[art.id]} />
  {/if}

  {#if needsAppUpdate(art)}
    <p class="hint">
      Die Bilder setzen Version {art.minVersion} oder neuer voraus — bitte die App aktualisieren.
    </p>
  {/if}
</div>

<style>
  .art {
    margin-left: 1.35rem; padding-top: 0.35rem;
    border-top: 1px dotted var(--border);
    display: flex; flex-direction: column; gap: 0.3rem;
  }
  .art-row { display: flex; align-items: center; gap: 0.45rem; cursor: pointer; font-size: 0.78rem; }
  .art-row:has(input:disabled) { cursor: not-allowed; opacity: 0.6; }
  .art-row input { accent-color: var(--red); cursor: inherit; margin: 0; }
  .art-name { color: var(--ink-soft); }
  .art-meta { font-size: 0.7rem; color: var(--ink-muted); }
  .state {
    margin-left: auto; flex-shrink: 0; white-space: nowrap;
    font-size: 0.65rem; font-weight: 600;
    padding: 0.03rem 0.4rem; border-radius: 999px; border: 1px solid currentColor;
  }
  .state.ok { color: var(--bg); background: var(--green); border-color: var(--green); }
  .state.pending { color: var(--gold, #c89b3c); }
  .state.missing { color: var(--ink-muted); }
  .state.blocked { color: var(--danger); }
  .hint { margin: 0; font-size: 0.7rem; color: var(--danger); }
</style>
