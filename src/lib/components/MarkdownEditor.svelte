<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
  import { Markdown } from 'tiptap-markdown';
  import { invoke } from '@tauri-apps/api/core';
  import { fileContent, activeFile, activeCampaign, historyState, undoContent, redoContent } from '../stores/campaign';
  import { openVaultLink } from '../services/vaultLinks';
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

  // Klick auf einen Markdown-Link: relativ zur aktiven Datei intern öffnen.
  // Externe Links (http/mailto) im System-Browser; Anker etc. ignorieren.
  function onLinkClick(e: MouseEvent) {
    const anchor = (e.target as HTMLElement | null)?.closest?.('a') as HTMLAnchorElement | null;
    if (!anchor) return;
    // Textauswahl per Drag → nicht navigieren: der Nutzer will den Link markieren,
    // um ihn zu bearbeiten. Nur ein einfacher Klick (Cursor) folgt dem Link.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    const fromPath = get(activeFile)?.path ?? '';
    void openVaultLink(href, fromPath, get(activeCampaign)?.path).then((handled) => {
      if (!handled && /^https?:\/\//i.test(href)) window.open(href, '_blank', 'noopener');
    });
  }

  // Öffnet die URL-Eingabe, vorbelegt mit dem Ziel des aktuellen Links (falls vorhanden).
  function openLinkEditor() {
    if (!editor) return;
    linkUrlValue = (editor.getAttributes('link').href as string) ?? '';
    showLinkInput = true;
  }

  // Übernimmt die URL: leer → Link entfernen; Auswahl → verlinken; Cursor ohne Auswahl
  // und ohne bestehenden Link → die URL als verlinkten Text einfügen.
  function applyLink() {
    if (!editor) { showLinkInput = false; return; }
    const url = linkUrlValue.trim();
    const chain = editor.chain().focus();
    if (!url) {
      chain.extendMarkRange('link').unsetLink().run();
    } else if (editor.state.selection.empty && !editor.isActive('link')) {
      chain.insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run();
    } else {
      chain.extendMarkRange('link').setLink({ href: url }).run();
    }
    showLinkInput = false;
    linkUrlValue = '';
  }

  function cancelLinkEditor() {
    showLinkInput = false;
    linkUrlValue = '';
  }

  function onLinkInputKey(e: KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); applyLink(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelLinkEditor(); }
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
  let isTable      = $derived(tick >= 0 && (editor?.isActive('table') ?? false));
  let isLink       = $derived(tick >= 0 && (editor?.isActive('link') ?? false));

  // Link-Editor (URL der Auswahl/des aktiven Links setzen, ändern, entfernen)
  let showLinkInput = $state(false);
  let linkUrlValue = $state('');

  onMount(() => {
    const { block, body } = splitFull($fileContent);
    rawFrontmatterBlock = block;
    lastBody = body;

    const ed = new Editor({
      element: editorEl!,
      extensions: [
        // link-Optionen:
        //  - openOnClick aus: Klicks fängt onLinkClick ab und navigiert intern,
        //    statt die Webview auf die relative URL umzuleiten.
        //  - isAllowedUri: ()=>true: TipTap v3 verwirft sonst schemalose relative
        //    Links (z.B. world/dorf.md) schon beim Parsen → Link-Mark ginge verloren.
        StarterKit.configure({ link: { openOnClick: false, isAllowedUri: () => true } }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
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
      // tick treibt die Toolbar-Aktiv-States. In einen Microtask verschoben, damit
      // eine während Sveltes Update-Flush ausgelöste Transaktion (z.B. der Blur beim
      // Unmount durch Link-Navigation auf eine Kartenansicht) nicht
      // state_unsafe_mutation wirft.
      onSelectionUpdate: () => { queueMicrotask(() => { if (editor) tick++; }); },
      onTransaction:    () => { queueMicrotask(() => { if (editor) tick++; }); },
    });

    editor = ed;

    editorEl!.addEventListener('click', onLinkClick);

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
      editorEl?.removeEventListener('click', onLinkClick);
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
      <div class="tb-sep"></div>
      <button class="tb" onclick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Tabelle einfügen (3×3)">▦</button>
      {#if isTable}
        <button class="tb mono" onclick={() => editor?.chain().focus().addColumnAfter().run()} title="Spalte rechts einfügen">Sp+</button>
        <button class="tb mono" onclick={() => editor?.chain().focus().deleteColumn().run()}   title="Spalte löschen">Sp−</button>
        <button class="tb mono" onclick={() => editor?.chain().focus().addRowAfter().run()}     title="Zeile darunter einfügen">Ze+</button>
        <button class="tb mono" onclick={() => editor?.chain().focus().deleteRow().run()}       title="Zeile löschen">Ze−</button>
        <button class="tb" onclick={() => editor?.chain().focus().toggleHeaderRow().run()}      title="Kopfzeile umschalten">⤒</button>
        <button class="tb" onclick={() => editor?.chain().focus().deleteTable().run()}          title="Tabelle löschen">▦✕</button>
      {/if}
      <div class="tb-sep"></div>
      <button class="tb" class:on={isLink} onclick={openLinkEditor} title="Link einfügen/bearbeiten (leeres Feld übernehmen = entfernen)">🔗</button>
    {/if}

    <div class="tb-flex"></div>

    <span class="save-indicator" class:unsaved={saveStatus === 'unsaved'} class:saving={saveStatus === 'saving'}>
      {saveStatus === 'saving' ? 'Speichert…' : saveStatus === 'unsaved' ? '●' : ''}
    </span>
    <button class="source-btn" class:active={showSource} onclick={toggleSource}>Quelle</button>
  </div>

  <!-- Link-Editor: URL der aktuellen Auswahl/des Links setzen, ändern oder entfernen -->
  {#if showLinkInput}
    <div class="link-edit-row">
      <span class="link-edit-label">🔗 Link-Ziel</span>
      <input
        class="link-edit-input"
        bind:value={linkUrlValue}
        placeholder="z.B. world/ort.md oder https://…"
        onkeydown={onLinkInputKey}
        autofocus
      />
      <button class="confirm-btn" onclick={applyLink} title="Übernehmen (leer = entfernen)">✓</button>
      <button class="confirm-btn cancel" onclick={cancelLinkEditor} title="Abbrechen">✕</button>
    </div>
  {/if}

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
