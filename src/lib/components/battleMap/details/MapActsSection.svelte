<script lang="ts">
  /** Zu welchen Akten die Karte gehört — bestimmt, welche Encounter die Übersicht anbietet. */
  import type { MapEditor } from '../../../services/battleMap/mapEditor.svelte';
  import { actSummaries } from '../../../stores/context';

  let { editor }: { editor: MapEditor } = $props();

  const map = $derived(editor.map!);

  function toggle(act: string) {
    const on = !map.acts.includes(act);
    if (!on && map.acts.length === 1) return;
    editor.checkpoint();
    map.acts = on ? [...map.acts, act] : map.acts.filter((a) => a !== act);
    editor.changed();
  }
</script>

<section>
  <h3>Akte</h3>
  <div class="chips">
    {#each $actSummaries as a (a.name)}
      {@const on = map.acts.includes(a.name)}
      {@const last = on && map.acts.length === 1}
      <button class:on aria-pressed={on} disabled={last} title={last ? 'Eine Karte gehört zu mindestens einem Akt' : undefined} onclick={() => toggle(a.name)}>
        {a.title || a.name}
      </button>
    {/each}
  </div>
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.75rem 1rem 0;
  }
  h3 {
    margin: 0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  button {
    background: none;
    border: 1px dashed var(--border);
    border-radius: 999px;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.78rem;
    padding: 0.15rem 0.6rem;
  }
  button.on {
    border-style: solid;
    border-color: var(--red);
    color: var(--ink);
    background: color-mix(in srgb, var(--red) 10%, transparent);
  }
  button:disabled {
    cursor: default;
  }
</style>
