<script lang="ts">
  import type { MonsterTrait } from '../../types';
  import './monsterEditForm.css';

  let {
    items = $bindable<MonsterTrait[]>(),
    heading,
    placeholder,
    addLabel,
    onchange,
  }: {
    items: MonsterTrait[];
    heading?: string;
    placeholder: string;
    addLabel: string;
    onchange: () => void;
  } = $props();

  function add() { items.push({ name: 'Neue Eigenschaft', name_en: '', desc: '', desc_en: '' }); onchange(); }
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
      <textarea class="ef ability-desc" bind:value={item.desc} oninput={onchange} rows="2"></textarea>
    </div>
  {/each}
  <button class="add-btn" onclick={add}>+ {addLabel}</button>
</div>
