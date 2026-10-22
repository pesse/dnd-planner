<script lang="ts">
  import { isMirroredArt, resolveOriginArt } from '../../services/wizard/originArt';
  import { fitText } from '../../utils/fitText';

  interface Tag { label: string; easy?: boolean }

  let { title, subtitle = '', tags = [], selected, art: candidates = [], icon = false, onselect }: {
    title: string; subtitle?: string; tags?: Tag[]; selected: boolean; art?: string[];
    /** Freigestelltes Bibliotheksbild statt eines Figurenausschnitts. */
    icon?: boolean;
    onselect: () => void;
  } = $props();

  let art = $state<string | null>(null);
  $effect(() => {
    const list = candidates;
    let cancelled = false;
    void resolveOriginArt(list).then((url) => { if (!cancelled) art = url; });
    return () => { cancelled = true; };
  });
</script>

<button type="button" role="radio" aria-checked={selected} class="option" class:sel={selected} onclick={onselect}>
  <span class="portrait" class:icon aria-hidden="true">
    {#if art}<img src={art} alt="" class:mirrored={isMirroredArt(art)} />{:else}<span class="initial">{title.slice(0, 1)}</span>{/if}
  </span>
  <span class="text">
    <span class="title" use:fitText={{ text: title }}>{title}</span>
    {#if subtitle}<span class="sub">{subtitle}</span>{/if}
    {#if tags.length}
      <span class="tags">{#each tags as tag, i}{#if i}<span class="dot">◆</span>{/if}<span class:easy={tag.easy}>{tag.label}</span>{/each}</span>
    {/if}
  </span>
  <span class="gem" aria-hidden="true"></span>
</button>

<style>
  .option {
    display: grid; grid-template-columns: 2.6rem minmax(0, 1fr) 1.7rem; align-items: center; gap: 0.6rem;
    width: 100%; text-align: left; font: inherit; color: var(--ink); cursor: pointer;
    padding: 0.25rem 0.5rem 0.25rem 0.3rem; border-radius: 6px;
    border: 1px solid var(--border);
    background: linear-gradient(100deg, var(--bg-raised, var(--bg)) 0%, var(--surface) 140%);
    transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.2s ease;
  }
  .option:hover { transform: translateX(3px); border-color: var(--border-strong); box-shadow: 0 2px 10px -4px rgba(60, 35, 5, 0.35); }
  .option:focus-visible { outline: 2px solid var(--arcane); outline-offset: 2px; }
  .option.sel {
    border-color: var(--gold);
    background: linear-gradient(100deg, color-mix(in srgb, var(--arcane) 10%, var(--bg)) 0%, var(--surface) 140%);
    box-shadow: inset 0 0 0 1px var(--gold), 0 3px 14px -6px color-mix(in srgb, var(--arcane) 70%, transparent);
  }

  .portrait {
    width: 2.6rem; height: 3.1rem; overflow: hidden; display: grid; place-items: center;
    border-radius: 1.3rem 1.3rem 4px 4px; border: 2px solid var(--border-strong);
    background: radial-gradient(circle at 50% 35%, var(--bg) 0%, var(--surface) 100%);
    transition: border-color 0.15s ease;
  }
  .sel .portrait { border-color: var(--gold); }
  .portrait img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 18%; transform: scale(1.8); transform-origin: 50% 22%; }
  .portrait img.mirrored { transform: scale(1.8) scaleX(-1); }
  .portrait.icon img { transform: none; object-fit: contain; padding: 3px; box-sizing: border-box; }
  .initial { font-family: var(--font-display); font-size: 1.3rem; color: var(--ink-muted); }

  .text { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .title { font-family: var(--font-display); font-weight: 700; font-size: 0.92rem; letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; }
  .sel .title { color: var(--arcane); }
  .sub, .tags { font-size: 0.74rem; color: var(--ink-soft); line-height: 1.3; }
  .tags { display: flex; flex-wrap: wrap; gap: 0 0.3rem; color: var(--ink-muted); }
  .dot { font-size: 0.5rem; align-self: center; color: var(--gold); }
  .easy { color: var(--green, var(--ink)); font-weight: 600; }

  .gem {
    width: 1.7rem; height: 1.7rem; background: url('/branding/wizard/gem-off.png') center / contain no-repeat;
    transition: transform 0.2s ease, filter 0.2s ease;
  }
  .option:hover .gem { filter: brightness(1.12); }
  .sel .gem { background-image: url('/branding/wizard/gem-on.png'); animation: gem-pop 0.35s ease-out; filter: drop-shadow(0 0 5px color-mix(in srgb, var(--arcane) 65%, transparent)); }
  @keyframes gem-pop { 0% { transform: scale(0.6); } 60% { transform: scale(1.18); } 100% { transform: scale(1); } }
</style>
