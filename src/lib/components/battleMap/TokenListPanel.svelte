<script lang="ts">
  /** Alle Tokens der Karte: auswählen, für Spieler zeigen oder verstecken, entfernen. */
  import type { MapEditor } from '../../services/battleMap/mapEditor.svelte';
  import PanelSection from './PanelSection.svelte';
  import EyeIcon from '../ui/EyeIcon.svelte';
  import TokenKindIcon from './TokenKindIcon.svelte';

  let { editor }: { editor: MapEditor } = $props();

  const map = $derived(editor.map!);
</script>

<PanelSection title="Tokens ({map.tokens.length})">
  {#snippet actions()}
    <button title="Alle Monster verstecken" onclick={() => editor.setAllHidden('monster', true)}><EyeIcon closed /></button>
    <button title="Alle Monster zeigen" onclick={() => editor.setAllHidden('monster', false)}><EyeIcon /></button>
  {/snippet}
  {#if !map.tokens.length}
    <p class="hint">Noch keine Tokens.</p>
  {/if}
  <ul>
    {#each map.tokens as t (t.id)}
      <li class:selected={t.id === editor.selectedId}>
        <button class="eye" title={t.hidden ? 'Für Spieler versteckt — zeigen' : 'Für Spieler sichtbar — verstecken'} onclick={() => editor.toggleHidden(t.id)}>
          <EyeIcon closed={t.hidden} />
        </button>
        <button class="name" class:muted={t.hidden} onclick={() => (editor.selectedId = t.id)}><TokenKindIcon kind={t.kind} /><span>{t.name}</span></button>
        <button class="del" title="Entfernen" onclick={() => editor.removeToken(t.id)}>✕</button>
      </li>
    {/each}
  </ul>
</PanelSection>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 16rem;
    overflow-y: auto;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    border-radius: 4px;
  }
  li.selected {
    background: var(--surface);
  }
  button {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.2rem 0.5rem;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  li button {
    border: none;
    background: none;
  }
  .eye {
    padding-right: 0.2rem;
  }
  .name {
    padding-left: 0.2rem;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    text-align: left;
  }
  .name span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name.muted {
    color: var(--ink-muted);
    font-style: italic;
  }
  .del {
    color: var(--danger);
  }
  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
</style>
