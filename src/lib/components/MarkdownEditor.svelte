<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { fileContent, activeFile, undoContent, redoContent, historyState } from '../stores/campaign';

  let value = $state('');
  let saveStatus = $state<'saved' | 'saving' | 'unsaved'>('saved');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  fileContent.subscribe((v) => (value = v));

  async function save(content: string) {
    const file = $activeFile;
    if (!file?.path || file.type === 'character') return;
    try {
      saveStatus = 'saving';
      await invoke('write_file_content', { path: file.path, content });
      saveStatus = 'saved';
    } catch {
      saveStatus = 'unsaved';
    }
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    const newValue = target.value;
    fileContent.set(newValue);
    saveStatus = 'unsaved';
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => save(newValue), 800);
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (debounceTimer) clearTimeout(debounceTimer);
      save(value);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
      if ($historyState.canUndo) { e.preventDefault(); undoContent(); }
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      if ($historyState.canRedo) { e.preventDefault(); redoContent(); }
    }
  }
</script>

<div class="editor-container">
  <div class="editor-statusbar">
    <span class="save-status" class:unsaved={saveStatus === 'unsaved'} class:saving={saveStatus === 'saving'}>
      {saveStatus === 'saving' ? 'Speichert…' : saveStatus === 'unsaved' ? '● Ungespeichert' : ''}
    </span>
  </div>
  <textarea
    class="editor"
    {value}
    oninput={handleInput}
    onkeydown={handleKeydown}
    placeholder="Markdown hier eingeben..."
    spellcheck="false"
  ></textarea>
</div>

<style>
  .editor-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .editor-statusbar {
    display: flex;
    align-items: center;
    padding: 0.15rem 0.75rem;
    background: #181825;
    border-bottom: 1px solid #1e1e2e;
    flex-shrink: 0;
    min-height: 20px;
  }

  .save-status {
    font-size: 0.68rem;
    color: transparent;
    margin-left: auto;
  }

  .save-status.unsaved { color: #f38ba8; }
  .save-status.saving  { color: #6c7086; }

  .editor {
    flex: 1;
    width: 100%;
    padding: 1.5rem;
    background: #1e1e2e;
    color: #cdd6f4;
    border: none;
    outline: none;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.95rem;
    line-height: 1.7;
    resize: none;
    box-sizing: border-box;
  }
</style>
