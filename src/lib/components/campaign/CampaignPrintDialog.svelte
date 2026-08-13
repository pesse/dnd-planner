<script lang="ts">
  /**
   * Wahl der Kampagnenteile plus Vorschau. Gedruckt wird derselbe String, der rechts im
   * Iframe steht — der Katalog liegt in `print/campaign/sections.ts`.
   */
  import { printHtmlDocument } from '../../utils/printFrame';
  import { loadCampaignPrintData, type CampaignPrintData } from '../../print/campaign/data';
  import { buildCampaignHtml } from '../../print/campaign/document';
  import { campaignSections, defaultSelection } from '../../print/campaign/sections';
  import Modal from '../ui/Modal.svelte';
  import PrintPreview from '../print/PrintPreview.svelte';

  let { campaignPath, campaignName, onclose }: {
    campaignPath: string;
    campaignName: string;
    onclose: () => void;
  } = $props();

  let data = $state<CampaignPrintData | null>(null);
  let error = $state('');
  let selection = $state<Record<string, boolean>>({});
  let zoom = $state(0.6);

  void (async () => {
    try {
      const loaded = await loadCampaignPrintData(campaignPath, campaignName);
      selection = defaultSelection(campaignSections(loaded));
      data = loaded;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  })();

  const sections = $derived(data ? campaignSections(data) : []);
  const html = $derived(data ? buildCampaignHtml(data, selection) : '');

  const setAll = (on: boolean) => {
    for (const s of sections) selection[s.id] = on;
  };
</script>

<Modal
  title="🖨 Kampagne drucken — {campaignName}"
  label="Kampagne drucken"
  draggable={false}
  width="min(1180px, 96vw)"
  maxHeight="92vh"
  {onclose}
>
  <div class="print-body">
    <aside class="picker">
      {#if error}
        <p class="error">{error}</p>
      {:else if !data}
        <p class="hint">Lade Kampagne…</p>
      {:else if sections.length === 0}
        <p class="hint">Nichts zu drucken.</p>
      {:else}
        <div class="group-head">
          <span class="group-title">Teile</span>
          <button class="link" onclick={() => setAll(!sections.every((s) => selection[s.id]))}>
            {sections.every((s) => selection[s.id]) ? 'keine' : 'alle'}
          </button>
        </div>
        {#each sections as section}
          <label class="opt">
            <input type="checkbox" bind:checked={selection[section.id]} />
            <span>{section.label}</span>
          </label>
        {/each}
      {/if}
    </aside>

    <PrintPreview {html} {zoom} margin={{ x: 20, y: 20 }} />
  </div>

  <div class="print-bar">
    <label class="zoom">
      Zoom
      <input type="range" min="0.3" max="1.2" step="0.05" bind:value={zoom} />
      <span class="zoom-val">{Math.round(zoom * 100)}%</span>
    </label>
    <button class="primary" disabled={!data} onclick={() => printHtmlDocument(html, `${campaignName} – Kampagne`)}>
      Drucken / Als PDF speichern
    </button>
  </div>
</Modal>

<style>
  .print-body {
    display: flex;
    gap: 0.9rem;
    min-height: 0;
    flex: 1;
  }

  .picker {
    width: 15rem;
    flex: none;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .group-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    border-bottom: 1px solid var(--surface);
    padding-bottom: 0.2rem;
    margin-bottom: 0.3rem;
  }

  .group-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-muted);
  }

  .link {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-size: 0.75rem;
    color: var(--arcane);
    cursor: pointer;
  }

  .opt {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.12rem 0;
    cursor: pointer;
  }

  .hint { color: var(--ink-muted); }
  .error { color: var(--danger); }

  .print-bar {
    display: flex;
    align-items: center;
    gap: 1rem;
    border-top: 1px solid var(--surface);
    padding-top: 0.7rem;
  }

  .zoom {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
  .zoom-val { min-width: 2.8rem; }

  .primary {
    margin-left: auto;
    background: var(--arcane);
    color: var(--bg);
    border: none;
    border-radius: 4px;
    padding: 0.45rem 0.9rem;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .primary:disabled { opacity: 0.5; cursor: default; }
</style>
