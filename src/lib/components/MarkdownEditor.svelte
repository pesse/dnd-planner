<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import { Markdown } from 'tiptap-markdown';
  import { invoke } from '@tauri-apps/api/core';
  import { fileContent, activeFile, historyState, undoContent, redoContent } from '../stores/campaign';
  import { parseFrontmatter } from '../utils/frontmatter';
  import './editor.css';

  // DOM-Ref für TipTap (kein $state nötig, bind:this reicht)
  let editorEl: HTMLElement | null = null;
  let editor = $state<Editor | null>(null);

  // tiptap-markdown (v0.9) ist für TipTap v2 geschrieben; seine Storage-
  // Augmentation greift unter @tiptap/core v3 nicht. Schmaler typisierter
  // Zugriff statt verstreuter any-Casts.
  function markdownStorage(ed: Editor): { getMarkdown(): string } {
    return (ed.storage as unknown as { markdown: { getMarkdown(): string } }).markdown;
  }

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
        const body = markdownStorage(ed).getMarkdown();
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
      ed.commands.setContent(body, { emitUpdate: false });
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
      sourceValue = toFull(editor ? markdownStorage(editor).getMarkdown() : lastBody);
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

<div class="editor-shell">
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
