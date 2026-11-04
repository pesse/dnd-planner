<script lang="ts">
  /** Die Handouts der Kampagne, jedes mit einem Klick im Spielerfenster gezeigt oder wieder weggenommen. */
  import { hideHandout, isShownImage, playerHandout, setHandoutText, showHandout } from '../../../services/handouts/playerHandout.svelte';
  import { loadCampaignHandouts, type CampaignHandout } from '../../../services/handouts/campaignHandouts';

  let { campaignDir }: { campaignDir: string } = $props();

  let handouts = $state<CampaignHandout[]>([]);

  $effect(() => {
    const dir = campaignDir;
    let live = true;
    void loadCampaignHandouts(dir).then((list) => { if (live) handouts = list; });
    return () => { live = false; };
  });

  const isShown = (h: CampaignHandout) => isShownImage(h.imageUrl);

  function toggle(h: CampaignHandout) {
    if (isShown(h)) hideHandout();
    else void showHandout({ name: h.name, imageUrl: h.imageUrl });
  }
</script>

{#if handouts.length}
  <section>
    <h3>Handouts</h3>
    {#each handouts as h (h.path)}
      {@const shown = isShown(h)}
      {@const textShown = shown && !!playerHandout.current?.text}
      <div class="handout" class:shown>
        {#if h.imageUrl}<img src={h.imageUrl} alt="" />{/if}
        <span class="name">{h.name}</span>
        {#if shown && h.text.trim()}
          <button class:on={textShown} title="Abschrift im Spielerfenster {textShown ? 'ausblenden' : 'einblenden'}" onclick={() => setHandoutText(textShown ? '' : h.text)}>Text</button>
        {/if}
        <button class:on={shown} disabled={!h.imageUrl} title={h.imageUrl ? '' : 'Das Handout hat noch kein Bild'} onclick={() => toggle(h)}>
          {shown ? 'Ausblenden' : 'Zeigen'}
        </button>
      </div>
    {/each}
  </section>
{/if}

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0 1rem 0.75rem;
  }
  h3 {
    margin: 0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
  }
  .handout {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.4rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .handout.shown {
    border-color: var(--red);
  }
  img {
    width: 2.2rem;
    height: 2.2rem;
    object-fit: cover;
    border-radius: 3px;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-display);
  }
  button {
    padding: 0.15rem 0.5rem;
    font-size: 0.75rem;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
  }
  button.on {
    background: var(--red);
    border-color: var(--red);
    color: #fff;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
