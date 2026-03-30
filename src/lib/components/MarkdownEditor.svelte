<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import { Markdown } from 'tiptap-markdown';
  import { invoke } from '@tauri-apps/api/core';
  import { fileContent, activeFile, historyState, undoContent, redoContent } from '../stores/campaign';
  import { parseFrontmatter } from '../utils/frontmatter';

  // DOM-Ref für TipTap (kein $state nötig, bind:this reicht)
  let editorEl: HTMLElement | null = null;
  let editor: Editor | null = null;

  let saveStatus = $state<'saved' | 'saving' | 'unsaved'>('saved');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let showSource = $state(false);
  let sourceValue = $state('');

  // Reaktiver Zähler: incrementiert bei jedem TipTap-Event → Button-States neu auswerten
  let tick = $state(0);

  // Frontmatter wird aus dem TipTap-Inhalt herausgehalten und separat gespeichert,
  // damit es beim Speichern wieder vorangestellt wird.
  let rawFrontmatterBlock = ''; // der "---...---\n"-Block (leer wenn kein Frontmatter)
  let lastBody = '';             // letzter Körper (ohne Frontmatter) im Editor

  function splitFull(content: string): { block: string; body: string } {
    const { rawBlock, body } = parseFrontmatter(content);
    return { block: rawBlock, body };
  }

  function toFull(body: string): string {
    return rawFrontmatterBlock ? rawFrontmatterBlock + body : body;
  }

  // Button-Aktiv-States (abhängig von tick)
  let isBold       = $derived(tick >= 0 && (editor?.isActive('bold') ?? false));
  let isItalic     = $derived(tick >= 0 && (editor?.isActive('italic') ?? false));
  let isStrike     = $derived(tick >= 0 && (editor?.isActive('strike') ?? false));
  let isH1         = $derived(tick >= 0 && (editor?.isActive('heading', { level: 1 }) ?? false));
  let isH2         = $derived(tick >= 0 && (editor?.isActive('heading', { level: 2 }) ?? false));
  let isH3         = $derived(tick >= 0 && (editor?.isActive('heading', { level: 3 }) ?? false));
  let isBullet     = $derived(tick >= 0 && (editor?.isActive('bulletList') ?? false));
  let isOrdered    = $derived(tick >= 0 && (editor?.isActive('orderedList') ?? false));
  let isBlockquote = $derived(tick >= 0 && (editor?.isActive('blockquote') ?? false));
  let isCode       = $derived(tick >= 0 && (editor?.isActive('code') ?? false));
  let isCodeBlock  = $derived(tick >= 0 && (editor?.isActive('codeBlock') ?? false));

  onMount(() => {
    const { block, body } = splitFull($fileContent);
    rawFrontmatterBlock = block;
    lastBody = body;

    const ed = new Editor({
      element: editorEl!,
      extensions: [
        StarterKit,
        Markdown.configure({ html: false, transformPastedText: true }),
      ],
      content: body,
      editorProps: {
        attributes: { spellcheck: 'false' },
        handleKeyDown: (_view, e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (debounceTimer) clearTimeout(debounceTimer);
            save(toFull(lastBody));
            return true;
          }
          if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z' && $historyState.canUndo) {
            e.preventDefault(); undoContent(); return true;
          }
          if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z')) && $historyState.canRedo) {
            e.preventDefault(); redoContent(); return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: ed }) => {
        const body = ed.storage.markdown.getMarkdown();
        if (body === lastBody) return;
        lastBody = body;
        const full = toFull(body);
        fileContent.set(full);
        saveStatus = 'unsaved';
        scheduleAutoSave(full);
      },
      onSelectionUpdate: () => { tick++; },
      onTransaction:    () => { tick++; },
    });

    editor = ed;

    // Externe Änderungen (Undo/Redo, LLM-Panel) in den Editor übernehmen.
    const unsubscribe = fileContent.subscribe((content) => {
      const { block, body } = splitFull(content);
      if (body === lastBody && block === rawFrontmatterBlock) return;
      rawFrontmatterBlock = block;
      lastBody = body;
      ed.commands.setContent(body, /* emitUpdate */ false);
      if (showSource) sourceValue = content;
      tick++;
    });

    return () => {
      unsubscribe();
      ed.destroy();
      editor = null;
    };
  });

  const MARKDOWN_TYPES = new Set(['campaign', 'act', 'session', 'npc', 'world', 'notes']);

  async function save(content: string) {
    const file = $activeFile;
    if (!file?.path || !MARKDOWN_TYPES.has(file.type)) return;
    try {
      saveStatus = 'saving';
      await invoke('write_file_content', { path: file.path, content });
      saveStatus = 'saved';
    } catch {
      saveStatus = 'unsaved';
    }
  }

  function scheduleAutoSave(content: string) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => save(content), 800);
  }

  onDestroy(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
  });

  // ── Quelle-Toggle ──────────────────────────────────────────────────────────

  function toggleSource() {
    if (!showSource) {
      // Quellansicht zeigt den vollen Inhalt inkl. Frontmatter
      sourceValue = toFull(editor ? editor.storage.markdown.getMarkdown() : lastBody);
    } else {
      if (editor) {
        // Aus Quelltext: Frontmatter neu extrahieren, Körper in TipTap laden
        const { block, body } = splitFull(sourceValue);
        rawFrontmatterBlock = block;
        lastBody = body;
        const full = toFull(body);
        editor.commands.setContent(body);
        fileContent.set(full);
        saveStatus = 'unsaved';
        scheduleAutoSave(full);
      }
      requestAnimationFrame(() => editor?.commands.focus());
    }
    showSource = !showSource;
  }

  function handleSourceInput(e: Event) {
    sourceValue = (e.currentTarget as HTMLTextAreaElement).value;
    // Sofort in fileContent schreiben (Frontmatter bleibt im sourceValue)
    const { block, body } = splitFull(sourceValue);
    rawFrontmatterBlock = block;
    lastBody = body;
    fileContent.set(sourceValue);
    saveStatus = 'unsaved';
    scheduleAutoSave(sourceValue);
  }

  function handleSourceKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (debounceTimer) clearTimeout(debounceTimer);
      save(sourceValue);
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z' && $historyState.canUndo) {
      e.preventDefault(); undoContent();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z')) && $historyState.canRedo) {
      e.preventDefault(); redoContent();
    }
  }
