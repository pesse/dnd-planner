<script lang="ts">
  import { activeFile } from '../stores/campaign';
  import { CARD_REGISTRY, type CardType } from './cardRegistry';
  import FileTitle from './FileTitle.svelte';
  import './toolbar.css';

  let { type }: { type: CardType } = $props();

  let spec = $derived(CARD_REGISTRY[type]);
  let title = $derived(
    `${spec.icon} ${spec.stripExt ? ($activeFile?.name ?? '').replace(spec.stripExt, '') : ($activeFile?.name ?? '')}`,
  );
</script>

<div class="toolbar">
  {#if $activeFile}
    <FileTitle label={title} titleClass="{type}-title" renamable={spec.renamable} />
  {/if}
</div>

{#if spec}
  {@const Card = spec.component}
  <Card />
{/if}
