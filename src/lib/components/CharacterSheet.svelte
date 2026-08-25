<script lang="ts">
  import { createCharacterEditor } from '../services/characterEditor.svelte';
  import { createCharacterSideFiles } from '../services/characterSideFiles.svelte';
  import { createFormLibraries } from '../services/characterFormLibraries.svelte';
  import { createFeaturePanelLayout } from '../utils/featurePanelLayout.svelte';
  import { matchItem } from '../itemLibrary';
  import { masteryLabel } from '../itemLabels';
  import { coversWeapon, weaponNameSet } from '../services/weaponProficiency';
  import { createFormCasting } from '../services/characterFormCasting.svelte';
  import type { Character } from '../schemas/characterSchema';
  import type { WeaponMastery } from '../schemas/vocabulary';
  import type { CoverageBadge } from '../services/declarationCoverage';
  import EditorPanel from './EditorPanel.svelte';
  import CharacterEditForm from './CharacterEditForm.svelte';
  import CharacterSheetView from './character/CharacterSheetView.svelte';
  import SheetHeader from './character/SheetHeader.svelte';
  import SheetFeatureSidebar from './character/SheetFeatureSidebar.svelte';
  import SheetFreetextTab from './character/SheetFreetextTab.svelte';
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

  /**
   * Der Schnappschuss ist die Abhängigkeit: das Formular schreibt mit `Object.assign` IN den
   * Draft, ein Lesen der bloßen Referenz bliebe damit auf dem Ladestand stehen — Karte und
   * Druck zeigten die alte Zauberwahl bis zum Neuladen.
   */
  const casting = createFormCasting(() => (character ? ($state.snapshot(character) as Character) : null));
  const spellcasting = $derived(casting.current);

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
    companionImageFile: () => character?.companion?.imageFile,
  });

  const feats = createFeaturePanelLayout();
  let featBadge = $state<CoverageBadge | null>(null);
  let featOpenCount = $state(0);
  let showLevelUp = $state(false);
  let showPrint = $state(false);
</script>

<div class="sheet">
  {#if character}
    <SheetHeader {character} portraitUrl={side.portraitUrl}
      onPrint={() => (showPrint = true)} onLevelUp={() => (showLevelUp = true)} />

    {#if showPrint}
      <SheetPrintDialog onclose={() => (showPrint = false)}
        input={{
          character,
          portraitUrl: side.portraitUrl,
          companionImageUrl: side.companionImageUrl,
          freetext: side.details,
          masteryOf: (n) => { const m = masteryOf(n); return m ? masteryLabel(m) : undefined; },
          loaded: spellcasting,
        }} />
    {/if}

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
            {spellcasting} {masteryOf} {masteryChips} companionImageUrl={side.companionImageUrl} />
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
