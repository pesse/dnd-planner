<script lang="ts">
  import type { MonsterAction } from '../../types';
  import './monsterEditForm.css';

  let {
    items = $bindable<MonsterAction[]>(),
    heading,
    placeholder,
    addLabel,
    onchange,
  }: {
    items: MonsterAction[];
    heading?: string;
    placeholder: string;
    addLabel: string;
    onchange: () => void;
  } = $props();

  function add() { items.push({ name: 'Neue Aktion', description: '' }); onchange(); }
  function remove(i: number) { items.splice(i, 1); onchange(); }
</script>

{#if heading}<h3 class="section-title">{heading}</h3>{/if}
<div class="ability-list">
  {#each items as item, i}
    <div class="ability-block">
      <div class="ability-hdr">
        <input class="ef ability-name" bind:value={item.name} oninput={onchange} placeholder={placeholder} />
        <button class="del-btn" onclick={() => remove(i)}>×</button>
      </div>
      <textarea class="ef ability-desc" bind:value={item.description} oninput={onchange} rows="2"></textarea>
    </div>
  {/each}
  <button class="add-btn" onclick={add}>+ {addLabel}</button>
</div>
