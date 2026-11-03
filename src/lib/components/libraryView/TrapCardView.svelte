<script lang="ts">
  import { TRAP_SEVERITIES, type Trap } from '$lib/schemas/trap';
  import { sourceLabel } from '$lib/services/sourceRegistry';
  import { checkDe, damageDe, saveDe } from '$lib/services/trapFormat';
  import { availableArt } from '$lib/artUrl';
  import { trapArtUrl } from '$lib/libraryArt';
  import CardArt from '../ui/CardArt.svelte';
  import LibraryCardFrame from '../ui/LibraryCardFrame.svelte';
  import Markdown from '../Markdown.svelte';

  let { trap }: { trap: Trap } = $props();

  const desc = $derived(trap.descDe || trap.desc);
  const trigger = $derived(trap.triggerDe || trap.trigger);

  let artNames = $state<Set<string>>(new Set());
  void availableArt().then((names) => (artNames = names));
</script>

<LibraryCardFrame accent="var(--danger)" name={trap.name} nameDe={trap.nameDe}>
  {#snippet art()}<CardArt src={trapArtUrl(trap.key, artNames)} color="var(--danger)" />{/snippet}
  {#snippet head()}
    <div class="badges">
      <span class="tag">{TRAP_SEVERITIES[trap.severity]}{trap.levels ? ` · Stufe ${trap.levels}` : ''}</span>
      <span class="tag">{sourceLabel(trap.source)}</span>
    </div>
  {/snippet}
  <dl class="stats">
    {#if trigger}<dt>Auslöser</dt><dd>{trigger}</dd>{/if}
    {#if trap.save}<dt>Rettungswurf</dt><dd>{saveDe(trap.save)}</dd>{/if}
    {#if trap.damage.length}<dt>Schaden</dt><dd>{damageDe(trap.damage)}</dd>{/if}
    {#if trap.detect.length}<dt>Entdecken</dt><dd>{trap.detect.map(checkDe).join(' · ')}</dd>{/if}
    {#if trap.disarm.length}<dt>Entschärfen</dt><dd>{trap.disarm.map(checkDe).join(' · ')}</dd>{/if}
  </dl>
  {#if desc}
    <div class="body"><Markdown source={desc} /></div>
  {/if}
  {#if trap.tiers.length}
    <table class="tiers">
      <thead><tr><th>Stufe</th><th>SG</th><th>Schaden</th></tr></thead>
      <tbody>
        <tr><td>{trap.levels}</td><td>{trap.save?.dc ?? '–'}</td><td>{damageDe(trap.damage) || '–'}</td></tr>
        {#each trap.tiers as t (t.levels)}
          <tr>
            <td>{t.levels}</td>
            <td>{t.saveDc ?? trap.save?.dc ?? '–'}</td>
            <td>{damageDe(t.damage) || '–'}{#if t.noteDe || t.note}<span class="note">&nbsp;· {t.noteDe || t.note}</span>{/if}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</LibraryCardFrame>

<style>
  .badges {
    display: flex; flex-wrap: wrap; gap: 0.35rem; justify-content: center; margin-top: 0.35rem;
  }
  .tag {
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger) 45%, var(--bg));
    border-radius: 3px; padding: 0.05rem 0.4rem;
  }
  .stats {
    display: grid; grid-template-columns: auto 1fr; gap: 0.2rem 0.7rem;
    margin: 0; padding: 0.7rem 1.2rem 0; font-size: 0.85rem;
  }
  dt { font-weight: 700; color: var(--danger); }
  dd { margin: 0; }
  .body { padding: 0.5rem 1.2rem 0.6rem; font-size: 0.85rem; line-height: 1.55; }
  .tiers { margin: 0 1.2rem 1rem; width: calc(100% - 2.4rem); border-collapse: collapse; font-size: 0.8rem; }
  .tiers th { text-align: left; color: var(--ink-muted); font-weight: 600; border-bottom: 1px solid var(--border); }
  .tiers td { padding: 0.15rem 0.4rem 0.15rem 0; border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent); }
  .note { color: var(--ink-muted); }
</style>
