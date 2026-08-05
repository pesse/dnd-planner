<script lang="ts">
  import type { SaveStatus } from '../../utils/autosaveFile.svelte';
  import RichTextEditor from '../RichTextEditor.svelte';

  let { value, onChange, status, hint, placeholder }: {
    value: string;
    onChange(md: string): void;
    status: SaveStatus;
    hint: string;
    placeholder: string;
  } = $props();
</script>

<div class="freetext-area">
  <div class="freetext-hint">
    <span>{hint}</span>
    <span class="freetext-status" class:unsaved={status === 'unsaved'} class:saving={status === 'saving'}>
      {status === 'saving' ? 'Speichert…' : status === 'unsaved' ? '● ungespeichert' : 'Gespeichert'}
    </span>
  </div>
  <RichTextEditor {value} {onChange} {placeholder} />
</div>

<style>
  .freetext-area {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: calc(100% - 80px);
  }
  .freetext-hint {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.4rem 1.5rem;
    border-bottom: 1px solid var(--surface);
    font-size: 0.75rem;
    color: var(--ink-muted);
  }
  .freetext-status { color: var(--ink-muted); white-space: nowrap; }
  .freetext-status.unsaved { color: var(--danger); }
  .freetext-status.saving  { color: var(--ink-soft); }
</style>
