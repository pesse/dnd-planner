<script lang="ts">
  /** Im Spielerfenster: Zustände und Effekte des angetippten Charakters umschalten. */
  import { CONDITIONS, CONDITION_KEYS } from '../../schemas/vocabulary';
  import { TOKEN_EFFECTS, TOKEN_EFFECT_KEYS, type Token } from '../../schemas/battleMap';
  import { badgeIconUrl, type Badge } from '../../conditionIcon';

  let {
    name,
    active,
    left,
    top,
    ontoggle,
    onclose,
  }: {
    name: string;
    active: Pick<Token, 'conditions' | 'effects'>;
    left: number;
    top: number;
    ontoggle: (b: Badge) => void;
    onclose: () => void;
  } = $props();

  const groups: { title: string; items: { key: Badge; label: string }[] }[] = [
    { title: 'Effekte', items: TOKEN_EFFECT_KEYS.map((k) => ({ key: k, label: TOKEN_EFFECTS[k] })) },
    { title: 'Zustände', items: CONDITION_KEYS.map((k) => ({ key: k, label: CONDITIONS[k] })) },
  ];
  const isOn = (b: Badge) => (active.effects as string[]).includes(b) || (active.conditions as string[]).includes(b);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div
  class="menu"
  style:left="{left}px"
  style:top="{top}px"
  role="dialog"
  aria-label="Zustände von {name}"
  tabindex="-1"
  onpointerdown={(e) => e.stopPropagation()}
  ondblclick={(e) => e.stopPropagation()}
>
  <header>
    <strong>{name}</strong>
    <button class="close" aria-label="Schließen" onclick={onclose}>✕</button>
  </header>
  {#each groups as g (g.title)}
    <p class="group">{g.title}</p>
    <div class="grid">
      {#each g.items as it (it.key)}
        <button class={it.key} class:on={isOn(it.key)} aria-pressed={isOn(it.key)} onclick={() => ontoggle(it.key)}>
          <img src={badgeIconUrl(it.key)} alt="" />{it.label}
        </button>
      {/each}
    </div>
  {/each}
</div>

<style>
  .menu {
    position: absolute;
    z-index: 20;
    box-sizing: border-box;
    width: 448px;
    max-width: calc(100vw - 1rem);
    padding: 0.6rem 0.7rem 0.75rem;
    color: #3b2a18;
    background: #f3e6c8;
    border: 1px solid #b08a4a;
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
    font-family: system-ui, sans-serif;
    cursor: default;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .close {
    padding: 0.1rem 0.4rem;
    background: none;
    border: none;
    font-size: 1rem;
  }
  .group {
    margin: 0.5rem 0 0.25rem;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #7a6446;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.3rem;
  }
  button {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.4rem;
    font-size: 0.85rem;
    color: inherit;
    background: #fbf4e2;
    border: 1px solid #d4bd8f;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
  }
  button img {
    width: 1.4rem;
    height: 1.4rem;
    margin-left: -0.15rem;
  }
  button.on {
    color: #fff;
    background: #5a1e6e;
    border-color: #5a1e6e;
  }
  button.on.burning {
    background: #9a3b0c;
    border-color: #9a3b0c;
  }
  button.on.concentration {
    background: #17736b;
    border-color: #17736b;
  }
</style>
