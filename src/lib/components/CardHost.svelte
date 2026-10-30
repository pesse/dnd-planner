<script lang="ts">
  import { activeFile } from '../stores/campaign';
  import { deleteActiveEntry } from '../services/deleteEntry';
  import { CARD_REGISTRY, type CardType } from './cardRegistry';
  import FileTitle from './FileTitle.svelte';
  import './toolbar.css';

  let { type }: { type: CardType } = $props();

  let spec = $derived(CARD_REGISTRY[type]);
  let name = $derived(spec.stripExt ? ($activeFile?.name ?? '').replace(spec.stripExt, '') : ($activeFile?.name ?? ''));
  let title = $derived(`${spec.icon} ${name}`);
</script>

<div class="toolbar">
  {#if $activeFile}
    <FileTitle label={title} titleClass="{type}-title" renamable={spec.renamable} />
    <div class="toolbar-sep"></div>
    <button class="delete-entry" onclick={() => deleteActiveEntry(name)}>🗑 Löschen</button>
  {/if}
</div>

{#if spec}
  {@const Card = spec.component}
  <Card />
{/if}
