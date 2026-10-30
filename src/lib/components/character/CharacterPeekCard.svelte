<script lang="ts">
  import { formatClassLevel, formatSpecies } from '../../schemas/classLevelText';
  import { ABILITY_ABBR_DE, ABILITY_KEYS } from '../../schemas/abilities';
  import { resolveCharacterPortrait } from '../../services/characterPortrait.svelte';
  import type { Character } from '../../schemas/characterSchema';

  let { character: c, dirPath }: { character: Character; dirPath: string } = $props();

  let portrait = $state('');
  $effect(() => {
    let live = true;
    portrait = '';
    void resolveCharacterPortrait(c, dirPath).then((url) => { if (live && url) portrait = url; });
    return () => { live = false; };
  });

  const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

  let origin = $derived([formatSpecies(c.species) || c.race, c.backgroundRef?.name || c.background].filter(Boolean).join(' · '));
  let stats = $derived([
    { label: 'TP', value: c.hpMax },
    { label: 'RK', value: c.ac },
    { label: 'Init.', value: c.initiative },
    { label: 'Bew.', value: c.speed },
  ].filter((s) => s.value));
</script>

<article class="peek-char">
  {#if portrait}<img class="portrait" src={portrait} alt="" />{/if}
  <div class="body">
    <h2>{c.name || 'Unbenannter Charakter'}</h2>
    <p class="classes">{formatClassLevel(c.classes) || c.classLevel}</p>
    {#if origin}<p class="sub">{origin}</p>{/if}
    {#if c.playerName}<p class="sub">Spieler: <strong>{c.playerName}</strong></p>{/if}

    {#if stats.length}
      <dl class="stats">
        {#each stats as s}<div><dt>{s.label}</dt><dd>{s.value}</dd></div>{/each}
      </dl>
    {/if}

    <dl class="abilities">
      {#each ABILITY_KEYS as k}
        <div>
          <dt>{ABILITY_ABBR_DE[k]}</dt>
          <dd>{c.abilities[k]}<span class="mod">{signed(c.mods[k])}</span></dd>
        </div>
      {/each}
    </dl>
  </div>
</article>

<style>
  .peek-char { display: flex; gap: 1rem; padding: 1rem; }
  .portrait {
    width: 160px;
    height: 200px;
    flex-shrink: 0;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid var(--gold);
    background: var(--bg-deep);
  }
  .body { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
  h2 { margin: 0; font-size: 1.35rem; color: var(--arcane); }
  .classes { margin: 0; color: var(--ink); font-weight: 600; }
  .sub { margin: 0; color: var(--ink-muted); font-size: 0.85rem; }
  .sub strong { color: var(--ink-soft); }

  dl { margin: 0.5rem 0 0; display: grid; gap: 0.35rem; }
  dl div {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.25rem 0.2rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface);
  }
  dt { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); }
  dd { margin: 0; font-weight: 600; color: var(--ink); }
  .stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .abilities { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .mod { margin-left: 0.2rem; font-size: 0.72rem; font-weight: 400; color: var(--ink-muted); }

  @media (max-width: 480px) {
    .peek-char { flex-direction: column; align-items: center; }
    .abilities { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
