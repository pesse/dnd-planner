<script lang="ts">
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
  import CharacterSheetView from './character/CharacterSheetView.svelte';
  import SheetHeader from './character/SheetHeader.svelte';
  import SheetFeatureSidebar from './character/SheetFeatureSidebar.svelte';
  import SheetFreetextTab from './character/SheetFreetextTab.svelte';
  import LevelUpAssistant from './LevelUpAssistant.svelte';

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
        mods: c.mods,
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
    <SheetHeader {character} portraitUrl={side.portraitUrl} {pdf} onLevelUp={() => (showLevelUp = true)} />

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
        <SheetFreetextTab value={side.gmNotes} onChange={side.onGmNotesChange} status={side.gmNotesStatus}
          hint="Nur für den Spielleiter — wird nicht ans PDF angehängt."
          placeholder="Hintergrund, Geheimnisse, Hooks, Verbindungen, DM-Notizen …" />
      {:else}
        <SheetFreetextTab value={side.details} onChange={side.onDetailsChange} status={side.detailsStatus}
          hint="Wird beim PDF-Export als zusätzliche Seite(n) angehängt."
          placeholder="Hintergrundgeschichte, Tagebuch, Notizen … – wird ans PDF angehängt." />
        {/if}
        {/snippet}
      </EditorPanel>

      <SheetFeatureSidebar {feats} {dirPath} draft={ed.draft} saved={editor.saved}
        applyContext={editor.applyContext} onApplyChanges={editor.apply}
        bind:badge={featBadge} bind:openCount={featOpenCount} />
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

  .edit-wrapper {
    min-height: 0;
  }

  .sheet-body {
    flex: 1;
    min-height: 0;
    display: flex;
    position: relative;   /* Bezug der absolut positionierten Lasche */
  }
</style>
