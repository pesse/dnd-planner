<script lang="ts">
  import type { Npc } from '../../schemas/npc';
  import './npcCard.css';

  let { npc }: { npc: Npc } = $props();

  function tagsString(tags: string[]): string { return tags.join(', '); }
  function parseTags(s: string): string[] {
    return s.split(',').map((t) => t.trim()).filter(Boolean);
  }
</script>

<div class="two-col">
  <div class="section">
    <h3>Beschreibung</h3>
    {#each [{ key: 'appearance', label: 'Aussehen' }, { key: 'personality', label: 'Persönlichkeit' }] as field}
      <div class="npc-field">
        <label>{field.label}</label>
        <textarea
          value={npc[field.key as keyof Npc] as string}
          oninput={(e) => { (npc as unknown as Record<string, unknown>)[field.key] = (e.currentTarget as HTMLTextAreaElement).value; }}
          rows="2" placeholder="—"
        ></textarea>
      </div>
    {/each}
  </div>
  <div class="section">
    <h3>Hintergrund</h3>
    {#each [{ key: 'motivation', label: 'Motivation' }, { key: 'notes', label: 'Notizen' }] as field}
      <div class="npc-field">
        <label>{field.label}</label>
        <textarea
          value={npc[field.key as keyof Npc] as string}
          oninput={(e) => { (npc as unknown as Record<string, unknown>)[field.key] = (e.currentTarget as HTMLTextAreaElement).value; }}
          rows="2" placeholder="—"
        ></textarea>
      </div>
    {/each}
  </div>
</div>

<div class="section secret-section">
  <h3>Geheimnis</h3>
  <textarea class="secret-ta" bind:value={npc.secret} rows="2" placeholder="—"></textarea>
</div>

<div class="section">
  <h3>Tags</h3>
  <input
    class="tags-input"
    value={tagsString(npc.tags)}
    oninput={(e) => { npc.tags = parseTags((e.currentTarget as HTMLInputElement).value); }}
    placeholder="kommagetrennt"
  />
</div>

<style>
  .npc-field { display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.35rem; }

  .npc-field label {
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--ink-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .npc-field textarea {
    background: var(--bg-panel);
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink);
    font-size: 0.85rem;
    line-height: 1.5;
    padding: 0.3rem 0.5rem;
    outline: none;
    resize: vertical;
    font-family: inherit;
  }
  .npc-field textarea:focus { border-color: var(--red); }

  .secret-ta {
    width: 100%;
    box-sizing: border-box;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink);
    font-size: 0.85rem;
    line-height: 1.5;
    padding: 0.3rem 0.5rem;
    outline: none;
    resize: vertical;
    font-family: inherit;
  }
  .secret-ta:focus { border-color: var(--danger); }

  .tags-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--bg-panel);
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink);
    font-size: 0.85rem;
    padding: 0.3rem 0.5rem;
    outline: none;
    font-family: inherit;
  }
  .tags-input:focus { border-color: var(--red); }
</style>
