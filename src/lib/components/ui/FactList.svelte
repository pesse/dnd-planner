<script lang="ts">
  import type { Snippet } from 'svelte';
  import { featDisplayName, type FeatEntry } from '$lib/featsLibrary';
  import { navigateTo } from '$lib/services/navigation';
  import { featEntry } from '$lib/services/vaultLinks';
  import { createHoverTip } from '$lib/utils/hoverTip.svelte';
  import { textTip } from '../textTip.svelte';
  import FeatTooltip from '../FeatTooltip.svelte';
  import Markdown from '../Markdown.svelte';
  import Modal from './Modal.svelte';
  import type { Fact, FactGroup } from './factList';

  let { title, groups, emptyText = '', children }: {
    title: string;
    groups: FactGroup[];
    emptyText?: string;
    children?: Snippet;
  } = $props();

  let shownFeature = $state<{ name: string; text: string } | null>(null);
  const featTip = createHoverTip<FeatEntry>();

  function openFeat(feat: FeatEntry) {
    featTip.hide();
    if (feat.path) void navigateTo(featEntry({ path: feat.path }));
  }
</script>

{#snippet line(f: Fact)}
  {#if f.kind === 'feature'}
    <div class="fact">• {f.prefix ?? ''}<button type="button" class="ref" use:textTip={f.text} onclick={() => (shownFeature = f)}>{f.name}</button>{#if f.choice}: {f.choice}{/if}{#if f.pinned}<span class="pinned" title="Wird im Ausdruck als Volltext angehängt"> 📌</span>{/if}</div>
  {:else if f.kind === 'feat'}
    <div class="fact">• {f.prefix ?? ''}<button type="button" class="ref" onclick={() => openFeat(f.feat)}
      onmouseenter={(e) => featTip.show(e, f.feat)} onmousemove={featTip.move} onmouseleave={featTip.hide}
    >{f.name || featDisplayName(f.feat)}</button></div>
  {:else if f.kind === 'spell'}
    <div class="fact">• <Markdown inline source={`${f.prefix ?? ''}[${f.name}](spell:${f.key})`} /></div>
  {:else}
    <div class="fact">• {f.text}</div>
  {/if}
{/snippet}

<div class="facts">
  <h3>{title}</h3>
  {#each groups as g}
    <div class="group">
      <div class="heading">{g.heading}</div>
      {#each g.facts as f}{@render line(f)}{/each}
    </div>
  {:else}
    {#if emptyText}<p class="hint">{emptyText}</p>{/if}
  {/each}
  {@render children?.()}
</div>

<FeatTooltip feat={featTip.data} x={featTip.x} y={featTip.y} />

{#if shownFeature}
  <Modal title={shownFeature.name} draggable={false} width="min(640px, 94vw)" maxHeight="86vh" onclose={() => (shownFeature = null)}>
    <div class="feature-text"><Markdown source={shownFeature.text} /></div>
  </Modal>
{/if}

<style>
  .facts { display: flex; flex-direction: column; gap: 0.5rem; }
  h3 { margin: 0; font-size: 0.95rem; font-family: var(--font-display, inherit); }
  .group { display: flex; flex-direction: column; gap: 0.15rem; }
  .heading { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }
  .fact { font-size: 0.76rem; color: var(--ink-soft); }
  .hint { font-size: 0.82rem; color: var(--ink-soft); margin: 0; }
  .ref {
    background: none; border: none; padding: 0; font: inherit; color: var(--arcane, var(--gold)); cursor: pointer;
    text-decoration: underline dotted; text-underline-offset: 2px;
  }
  .pinned { font-size: 0.72rem; }
  .feature-text { font-size: 0.85rem; line-height: 1.55; }
</style>
