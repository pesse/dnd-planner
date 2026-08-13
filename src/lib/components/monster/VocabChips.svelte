<script lang="ts" generics="K extends string">
  import './monsterEditForm.css';

  let {
    label,
    options,
    selected = $bindable<K[]>(),
    onchange,
  }: {
    label: string;
    options: Record<K, string>;
    selected: K[];
    onchange: () => void;
  } = $props();

  const remaining = $derived(
    (Object.entries(options) as [K, string][]).filter(([key]) => !selected.includes(key)),
  );

  function add(key: string) {
    if (!key) return;
    selected = [...selected, key as K];
    onchange();
  }

  function remove(key: K) {
    selected = selected.filter((k) => k !== key);
    onchange();
  }
</script>

<div class="prop">
  <span class="lbl">{label}</span>
  <div class="chips">
    {#each selected as key}
      <span class="chip">
        {options[key] ?? key}
        <button class="kv-del" onclick={() => remove(key)}>×</button>
      </span>
    {/each}
    {#if remaining.length}
      <select
        class="ef add-sel"
        value=""
        onchange={(e) => { add(e.currentTarget.value); e.currentTarget.value = ''; }}
      >
        <option value="">+</option>
        {#each remaining as [key, optionLabel]}
          <option value={key}>{optionLabel}</option>
        {/each}
      </select>
    {/if}
  </div>
</div>

<style>
  .chips { display: flex; flex-wrap: wrap; gap: 0.2rem; align-items: center; }

  .chip {
    display: flex;
    align-items: center;
    gap: 0.1rem;
    font-size: 0.82rem;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0 0.1rem 0 0.35rem;
  }

  .add-sel {
    font-size: 0.82rem;
    background: var(--bg-panel);
    cursor: pointer;
    width: 2.2rem;
  }
</style>
