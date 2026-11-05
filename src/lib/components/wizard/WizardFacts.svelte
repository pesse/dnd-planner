<script lang="ts">
  import type { Character } from '../../schemas/characterSchema';
  import { previewFacts } from '../../services/wizard/previewFacts';
  import FactList from '../ui/FactList.svelte';
  import type { FactGroup } from '../ui/factList';

  let { character }: { character: Character | null } = $props();

  let groups = $state<FactGroup[]>([]);
  $effect(() => {
    const c = character;
    if (!c) { groups = []; return; }
    let cancelled = false;
    void previewFacts(c).then((g) => { if (!cancelled) groups = g; }, () => {});
    return () => { cancelled = true; };
  });
</script>

{#if character}
  <FactList title="Was du mitbringst" {groups} />
{/if}
