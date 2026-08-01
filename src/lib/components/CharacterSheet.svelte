<script lang="ts">
  import { tick } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { AutosaveFile } from '../utils/autosaveFile.svelte';
  import { emptySpells } from '../pdf/characterFields';
  import { choosePdfFile, importPdfIntoCharacter, exportCharacterPdfFile } from '../pdf/characterPdfIo';
  import { applyChanges } from '../services/applyChanges';
  import { createCardEditor } from '../editor/cardEditor.svelte';
  import { parseCharacter } from '../utils/schemaValidation';
  import { type Character } from '../schemas/characterSchema';
  import { formatClassLevel, formatSpecies } from '../schemas/classLevelText';
  import { pendingCharacterUpgrade } from '../schemas/characterUpgrades';
  import { proficiencyBonus } from '../services/classProgression';
  import type { Change, LevelUpChangeSet } from '../schemas/levelUp';
  import type { LevelUpDelta } from '../services/levelUp';
  import EditorPanel from './EditorPanel.svelte';
  import CharacterEditForm from './CharacterEditForm.svelte';
  import CharacterFeaturePanel from './CharacterFeaturePanel.svelte';
  import CharacterSheetView from './character/CharacterSheetView.svelte';
  import LevelUpAssistant from './LevelUpAssistant.svelte';
  import RichTextEditor from './RichTextEditor.svelte';
  import { invalidateVault } from '../stores/campaign';
  import { getSpellLibrary, buildSpellIndex, matchSpell, type SpellInfo } from '../spellLibrary';
  import { getItemsByDir, buildItemIndex, matchItem, type ItemInfo } from '../itemLibrary';
  import { DIR_TO_CATEGORY, masteryLabel } from '../itemLabels';
  import { isMastered, masteredKinds } from '../services/weaponMastery';
  import type { WeaponMastery } from '../schemas/vocabulary';
  import { resolveSpellAccess } from '../services/characterFeatures';
  import type { CoverageBadge } from '../services/declarationCoverage';
  import { dragPanelWidth } from '../utils/panelResize';
  import type { SpellAccessValues } from '../services/spellAccess';

  interface Props {
    dirPath: string;   // z.B. "./vault/characters/carric_galanodel"
  }

  let { dirPath }: Props = $props();

  // Zauberwerte der merkmals-gewährten Zugänge (Eingeweihter der Magie): zur Anzeigezeit gerechnet,
  // damit ein steigender Übungsbonus sie mitnimmt — gespeichert würden sie altern.
  let spellAccessRows = $state<SpellAccessValues[]>([]);
  $effect(() => {
    const c = character;
    if (!c) {
      spellAccessRows = [];
      return;
    }
    void (async () => {
      spellAccessRows = await resolveSpellAccess({
        features: c.features,
        proficiencyBonus: c.proficiencyBonus,
        mods: { str: c.strMod, ges: c.gesMod, kon: c.konMod, int: c.intMod, wei: c.weiMod, cha: c.chaMod },
      });
    })();
  });

  // ─── Merkmals-Seitenleiste (rechts, tab-unabhängig) ───────────────────────────
  // Zustand wie beim KI-Panel (`routes/+page.svelte`): Breite und Zuklapp-Zustand in
  // `localStorage`, Zuklappen ist eine Breiten-Transition auf 0 — die Komponente bleibt
  // montiert, damit der Zähler an der Lasche auch zugeklappt stimmt. Standard: OFFEN.
  const FEAT_MIN_W = 240;
  const FEAT_MAX_W = 720;
  let featsWidth = $state(parseInt(localStorage.getItem('char-features-width') ?? '360'));
  let featsCollapsed = $state(localStorage.getItem('char-features-collapsed') === '1');
  let featsDragging = $state(false);
  const effFeatWidth = $derived(featsCollapsed ? 0 : featsWidth);
  // Aus der Leiste hochgereicht: Stand der deklarierten Wahlen für die Lasche.
  let featBadge = $state<CoverageBadge | null>(null);
  let featOpenCount = $state(0);

  function toggleFeats() {
    featsCollapsed = !featsCollapsed;
    localStorage.setItem('char-features-collapsed', featsCollapsed ? '1' : '0');
  }

  function startFeatResize(e: MouseEvent) {
    featsDragging = true;
    dragPanelWidth(e, {
      start: featsWidth,
      min: FEAT_MIN_W,
      max: FEAT_MAX_W,
      invert: true, // die Leiste hängt rechts — nach links ziehen vergrößert
      onWidth: (w) => { featsWidth = w; },
      ondone: () => {
        localStorage.setItem('char-features-width', String(featsWidth));
        featsDragging = false;
      },
    });
  }

  // Karten-Editor-Fundament: besitzt Laden (character.json via activeFile), Dirty-
  // Tracking, Speichern (kein Sprung zur Bogen-Ansicht), JSON-Tab, Navigations-Guard.
  const ed = createCardEditor<Character>({
    type: 'character',
    label: 'Charakter',
    parse: (content) => {
      const r = parseCharacter(JSON.parse(content));
      return r.ok ? r.data : null;
    },
    // Das angenommene Schema-Upgrade ist die einzige Änderung, die den Draft NICHT
    // anfasst (`parse` hat sie beim Laden längst angewandt) — ohne diesen Hook bliebe der
    // Editor sauber und die Speichern-Leiste unerreichbar. Rückgabetyp annotiert, weil
    // `pendingUpgrade` seinerseits `ed.lastSavedContent` liest (Inferenzkreis).
    extraDirty: (): boolean => upgradeAccepted && !!pendingUpgrade,
    onSaved: () => invalidateVault(),
  });
  // Read-only-Sicht auf den Draft für die Bogen-Anzeige.
  // (Der Bearbeiten-Tab bindet ed.draft direkt und mutiert ihn in place.)
  const character = $derived(ed.draft);
  // Zuletzt gespeicherte Version als Baseline für das Diff-Highlighting im
  // Bearbeiten-Formular. Bei neuem/nie gespeichertem Charakter (leerer Content)
  // oder ungültigem JSON → null → keine Hervorhebungen. save() ersetzt ed.draft
  // nicht, setzt aber lastSavedContent neu → dieser Derived rechnet neu → alle
  // Highlights verschwinden in-place.
  const savedCharacter = $derived.by<Character | null>(() => {
    if (!ed.lastSavedContent) return null;
    try {
      const r = parseCharacter(JSON.parse(ed.lastSavedContent));
      return r.ok ? r.data : null;
    } catch {
      return null;
    }
  });
  // Quelle der PDF-Import-Metadaten (nicht editierbar).
  const pdfName = $derived(character?._importedFrom ?? '');

  // Gegen den ROHEN Dateiinhalt geprüft, nicht gegen den Draft: `parseCharacter`
  // zieht beim Laden ohnehin die Pipeline durch, veraltet ist nur die Datei.
  const pendingUpgrade = $derived.by(() => {
    if (!ed.lastSavedContent) return null;
    try {
      return pendingCharacterUpgrade(JSON.parse(ed.lastSavedContent));
    } catch {
      return null; // ungültiges JSON — dafür meldet sich bereits der Lade-Fehler
    }
  });
  // Angebot angenommen → `extraDirty` greift, geschrieben wird über die Speichern-Leiste.
  let upgradeAccepted = $state(false);
  // Beim Dateiwechsel zurücksetzen, sonst wirkt der nächste Charakter ungespeichert.
  $effect(() => {
    void ed.lastSavedContent;
    upgradeAccepted = false;
  });

  let showLevelUp = $state(false);

  /**
   * Wendet den KI-Vorschlag ADDITIV auf einen frischen Draft-Klon an und ersetzt
   * `ed.draft` per NEUER Referenz. Der Referenz-Swap ist tragend: er löst
   * `{#key ed.draft}` (Formular-Remount → Diff-Highlighting) und `ed.dirty` aus.
   * Numerische Werte werden addiert, damit item-gewährte Boni erhalten bleiben.
   */
  function applyLevelUp(changeSet: LevelUpChangeSet, delta: LevelUpDelta) {
    if (!ed.draft) return;
    const next = structuredClone($state.snapshot(ed.draft)) as Character;

    // Struktur (Identität, aus delta — kein additives Delta): Klassenstufe / Multiclass.
    if (delta.isNewClass) {
      next.classes.push({ sourceKey: delta.sourceKey, name: delta.klasseName, level: delta.toLevel });
    } else {
      const cls = next.classes[delta.classIndex];
      if (cls) cls.level = delta.toLevel;
    }
    // Übungsbonus deterministisch aus Gesamtstufe (Sicherheitsnetz; changeSet setzt ihn ebenso).
    next.proficiencyBonus = proficiencyBonus(delta.newTotalLevel);

    // Alle übrigen Änderungen additiv/settend aus dem gemeinsamen Format anwenden —
    // derselbe Applier, den die Wizard-Assembly benutzt (services/applyChanges.ts).
    applyChanges(next, changeSet.changes, {
      classIndex: delta.classIndex,
      isNewClass: delta.isNewClass,
      resolveSpellKey: (name) => matchSpell(spellIndex, { name })?.key,
    });
    next.classLevel = formatClassLevel(next.classes);

    // Referenz-Swap → {#key ed.draft} remountet das Formular; parseCharacter normalisiert.
    const r = parseCharacter(next);
    ed.draft = r.ok ? r.data : next;
  }

  /**
   * „Übernehmen" einer deklarierten Merkmalswahl aus der Merkmals-Leiste — dasselbe Muster
   * wie `applyLevelUp`, nur ohne Struktur-Teil: die Wahl ändert keine Klassenstufe.
   *
   * Das `await tick()` ist tragend: der Sync-$effect des Formulars muss seine Runes im Draft
   * haben, sonst verliert der Referenz-Swap die letzten Eingaben. Die Leiste selbst steht
   * außerhalb des `{#key ed.draft}` und übersteht den Swap.
   */
  async function applyChoiceGrants(changes: Change[]) {
    if (!ed.draft || !changes.length) return;
    await tick();
    const next = structuredClone($state.snapshot(ed.draft)) as Character;
    applyChanges(next, changes, {
      classIndex: 0,
      resolveSpellKey: (name) => matchSpell(spellIndex, { name })?.key,
    });
    const r = parseCharacter(next);
    ed.draft = r.ok ? r.data : next;
  }

  let gmNotes = $state('');
  const gmNotesSave = new AutosaveFile();
  let freitext = $state('');
  const freitextSave = new AutosaveFile();
  let error = $state('');
  let importingPdf = $state(false);
  let exportingPdf = $state(false);
  let portraitUrl = $state('');
  let spellLibrary = $state<SpellInfo[]>([]);
  let itemLoadedByDir = $state<Record<string, ItemInfo[]>>({});

  $effect(() => {
    const file = character?.portraitFile;
    if (!file) { portraitUrl = ''; return; }
    invoke<string>('read_file_base64', { path: `${dirPath}/${file}` })
      .then(b64 => {
        const mime = file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        portraitUrl = `data:${mime};base64,${b64}`;
      })
      .catch(() => { portraitUrl = ''; });
  });

  $effect(() => { getSpellLibrary().then(lib => { spellLibrary = lib; }); });

  $effect(() => {
    Promise.all(
      Object.keys(DIR_TO_CATEGORY).map(dir =>
        getItemsByDir(dir).then(items => ({ dir, items }))
      )
    ).then(results => {
      const map: Record<string, ItemInfo[]> = {};
      for (const { dir, items } of results) map[dir] = items;
      itemLoadedByDir = map;
    });
  });

  // Zauber werden per Key (Fallback Name) an die Bibliothek gebunden — wie Items.
  const itemIndex = $derived(buildItemIndex(itemLoadedByDir));
  const spellIndex = $derived(buildSpellIndex(spellLibrary));

  /**
   * Waffenbeherrschung (5e 2024) eines Angriffs bzw. einer Waffe: die Eigenschaft
   * hängt am Item (`mastery`), die Erlaubnis an `character.masteries`. Aufgelöst wird
   * über Name und Waffenart — dieselbe Brücke wie beim Inventar. Ein Tausch der
   * beherrschten Waffen wirkt deshalb sofort auf alle Angriffe, ohne dass etwas
   * zurückgeschrieben werden müsste (`attacks[]` bleibt unberührt).
   */
  const masteredWeaponKinds = $derived(
    masteredKinds(character?.masteries ?? [], (n) => matchItem(itemIndex, { name: n })),
  );

  function masteryOf(name: string): WeaponMastery | undefined {
    const lib = matchItem(itemIndex, { name });
    if (!lib?.mastery) return undefined;
    return isMastered(masteredWeaponKinds, lib) ? lib.mastery : undefined;
  }

  /**
   * Beherrschte Waffen als „Name (Eigenschaft)". Namen, die die Bibliothek nicht (mehr)
   * kennt, bleiben bewusst STEHEN — sonst zeigte der Bogen weniger als die Datei
   * enthält; der Editor markiert sie dort als Überhang.
   */
  const masteryChips = $derived(
    (character?.masteries ?? []).map((n) => ({ name: n, mastery: matchItem(itemIndex, { name: n })?.mastery })),
  );

  const gmNotesPath = $derived(`${dirPath}/gm-notes.md`);
  const detailsPath = $derived(`${dirPath}/details.md`);
  const legacyDetailsPath = $derived(`${dirPath}/freitext.md`);  // Migration: altes Format

  // GM-Notizen & Details laden, wenn der Charakter (dirPath) wechselt.
  // character.json selbst lädt der Karten-Editor (ed) über activeFile.
  $effect(() => {
    const dir = dirPath;
    if (!dir) return;
    freitextSave.cancel();
    gmNotesSave.cancel();
    error = '';
    loadSideFiles();
  });

  async function loadSideFiles() {
    // GM-Notizen laden (oder aus Template anlegen).
    try {
      gmNotes = await invoke<string>('read_file_content', { path: gmNotesPath });
    } catch {
      let tmpl = '';
      try {
        tmpl = await invoke<string>('read_file_content', { path: './vault/templates/character.md' });
      } catch { /* kein Template */ }
      gmNotes = `# GM-Notizen: ${character?.name ?? ''}\n\n` + (tmpl || `## Hintergrund\n\n## Geheimnisse & Hooks\n\n## Verbindungen\n\n## Entwicklung\n\n## DM-Notizen\n`);
      await invoke('write_file_content', { path: gmNotesPath, content: gmNotes });
    }

    // Details laden (optional — leer, wenn noch nicht vorhanden).
    // Migration: alte freitext.md weiterlesen, solange noch keine details.md existiert.
    try {
      freitext = await invoke<string>('read_file_content', { path: detailsPath });
    } catch {
      try {
        freitext = await invoke<string>('read_file_content', { path: legacyDetailsPath });
      } catch {
        freitext = '';
      }
    }
    freitextSave.markSaved();
    gmNotesSave.markSaved();
  }

  async function importPdfIntoExisting() {
    if (!character) return;
    const selected = await choosePdfFile(dirPath);
    if (!selected) return;

    importingPdf = true;
    error = '';
    try {
      // Zauber aus dem aktuellen Charakter behalten (manuell gepflegt).
      const content = await importPdfIntoCharacter(selected, dirPath, character?.spells ?? emptySpells());
      // In den Editor übernehmen (Draft + Baseline → nicht „dirty").
      ed.applyContent(content);
    } catch (e) {
      error = `PDF-Import fehlgeschlagen: ${e}`;
    } finally {
      importingPdf = false;
    }
  }

  async function exportToPdf() {
    if (!character) return;
    exportingPdf = true;
    error = '';
    try {
      await exportCharacterPdfFile(character, {
        importedFrom: pdfName,
        dirPath,
        freitext,
        // Derselbe Resolver wie für die Pille in der Angriffstabelle — PDF und Bogen
        // zeigen damit garantiert dieselbe Eigenschaft.
        masteryOf: (n) => { const m = masteryOf(n); return m ? masteryLabel(m) : undefined; },
        // Dieselben Werte wie im Zauber-Block der Karte — PDF und Bogen können nicht auseinanderlaufen.
        spellAccess: spellAccessRows,
      });
    } catch (e) {
      error = `PDF-Export fehlgeschlagen: ${e}`;
    } finally {
      exportingPdf = false;
    }
  }

  function onGmNotesChange(md: string) {
    gmNotes = md;
    gmNotesSave.schedule(gmNotesPath, md);
  }

  function onFreitextChange(md: string) {
    freitext = md;
    freitextSave.schedule(detailsPath, md);
  }
