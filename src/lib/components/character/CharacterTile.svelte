<script lang="ts">
  /** Kachel mit rundem Porträt, Name und Kurzinfo — für Auswahldialoge über Charaktere. */
  let { name, meta = '', portrait = '', disabled = false, title = '', onclick }: {
    name: string;
    meta?: string;
    portrait?: string;
    disabled?: boolean;
    title?: string;
    onclick: () => void;
  } = $props();
</script>

<button class="tile" {disabled} {title} {onclick}>
  {#if portrait}
    <img src={portrait} alt="" />
  {:else}
    <span class="placeholder">{name.slice(0, 1)}</span>
  {/if}
  <span class="name">{name}</span>
  {#if meta}<span class="meta">{meta}</span>{/if}
</button>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 0.7rem;
    text-align: center;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--ink);
    cursor: pointer;
  }
  .tile:hover:not(:disabled) {
    border-color: var(--red);
  }
  .tile:disabled {
    cursor: default;
    opacity: 0.55;
  }
  img,
  .placeholder {
    width: 84px;
    height: 84px;
    border-radius: 50%;
    object-fit: cover;
  }
  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-deep);
    font-size: 2rem;
  }
  .name {
    font-weight: 600;
  }
  .meta {
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
</style>
