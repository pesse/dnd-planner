<script lang="ts">
  import type { Snippet } from 'svelte';

  let { heading, children }: { heading: string; children: Snippet } = $props();
</script>

<h3 class="heading">{heading}</h3>
<div class="options" role="radiogroup" aria-label={heading}>{@render children()}</div>

<style>
  .heading {
    font-family: var(--font-display); font-size: 0.95rem; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--gold); text-align: center; margin: 0.9rem 0 0.45rem; padding-bottom: 0.55rem;
    background: url('/branding/wizard/divider.png') center bottom / 100% 0.7rem no-repeat;
  }
  .options { display: flex; flex-direction: column; gap: 0.3rem; }
</style>
