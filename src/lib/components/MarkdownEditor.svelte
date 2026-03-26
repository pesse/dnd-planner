<script lang="ts">
  import { fileContent } from '../stores/campaign';

  let value = $state('');

  fileContent.subscribe((v) => (value = v));

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    fileContent.set(target.value);
  }
</script>

<div class="editor-container">
  <textarea
    class="editor"
    {value}
    oninput={handleInput}
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
