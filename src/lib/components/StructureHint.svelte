<script lang="ts">
  import { derived } from 'svelte/store';
  import { activeFile, fileContent, replaceContent } from '../stores/campaign';
  import { validateTemplate, fixTemplate } from '../utils/templateValidation';

  const validation = derived([activeFile, fileContent], ([$activeFile, $fileContent]) =>
    validateTemplate($activeFile?.type, $fileContent)
  );

  function applyFix() {
    const type = $activeFile?.type;
    const fixed = fixTemplate(type, $fileContent);
    if (fixed !== $fileContent) replaceContent(fixed);
  }
</script>

{#if $validation && !$validation.valid}
  <div class="structure-hint">
    <span class="hint-icon">⚠</span>
    <span class="hint-label">Fehlende Sektionen:</span>
    <span class="hint-sections">
      {#each $validation.missing as section, i}
        <code>## {section}</code>{#if i < $validation.missing.length - 1}<span class="sep"> · </span>{/if}
      {/each}
    </span>
    <button class="hint-fix" onclick={applyFix}>Ergänzen</button>
  </div>
{/if}

<style>
  .structure-hint {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 1rem;
    background: #2a2a1a;
    border-bottom: 1px solid #45452a;
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .hint-icon {
    color: #f9e2af;
    flex-shrink: 0;
  }

  .hint-label {
    color: #6c7086;
    flex-shrink: 0;
  }

  .hint-sections {
    display: flex;
    align-items: center;
    gap: 0.1rem;
    flex-wrap: wrap;
  }

  code {
    background: #313244;
    color: #f9e2af;
    border-radius: 3px;
    padding: 0.05rem 0.3rem;
    font-size: 0.7rem;
    font-family: monospace;
  }

  .sep {
    color: #45475a;
  }

  .hint-fix {
    margin-left: auto;
    background: #f9e2af;
    color: #1e1e2e;
    border: none;
    border-radius: 4px;
    padding: 0.2rem 0.6rem;
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
  }

  .hint-fix:hover {
    background: #fae3b0;
  }
</style>