</script>

<div class="sheet">
  {#if error}
    <div class="error">{error}</div>
  {:else if character}
    <!-- Header (bleibt über allen Tabs sichtbar) -->
    <div class="header">
      {#if portraitUrl}
        <img class="portrait-thumb" src={portraitUrl} alt="Portrait von {character.name}" />
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
        <button class="icon-btn import" class:busy={importingPdf} onclick={importPdfIntoExisting} disabled={importingPdf}
                aria-label="PDF importieren" title="PDF importieren, aktuelle Werte überschreiben">
          <span class="arrow">&rarr;</span>{@render pdfIcon()}
        </button>
        <button class="icon-btn export" class:busy={exportingPdf} onclick={exportToPdf} disabled={exportingPdf}
                aria-label="Als PDF exportieren" title="Ausgefülltes ATaendler-PDF exportieren">
          {@render pdfIcon()}<span class="arrow">&rarr;</span>
        </button>
        <button class="icon-btn levelup" onclick={() => (showLevelUp = true)}
                aria-label="Stufenaufstieg" title="Stufenaufstieg (KI-gestützt)">⬆</button>
      </div>
    </div>

    {#if showLevelUp && ed.draft}
      <LevelUpAssistant character={ed.draft} onApply={applyLevelUp} onclose={() => (showLevelUp = false)} />
    {/if}

    <!-- Tab-Bereich links, Merkmals-Leiste rechts. Die Leiste liegt AUSSERHALB des
         {#key ed.draft} und übersteht den Referenz-Swap von `applyChoiceGrants`. -->
    <div class="sheet-body">
      <EditorPanel
        bind:tab={ed.tab}
        dirty={ed.dirty}
        saveError={ed.saveError}
        onsave={() => ed.save()}
        ondiscard={() => { upgradeAccepted = false; ed.discard(); }}
        onsavejson={(json) => ed.saveJson(json)}
        getJson={() => ed.draft ? JSON.stringify(ed.draft, null, 2) : ed.lastSavedContent}
        extraTabs={[{ id: 'details', label: 'Details' }, { id: 'notes', label: 'GM-Notizen' }]}
        saveBarAllTabs
        style="--ep-accent: var(--arcane)"
      >
        {#snippet karte()}
          <CharacterSheetView {character} {itemIndex} {spellIndex} {spellAccessRows} {masteryOf} {masteryChips} />
        {/snippet}

        {#snippet bearbeiten()}
          <!-- Bei Last-/Verwerfen-Wechsel des Drafts neu aufsetzen, damit das Formular
               frisch aus dem Draft initialisiert (es mutiert ed.draft in place). -->
          {#if ed.draft}
            {#key ed.draft}
              <div class="edit-wrapper" style="width:100%">
                <!-- Das Formular zeigt den Schema-Rückstand der Datei zusammen mit allem
                     Nachverlinkbaren in EINEM Angebot — es kennt die Bibliotheks-Treffer. -->
                <CharacterEditForm bind:character={ed.draft} {dirPath} saved={savedCharacter}
                  {pendingUpgrade} {upgradeAccepted} onAcceptUpgrade={() => (upgradeAccepted = true)} />
              </div>
            {/key}
          {/if}
        {/snippet}

        {#snippet extra(id)}
        {#if id === 'notes'}
        <!-- GM-Notizen Tab -->
        <div class="freetext-area">
          <div class="freetext-hint">
            <span>Nur für den Spielleiter — wird nicht ans PDF angehängt.</span>
            <span class="freetext-status" class:unsaved={gmNotesSave.status === 'unsaved'} class:saving={gmNotesSave.status === 'saving'}>
              {gmNotesSave.status === 'saving' ? 'Speichert…' : gmNotesSave.status === 'unsaved' ? '● ungespeichert' : 'Gespeichert'}
            </span>
          </div>
          <RichTextEditor value={gmNotes} onChange={onGmNotesChange} placeholder="Hintergrund, Geheimnisse, Hooks, Verbindungen, DM-Notizen …" />
        </div>

      {:else}
        <!-- Details Tab (Freitext) — wird beim PDF-Export als weitere Seite(n) angehängt -->
        <div class="freetext-area">
          <div class="freetext-hint">
            <span>Wird beim PDF-Export als zusätzliche Seite(n) angehängt.</span>
            <span class="freetext-status" class:unsaved={freitextSave.status === 'unsaved'} class:saving={freitextSave.status === 'saving'}>
              {freitextSave.status === 'saving' ? 'Speichert…' : freitextSave.status === 'unsaved' ? '● ungespeichert' : 'Gespeichert'}
            </span>
          </div>
          <RichTextEditor value={freitext} onChange={onFreitextChange} placeholder="Hintergrundgeschichte, Tagebuch, Notizen … – wird ans PDF angehängt." />
        </div>
        {/if}
        {/snippet}
      </EditorPanel>

      <div
        class="resize-handle"
        class:hidden={featsCollapsed}
        role="separator"
        aria-label="Merkmals-Leiste verbreitern"
        onmousedown={startFeatResize}
      ></div>

      <div class="feat-wrap" class:no-transition={featsDragging} style="width: {effFeatWidth}px">
        <!-- Neuaufbau beim CHARAKTERwechsel, nicht bei jedem Draft-Swap: sonst steht die
             Bibliotheksauflösung des vorigen Charakters noch, während die neue läuft, und
             ein alter Wahl-Platz gegen das neue Ledger meldet „1 offene Entscheidung". -->
        {#key dirPath}
          {#if ed.draft}
            <CharacterFeaturePanel character={ed.draft} saved={savedCharacter}
              onApplyChanges={applyChoiceGrants}
              bind:badge={featBadge} bind:openCount={featOpenCount} />
          {/if}
        {/key}
      </div>

      <button
        class="feat-toggle"
        class:no-transition={featsDragging}
        style="right: {effFeatWidth}px"
        onclick={toggleFeats}
        title={featBadge?.title || (featsCollapsed ? 'Merkmals-Leiste öffnen' : 'Merkmals-Leiste schließen')}
        aria-label={featsCollapsed ? 'Merkmals-Leiste öffnen' : 'Merkmals-Leiste schließen'}
      >
        <span class="ft-arrow">{featsCollapsed ? '☰' : '›'}</span>
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

  /* ─── Hülle unter dem Header: Tab-Bereich + Merkmals-Leiste ──────────── */
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

  /* Lasche am linken Rand der Leiste. Nicht auf halber Höhe: bei zugeklapptem
     KI-Panel säße sie sonst genau unter dessen Lasche. */
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

  /* Freitext */
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
