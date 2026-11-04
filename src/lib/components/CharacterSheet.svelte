<script lang="ts">
  import { createCharacterEditor } from '../services/characterEditor.svelte';
  import { createCharacterSideFiles } from '../services/characterSideFiles.svelte';
  import { createCharacterPortrait } from '../services/characterPortrait.svelte';
  import { createCharacterGallery } from '../services/characterGallery.svelte';
  import { createFormLibraries } from '../services/characterFormLibraries.svelte';
  import { createPanelLayout } from '../utils/panelLayout.svelte';
  import { masteryLabel } from '../itemLabels';
  import { deleteActiveEntry } from '../services/deleteEntry';
  import { arrivalReader, registerViewState } from '../services/viewState';
  import { onMount, untrack } from 'svelte';
  import type { CoverageBadge } from '../services/declarationCoverage';
  import type { EditSectionId } from '../services/characterEditSections';
  import EditorPanel from './EditorPanel.svelte';
  import CharacterEditForm from './CharacterEditForm.svelte';
  import ModelSheetView from './character/ModelSheetView.svelte';
  import { createCharacterSheetModel } from '../services/characterSheetModel.svelte';
  import SheetHeader from './character/SheetHeader.svelte';
  import SheetFeatureSidebar from './character/SheetFeatureSidebar.svelte';
  import SheetFreetextTab from './character/SheetFreetextTab.svelte';
  import CharacterImagesTab from './character/CharacterImagesTab.svelte';
  import SheetPrintDialog from './character/SheetPrintDialog.svelte';
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

  const model = createCharacterSheetModel(() => character ?? null, libs);
  const spellcasting = $derived(model.spellcasting);

  const side = createCharacterSideFiles({
    dirPath: () => dirPath,
    characterName: () => character?.name ?? '',
    portraitFile: () => character?.portraitFile,
    companionImageFile: () => character?.companion?.imageFile,
    figureFile: () => character?.figureFile,
  });
  const portraitUrl = createCharacterPortrait({ character: () => character, ownUrl: () => side.portraitUrl });
  const gallery = createCharacterGallery({ dirPath: () => dirPath, character: () => ed.draft });

  const feats = createPanelLayout({ key: 'char-features', min: 240, max: 720, initial: 360, side: 'right' });
  let featBadge = $state<CoverageBadge | null>(null);
  let featOpenCount = $state(0);
  let showLevelUp = $state(false);
  let showPrint = $state(false);
  let editSection = $state<EditSectionId>('general');
  const readSection = arrivalReader('characterSection');
  onMount(() => registerViewState('characterSection', () => editSection));
  $effect(() => {
    void dirPath;
    untrack(() => {
      const arrived = readSection();
      if (arrived) editSection = arrived.value ?? 'general';
    });
  });
</script>

<div class="sheet">
  {#if character}
    <SheetHeader {character} portraitUrl={portraitUrl()}
      onPrint={() => (showPrint = true)} onLevelUp={() => (showLevelUp = true)}
      onDelete={() => deleteActiveEntry(character!.name)} />

    {#if showPrint}
      <SheetPrintDialog onclose={() => (showPrint = false)}
        input={{
          character,
          portraitUrl: portraitUrl(),
          companionImageUrl: side.companionImageUrl,
          figureUrl: side.figureUrl,
          freetext: side.details,
          images: gallery.printed,
          masteryOf: (n) => { const m = model.masteryOf(n); return m ? masteryLabel(m) : undefined; },
          loaded: spellcasting,
        }} />
    {/if}

    {#if showLevelUp && ed.draft}
      <LevelUpAssistant character={ed.draft} applyContext={editor.applyContext} onApply={editor.applyLevelUp} onclose={() => (showLevelUp = false)} />
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
        extraTabs={[{ id: 'details', label: 'Details' }, { id: 'images', label: 'Bilder' }, { id: 'notes', label: 'GM-Notizen' }]}
        saveBarAllTabs
        style="--ep-accent: var(--arcane)"
      >
        {#snippet karte()}
          <ModelSheetView {model} companionImageUrl={side.companionImageUrl} figureUrl={side.figureUrl} />
        {/snippet}

        {#snippet bearbeiten()}
          <!-- Remount bei Draft-Wechsel: das Formular initialisiert nur einmal aus dem
               Draft und mutiert ihn danach in place. -->
          {#if ed.draft}
            {#key ed.draft}
              <div class="edit-wrapper" style="width:100%">
                <CharacterEditForm bind:character={ed.draft} bind:section={editSection} {dirPath} {libs} saved={editor.saved}
                  pendingUpgrade={editor.pendingUpgrade} upgradeAccepted={editor.upgradeAccepted}
                  onAcceptUpgrade={editor.acceptUpgrade} />
              </div>
            {/key}
          {/if}
        {/snippet}

        {#snippet extra(id)}
        {#if id === 'images'}
        <CharacterImagesTab {gallery} />
      {:else if id === 'notes'}
        <SheetFreetextTab value={side.gmNotes} onChange={side.onGmNotesChange} status={side.gmNotesStatus}
          hint="Nur für den Spielleiter — steht nicht auf dem Charakterbogen."
          placeholder="Hintergrund, Geheimnisse, Hooks, Verbindungen, DM-Notizen …" />
      {:else}
        <SheetFreetextTab value={side.details} onChange={side.onDetailsChange} status={side.detailsStatus}
          hint="Im Druck-Dialog als Abschnitt „Notizen“ der Merkmalsseite wählbar."
          placeholder="Hintergrundgeschichte, Tagebuch, Notizen …" />
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

  .loading {
    padding: 2rem;
    color: var(--ink-muted);
    text-align: center;
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
</style>
