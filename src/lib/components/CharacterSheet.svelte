<script lang="ts">
  import { formatSpecies } from '../schemas/classLevelText';
  import { createCharacterEditor } from '../services/characterEditor.svelte';
  import { createCharacterSideFiles } from '../services/characterSideFiles.svelte';
  import { createFormLibraries } from '../services/characterFormLibraries.svelte';
  import { createCharacterPdf } from '../pdf/useCharacterPdf.svelte';
  import { createFeaturePanelLayout } from '../utils/featurePanelLayout.svelte';
  import { matchItem } from '../itemLibrary';
  import { masteryLabel } from '../itemLabels';
  import { coversWeapon, weaponNameSet } from '../services/weaponProficiency';
  import { resolveSpellAccess } from '../services/characterFeatures';
  import { loadSpellcasting, type LoadedSpellcasting } from '../services/spellcasting/project';
  import type { WeaponMastery } from '../schemas/vocabulary';
  import type { CoverageBadge } from '../services/declarationCoverage';
  import type { SpellAccessValues } from '../services/spellcasting/access';
  import EditorPanel from './EditorPanel.svelte';
  import CharacterEditForm from './CharacterEditForm.svelte';
  import CharacterFeaturePanel from './CharacterFeaturePanel.svelte';
  import CharacterSheetView from './character/CharacterSheetView.svelte';
  import LevelUpAssistant from './LevelUpAssistant.svelte';
  import RichTextEditor from './RichTextEditor.svelte';

  interface Props {
    dirPath: string;   // z.B. "./vault/characters/carric_galanodel"
  }

  let { dirPath }: Props = $props();

  const libs = createFormLibraries();
  const editor = createCharacterEditor({
    itemIndex: () => libs.itemIndex,
    spellIndex: () => libs.spellIndex,
  });
  const ed = editor.card;
  const character = $derived(editor.character);

  // Merkmals-gewährte Zauberwerte zur Anzeigezeit gerechnet, damit ein steigender
  // Übungsbonus sie mitnimmt — gespeichert würden sie altern.
  let spellAccessRows = $state<SpellAccessValues[]>([]);
  let spellcasting = $state<LoadedSpellcasting | null>(null);
  $effect(() => {
    const c = character;
    if (!c) {
      spellAccessRows = [];
      spellcasting = null;
      return;
    }
    void (async () => {
      spellAccessRows = await resolveSpellAccess({
        classes: c.classes,
        backgroundRef: c.backgroundRef,
        features: c.features,
        proficiencyBonus: c.proficiencyBonus,
        mods: { str: c.strMod, ges: c.gesMod, kon: c.konMod, int: c.intMod, wei: c.weiMod, cha: c.chaMod },
      });
      spellcasting = await loadSpellcasting(c);
    })();
  });

  /**
   * Die Eigenschaft hängt am Item, die Erlaubnis an `character.masteries`, aufgelöst über
   * Name und Waffenart: ein Waffentausch wirkt sofort auf alle Angriffe, ohne dass in
   * `attacks[]` etwas zurückgeschrieben werden müsste.
   */
  const masteredWeaponKinds = $derived(
    weaponNameSet(character?.masteries ?? [], (n) => matchItem(libs.itemIndex, { name: n })),
  );

  function masteryOf(name: string): WeaponMastery | undefined {
    const lib = matchItem(libs.itemIndex, { name });
    if (!lib?.mastery) return undefined;
    return coversWeapon(masteredWeaponKinds, lib) ? lib.mastery : undefined;
  }

  /**
   * Namen, die die Bibliothek nicht (mehr) kennt, bleiben bewusst STEHEN — sonst zeigte
   * der Bogen weniger als die Datei enthält; der Editor markiert sie als Überhang.
   */
  const masteryChips = $derived(
    (character?.masteries ?? []).map((n) => ({ name: n, mastery: matchItem(libs.itemIndex, { name: n })?.mastery })),
  );

  const side = createCharacterSideFiles({
    dirPath: () => dirPath,
    characterName: () => character?.name ?? '',
    portraitFile: () => character?.portraitFile,
  });

  const pdf = createCharacterPdf({
    dirPath: () => dirPath,
    character: () => character,
    pdfName: () => editor.pdfName,
    details: () => side.details,
    masteryOf: (n) => { const m = masteryOf(n); return m ? masteryLabel(m) : undefined; },
    spellAccess: () => spellAccessRows,
    applyContent: (content) => ed.applyContent(content),
  });

  const feats = createFeaturePanelLayout();
  let featBadge = $state<CoverageBadge | null>(null);
  let featOpenCount = $state(0);
  let showLevelUp = $state(false);
</script>

