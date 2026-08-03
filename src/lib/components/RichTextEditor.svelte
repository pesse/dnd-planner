<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import { Markdown } from 'tiptap-markdown';
  import './editor.css';

  interface Props {
    /** Body, kein Frontmatter. */
    value: string;
    onChange?: (markdown: string) => void;
    placeholder?: string;
  }

  let { value = '', onChange, placeholder = 'Freitext …' }: Props = $props();

  let editorEl: HTMLElement | null = null;
  let editor = $state<Editor | null>(null);

  // tiptap-markdown (v0.9) ist für TipTap v2 geschrieben — typisierter Zugriff statt
  // verstreuter any-Casts (vgl. MarkdownEditor).
  function markdownStorage(ed: Editor): { getMarkdown(): string } {
    return (ed.storage as unknown as { markdown: { getMarkdown(): string } }).markdown;
  }

  let showSource = $state(false);
  let sourceValue = $state('');
  let lastEmitted = '';

  let tick = $state(0);

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

  function emit(md: string) {
    if (md === lastEmitted) return;
    lastEmitted = md;
    onChange?.(md);
  }

  onMount(() => {
    lastEmitted = value;
    const ed = new Editor({
      element: editorEl!,
      extensions: [
        StarterKit,
        Markdown.configure({ html: false, transformPastedText: true }),
      ],
      content: value,
      editorProps: {
        attributes: { spellcheck: 'false' },
      },
      onUpdate: ({ editor: ed }) => {
        const md = markdownStorage(ed).getMarkdown();
        emit(md);
      },
      onSelectionUpdate: () => { tick++; },
      onTransaction:    () => { tick++; },
    });
    editor = ed;

    return () => {
      ed.destroy();
      editor = null;
    };
  });

  onDestroy(() => {
    editor?.destroy();
    editor = null;
  });

  $effect(() => {
    const v = value;
    if (!editor) return;
    // Werte aus dem eigenen Emit nicht zurückschreiben: eine nicht-idempotente
    // Markdown-Serialisierung („&") liefe sonst endlos value → setContent → onUpdate.
    if (v === lastEmitted) return;
    const current = markdownStorage(editor).getMarkdown();
    if (v === current) return;
    lastEmitted = v;
    editor.commands.setContent(v, { emitUpdate: false });
    if (showSource) sourceValue = v;
    tick++;
  });

  function toggleSource() {
    if (!editor) return;
    if (!showSource) {
      sourceValue = markdownStorage(editor).getMarkdown();
    } else {
      editor.commands.setContent(sourceValue);
      emit(sourceValue);
      requestAnimationFrame(() => editor?.commands.focus());
    }
    showSource = !showSource;
  }

  function handleSourceInput(e: Event) {
    sourceValue = (e.currentTarget as HTMLTextAreaElement).value;
    emit(sourceValue);
  }
</script>

<div class="editor-shell">
  <div class="toolbar">
    {#if !showSource}
      <button class="tb" class:on={isBold}       onclick={() => editor?.chain().focus().toggleBold().run()}                title="Fett (Strg+B)"><b>B</b></button>
      <button class="tb" class:on={isItalic}     onclick={() => editor?.chain().focus().toggleItalic().run()}              title="Kursiv (Strg+I)"><em>I</em></button>
      <button class="tb" class:on={isStrike}     onclick={() => editor?.chain().focus().toggleStrike().run()}              title="Durchgestrichen"><s>S</s></button>
      <div class="tb-sep"></div>
      <button class="tb" class:on={isH1}         onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} title="H1">H1</button>
      <button class="tb" class:on={isH2}         onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="H2">H2</button>
      <button class="tb" class:on={isH3}         onclick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} title="H3">H3</button>
      <div class="tb-sep"></div>
      <button class="tb" class:on={isBullet}     onclick={() => editor?.chain().focus().toggleBulletList().run()}          title="Liste">•</button>
      <button class="tb mono" class:on={isOrdered}   onclick={() => editor?.chain().focus().toggleOrderedList().run()}     title="Numm. Liste">1.</button>
      <div class="tb-sep"></div>
      <button class="tb" class:on={isBlockquote} onclick={() => editor?.chain().focus().toggleBlockquote().run()}          title="Zitat">❝</button>
      <button class="tb mono" class:on={isCode}      onclick={() => editor?.chain().focus().toggleCode().run()}            title="Inline-Code">`</button>
      <button class="tb mono" class:on={isCodeBlock} onclick={() => editor?.chain().focus().toggleCodeBlock().run()}       title="Code-Block">```</button>
    {/if}

    <div class="tb-flex"></div>

    <button class="source-btn" class:active={showSource} onclick={toggleSource}>Quelle</button>
  </div>

  <div bind:this={editorEl} class="editor-mount" class:hidden={showSource} data-placeholder={placeholder}></div>

  {#if showSource}
    <textarea
      class="source-ta"
      value={sourceValue}
      oninput={handleSourceInput}
      spellcheck="false"
    ></textarea>
  {/if}
</div>
