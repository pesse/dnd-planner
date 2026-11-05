<script lang="ts" module>
  import type { Token } from '../../schemas/battleMap';

  export const KIND_LABEL: Record<Token['kind'], string> = { character: 'Charakter', monster: 'Monster', marker: 'Markierung', trap: 'Falle', light: 'Licht' };
</script>

<script lang="ts">
  /** Linien-Icon in Textfarbe für die Art eines Tokens. */
  let { kind }: { kind: Token['kind'] } = $props();
</script>

<span class="kind-icon" role="img" aria-label={KIND_LABEL[kind]} title={KIND_LABEL[kind]}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  {#if kind === 'character'}
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
  {:else if kind === 'monster'}
    <path d="M5 3l2.5 5M19 3l-2.5 5" />
    <path d="M4 12c0-3.3 3.6-5 8-5s8 1.7 8 5c0 4.4-3.6 9-8 9s-8-4.6-8-9Z" />
    <path d="M9 12h.01M15 12h.01" stroke-width="3" />
    <path d="M9 17l1.5-1.5L12 17l1.5-1.5L15 17" />
  {:else if kind === 'light'}
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
  {:else if kind === 'trap'}
    <path d="M12 3 2 20h20L12 3Z" />
    <path d="M12 10v4M12 17h.01" />
  {:else}
    <path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11Z" />
    <circle cx="12" cy="10" r="2" />
  {/if}
</svg></span>

<style>
  .kind-icon {
    flex: none;
    display: inline-flex;
    color: var(--ink-muted);
  }
  svg {
    width: 1em;
    height: 1em;
  }
</style>