</script>

<div class="md-editor">
  <!-- Toolbar -->
  <div class="toolbar">
    {#if !showSource}
      <button class="tb" class:on={isBold}       onclick={() => editor?.chain().focus().toggleBold().run()}           title="Fett (Strg+B)"><b>B</b></button>
      <button class="tb" class:on={isItalic}     onclick={() => editor?.chain().focus().toggleItalic().run()}         title="Kursiv (Strg+I)"><em>I</em></button>
      <button class="tb" class:on={isStrike}     onclick={() => editor?.chain().focus().toggleStrike().run()}         title="Durchgestrichen"><s>S</s></button>
      <div class="tb-sep"></div>
      <button class="tb" class:on={isH1}         onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} title="H1">H1</button>
      <button class="tb" class:on={isH2}         onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="H2">H2</button>
      <button class="tb" class:on={isH3}         onclick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} title="H3">H3</button>
      <div class="tb-sep"></div>
      <button class="tb" class:on={isBullet}     onclick={() => editor?.chain().focus().toggleBulletList().run()}     title="Liste">•</button>
      <button class="tb mono" class:on={isOrdered}   onclick={() => editor?.chain().focus().toggleOrderedList().run()}   title="Numm. Liste">1.</button>
      <div class="tb-sep"></div>
      <button class="tb" class:on={isBlockquote} onclick={() => editor?.chain().focus().toggleBlockquote().run()}     title="Zitat">❝</button>
      <button class="tb mono" class:on={isCode}      onclick={() => editor?.chain().focus().toggleCode().run()}           title="Inline-Code">`</button>
      <button class="tb mono" class:on={isCodeBlock} onclick={() => editor?.chain().focus().toggleCodeBlock().run()}      title="Code-Block">```</button>
    {/if}

    <div class="tb-flex"></div>

    <span class="save-indicator" class:unsaved={saveStatus === 'unsaved'} class:saving={saveStatus === 'saving'}>
      {saveStatus === 'saving' ? 'Speichert…' : saveStatus === 'unsaved' ? '●' : ''}
    </span>
    <button class="source-btn" class:active={showSource} onclick={toggleSource}>Quelle</button>
  </div>

  <!-- TipTap-Editor (immer im DOM, bei Quelle versteckt) -->
  <div bind:this={editorEl} class="editor-mount" class:hidden={showSource}></div>

  <!-- Quelltext-Editor -->
  {#if showSource}
    <textarea
      class="source-ta"
      value={sourceValue}
      oninput={handleSourceInput}
      onkeydown={handleSourceKeydown}
      spellcheck="false"
    ></textarea>
  {/if}
</div>

<style>
  .md-editor {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    background: #1e1e2e;
  }

  /* ── Toolbar ── */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.05rem;
    padding: 0.3rem 0.75rem;
    background: #181825;
    border-bottom: 1px solid #313244;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .tb {
    background: transparent;
    border: none;
    color: #6c7086;
    cursor: pointer;
    font-size: 0.82rem;
    padding: 0.25rem 0.4rem;
    border-radius: 3px;
    min-width: 1.8rem;
    text-align: center;
    line-height: 1;
    transition: color 0.1s, background 0.1s;
  }
  .tb:hover { color: #cdd6f4; background: #313244; }
  .tb.on    { color: #89b4fa; background: color-mix(in srgb, #89b4fa 12%, transparent); }
  .tb.mono  { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.74rem; }

  .tb-sep  { width: 1px; height: 1rem; background: #313244; margin: 0 0.2rem; flex-shrink: 0; }
  .tb-flex { flex: 1; }

  .save-indicator {
    font-size: 0.7rem;
    color: transparent;
    margin-right: 0.3rem;
    white-space: nowrap;
  }
  .save-indicator.unsaved { color: #f38ba8; }
  .save-indicator.saving  { color: #6c7086; }

  .source-btn {
    background: transparent;
    border: 1px solid #313244;
    border-radius: 4px;
    color: #6c7086;
    font-size: 0.75rem;
    padding: 0.2rem 0.55rem;
    cursor: pointer;
    transition: all 0.1s;
  }
  .source-btn:hover  { border-color: #6c7086; color: #cdd6f4; }
  .source-btn.active { border-color: #89b4fa; color: #89b4fa; background: color-mix(in srgb, #89b4fa 10%, transparent); }

  /* ── TipTap-Mount ── */
  .editor-mount {
    flex: 1;
    overflow-y: auto;
    cursor: text;
  }
  .editor-mount.hidden { display: none; }

  /* ProseMirror-Inhalt */
  .md-editor :global(.ProseMirror) {
    min-height: 100%;
    padding: 1.5rem 2rem;
    outline: none;
    color: #cdd6f4;
    line-height: 1.8;
    font-family: Inter, system-ui, sans-serif;
    font-size: 0.95rem;
  }

  .md-editor :global(.ProseMirror h1) { color: #cba6f7; font-size: 1.8rem; margin: 0.5rem 0; }
  .md-editor :global(.ProseMirror h2) { color: #89b4fa; font-size: 1.4rem; margin: 1.5rem 0 0.4rem; }
  .md-editor :global(.ProseMirror h3) { color: #94e2d5; font-size: 1.1rem; margin: 1rem 0 0.3rem; }
  .md-editor :global(.ProseMirror h4),
  .md-editor :global(.ProseMirror h5),
  .md-editor :global(.ProseMirror h6) { color: #a6e3a1; margin: 0.8rem 0 0.2rem; }
  .md-editor :global(.ProseMirror p)  { margin: 0 0 0.9rem; }
  .md-editor :global(.ProseMirror strong) { color: #f38ba8; font-weight: 700; }
  .md-editor :global(.ProseMirror em)    { color: #cba6f7; font-style: italic; }
  .md-editor :global(.ProseMirror s)     { color: #6c7086; }
  .md-editor :global(.ProseMirror ul),
  .md-editor :global(.ProseMirror ol)   { padding-left: 1.5rem; margin: 0 0 0.9rem; }
  .md-editor :global(.ProseMirror li)   { margin-bottom: 0.2rem; }
  .md-editor :global(.ProseMirror blockquote) {
    border-left: 3px solid #45475a;
    margin: 0 0 0.9rem;
    padding: 0.3rem 0 0.3rem 1rem;
    color: #a6adc8;
    font-style: italic;
  }
  .md-editor :global(.ProseMirror code) {
    background: #313244;
    padding: 0.1em 0.4em;
    border-radius: 4px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.88em;
    color: #a6e3a1;
  }
  .md-editor :global(.ProseMirror pre) {
    background: #313244;
    border-radius: 6px;
    padding: 1rem;
    overflow-x: auto;
    margin: 0 0 0.9rem;
  }
  .md-editor :global(.ProseMirror pre code) { background: none; padding: 0; }
  .md-editor :global(.ProseMirror hr)  { border: none; border-top: 1px solid #313244; margin: 1.5rem 0; }

  /* Cursor-Linie beim Tippen */
  .md-editor :global(.ProseMirror .is-empty::before) {
    content: attr(data-placeholder);
    color: #45475a;
    pointer-events: none;
    float: left;
    height: 0;
  }

  /* ── Quelltext-Textarea ── */
  .source-ta {
    flex: 1;
    padding: 1.5rem;
    background: #1e1e2e;
    color: #cdd6f4;
    border: none;
    outline: none;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.9rem;
    line-height: 1.7;
    resize: none;
    width: 100%;
    box-sizing: border-box;
  }
</style>