<div class="sheet">
  {#if pdf.error}
    <div class="error">{pdf.error}</div>
  {:else if character}
    <div class="header">
      {#if side.portraitUrl}
        <img class="portrait-thumb" src={side.portraitUrl} alt="Portrait von {character.name}" />
      {/if}
      <div class="name-block">
        <h1>{character.name}</h1>
        <span class="sub">{character.classLevel} · {character.race || formatSpecies(character.species)}</span>
      </div>
      <div class="header-meta">
        <span>Spieler: <strong>{character.playerName}</strong></span>
        <span>Hintergrund: <strong>{character.background}</strong></span>
        <span>EP: <strong>{character.xp}</strong></span>
      </div>
      <div class="header-actions">
        {#snippet pdfIcon()}
          <svg viewBox="0 0 24 24" width="16" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/>
            <text x="11.5" y="18.5" font-size="6.5" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle" font-family="sans-serif">PDF</text>
          </svg>
        {/snippet}
        <button class="icon-btn import" class:busy={pdf.importing} onclick={pdf.importIntoExisting} disabled={pdf.importing}
                aria-label="PDF importieren" title="PDF importieren, aktuelle Werte überschreiben">
          <span class="arrow">&rarr;</span>{@render pdfIcon()}
        </button>
        <button class="icon-btn export" class:busy={pdf.exporting} onclick={pdf.exportToFile} disabled={pdf.exporting}
                aria-label="Als PDF exportieren" title="Ausgefülltes ATaendler-PDF exportieren">
          {@render pdfIcon()}<span class="arrow">&rarr;</span>
        </button>
        <button class="icon-btn levelup" onclick={() => (showLevelUp = true)}
                aria-label="Stufenaufstieg" title="Stufenaufstieg (KI-gestützt)">⬆</button>
      </div>
    </div>

    {#if showLevelUp && ed.draft}
      <LevelUpAssistant character={ed.draft} onApply={editor.applyLevelUp} onclose={() => (showLevelUp = false)} />
    {/if}

    <!-- Die Leiste liegt AUSSERHALB des {#key ed.draft} und übersteht damit den
         Referenz-Swap von `editor.apply`. -->
    <div class="sheet-body">
      <EditorPanel
        bind:tab={ed.tab}
        dirty={ed.dirty}
        saveError={ed.saveError}
        onsave={() => ed.save()}
        ondiscard={editor.discard}
        onsavejson={(json) => ed.saveJson(json)}
        getJson={() => ed.draft ? JSON.stringify(ed.draft, null, 2) : ed.lastSavedContent}
        extraTabs={[{ id: 'details', label: 'Details' }, { id: 'notes', label: 'GM-Notizen' }]}
        saveBarAllTabs
        style="--ep-accent: var(--arcane)"
      >
        {#snippet karte()}
          <CharacterSheetView {character} itemIndex={libs.itemIndex} spellIndex={libs.spellIndex}
            {spellcasting} {masteryOf} {masteryChips} />
        {/snippet}

        {#snippet bearbeiten()}
          <!-- Remount bei Draft-Wechsel: das Formular initialisiert nur einmal aus dem
               Draft und mutiert ihn danach in place. -->
          {#if ed.draft}
            {#key ed.draft}
              <div class="edit-wrapper" style="width:100%">
                <CharacterEditForm bind:character={ed.draft} {dirPath} {libs} saved={editor.saved}
                  pendingUpgrade={editor.pendingUpgrade} upgradeAccepted={editor.upgradeAccepted}
                  onAcceptUpgrade={editor.acceptUpgrade} />
              </div>
            {/key}
          {/if}
        {/snippet}

        {#snippet extra(id)}
        {#if id === 'notes'}
        <div class="freetext-area">
          <div class="freetext-hint">
            <span>Nur für den Spielleiter — wird nicht ans PDF angehängt.</span>
            <span class="freetext-status" class:unsaved={side.gmNotesStatus === 'unsaved'} class:saving={side.gmNotesStatus === 'saving'}>
              {side.gmNotesStatus === 'saving' ? 'Speichert…' : side.gmNotesStatus === 'unsaved' ? '● ungespeichert' : 'Gespeichert'}
            </span>
          </div>
          <RichTextEditor value={side.gmNotes} onChange={side.onGmNotesChange} placeholder="Hintergrund, Geheimnisse, Hooks, Verbindungen, DM-Notizen …" />
        </div>

      {:else}
        <div class="freetext-area">
          <div class="freetext-hint">
            <span>Wird beim PDF-Export als zusätzliche Seite(n) angehängt.</span>
            <span class="freetext-status" class:unsaved={side.detailsStatus === 'unsaved'} class:saving={side.detailsStatus === 'saving'}>
              {side.detailsStatus === 'saving' ? 'Speichert…' : side.detailsStatus === 'unsaved' ? '● ungespeichert' : 'Gespeichert'}
            </span>
          </div>
          <RichTextEditor value={side.details} onChange={side.onDetailsChange} placeholder="Hintergrundgeschichte, Tagebuch, Notizen … – wird ans PDF angehängt." />
        </div>
        {/if}
        {/snippet}
      </EditorPanel>

      <div
        class="resize-handle"
        class:hidden={feats.collapsed}
        role="separator"
        aria-label="Merkmals-Leiste verbreitern"
        onmousedown={feats.startResize}
      ></div>

      <!-- Zugeklappt bleibt die Leiste MONTIERT (Breite 0) — sonst stünde der Zähler an
           der Lasche auf 0, sobald man sie zuklappt. -->
      <div class="feat-wrap" class:no-transition={feats.dragging} style="width: {feats.width}px">
        <!-- Neuaufbau beim CHARAKTERwechsel, nicht bei jedem Draft-Swap: sonst meldete ein
             Wahl-Platz der alten Auflösung gegen das neue Ledger „1 offene Entscheidung". -->
        {#key dirPath}
          {#if ed.draft}
            <CharacterFeaturePanel character={ed.draft} saved={editor.saved}
              applyContext={editor.applyContext} onApplyChanges={editor.apply}
              bind:badge={featBadge} bind:openCount={featOpenCount} />
          {/if}
        {/key}
      </div>

      <button
        class="feat-toggle"
        class:no-transition={feats.dragging}
        style="right: {feats.width}px"
        onclick={feats.toggle}
        title={featBadge?.title || (feats.collapsed ? 'Merkmals-Leiste öffnen' : 'Merkmals-Leiste schließen')}
        aria-label={feats.collapsed ? 'Merkmals-Leiste öffnen' : 'Merkmals-Leiste schließen'}
      >
        <span class="ft-arrow">{feats.collapsed ? '☰' : '›'}</span>
        {#if featOpenCount}<span class="ft-count">{featOpenCount}</span>{/if}
      </button>
    </div>
  {:else}
    <div class="loading">Lade Charakterbogen…</div>
  {/if}
</div>

<style>
  .sheet {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--ink);
    font-size: 0.9rem;
  }

  .loading, .error {
    padding: 2rem;
    color: var(--ink-muted);
    text-align: center;
  }
  .error { color: var(--danger); }

  .header {
    padding: 1rem 1.5rem 0;
    border-bottom: 1px solid var(--surface);
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 1rem;
  }

  .portrait-thumb {
    width: 64px;
    height: 80px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg);
  }

  .name-block h1 {
    margin: 0;
    font-size: 1.4rem;
    color: var(--arcane);
  }

  .sub { color: var(--ink-muted); font-size: 0.85rem; }

  .header-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.8rem;
    color: var(--ink-soft);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.3rem;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    font-size: 0.9rem;
    font-family: inherit;
    white-space: nowrap;
    cursor: pointer;
  }
  .icon-btn .arrow { font-size: 0.95rem; line-height: 1; }
  .icon-btn:disabled { opacity: 0.6; cursor: default; }
  .icon-btn.import:hover { border-color: var(--arcane); color: var(--arcane); }
  .icon-btn.export:hover { border-color: var(--green); color: var(--green); }
  .icon-btn.levelup { justify-content: center; font-weight: 700; }
  .icon-btn.levelup:hover { border-color: var(--arcane); color: var(--arcane); }
  .icon-btn.busy { animation: icon-pulse 1s ease-in-out infinite; }

  @keyframes icon-pulse {
    0%, 100% { opacity: 0.4; }
    50%      { opacity: 1; }
  }

  .edit-wrapper {
    min-height: 0;
  }

  .sheet-body {
    flex: 1;
    min-height: 0;
    display: flex;
    position: relative;   /* Bezug der absolut positionierten Lasche */
  }

  .feat-wrap {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    transition: width 0.2s ease;
  }
  .feat-wrap.no-transition { transition: none; }

  .resize-handle {
    width: 4px;
    flex-shrink: 0;
    background: var(--surface);
    cursor: col-resize;
    transition: background 0.15s;
    position: relative;
    z-index: 10;
  }
  .resize-handle:hover,
  .resize-handle:active { background: var(--red); }
  .resize-handle.hidden { display: none; }

  /* Nicht auf halber Höhe: bei zugeklapptem KI-Panel säße die Lasche sonst
     genau unter dessen Lasche. */
  .feat-toggle {
    position: absolute;
    top: 25%;
    z-index: 20;
    width: 24px;
    min-height: 80px;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    padding: 0.4rem 0;
    background: var(--bg-panel);
    color: var(--ink-muted);
    border: 1px solid var(--surface);
    border-right: none;
    border-radius: 8px 0 0 8px;
    cursor: pointer;
    font-size: 1.05rem;
    line-height: 1;
    box-shadow: -2px 0 6px rgba(0, 0, 0, 0.15);
    transition: right 0.2s ease, color 0.1s, background 0.1s;
  }
  .feat-toggle.no-transition { transition: color 0.1s, background 0.1s; }
  .feat-toggle:hover { color: var(--arcane); background: var(--surface); }
  .ft-arrow { line-height: 1; }
  .ft-count {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--gold);
    border: 1px solid color-mix(in srgb, var(--gold) 45%, var(--bg));
    border-radius: 999px;
    padding: 0.05rem 0.25rem;
    line-height: 1.2;
  }

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
