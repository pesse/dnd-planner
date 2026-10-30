<script lang="ts">
  import { createCharacterEditor } from '../services/characterEditor.svelte';
  import { createCharacterSideFiles } from '../services/characterSideFiles.svelte';
  import { createCharacterPortrait } from '../services/characterPortrait.svelte';
  import { createCharacterGallery } from '../services/characterGallery.svelte';
  import { createFormLibraries } from '../services/characterFormLibraries.svelte';
  import { createFeaturePanelLayout } from '../utils/featurePanelLayout.svelte';
  import { matchItem } from '../itemLibrary';
  import { masteryLabel } from '../itemLabels';
  import { coversWeapon, weaponNameSet } from '../services/weaponProficiency';
  import { createFormCasting } from '../services/characterFormCasting.svelte';
  import { createCharacterAbilities } from '../services/characterAbilities.svelte';
  import { createHpBasis } from '../services/hitPointBasis.svelte';
  import { hpMaxTotal } from '../services/hitPoints';
  import { combatFallbacks, withCombatFallbacks } from '../services/combatFallbacks';
  import { effectiveProficiencyBonus } from '../services/classProgression';
  import { createArmorClassTip } from '../services/armorClassTip.svelte';
  import { createSavingThrows } from '../services/savingThrows.svelte';
  import { createOwnedGrantFeatures } from '../services/ownedGrantFeatures.svelte';
  import { attackFootnotes, declaredAttackEffects } from '../services/attackEffects';
  import { checkSources } from '../services/abilityChecks';
  import { characterDefenses } from '../services/defenses';
  import { wornItemsIn } from '../services/wornItems';
  import { characterMovement } from '../services/movement';
  import { declaredSpeed } from '../services/characterProperties';
  import type { AttackCalcContext } from '../services/attackCalc';
  import { mod } from '../domain/skills';
  import { abilityRecordOf } from '../schemas/abilities';
  import { hpDerivation } from '../services/hitPointDerivation';
  import { combatTips, hpTip, NO_COMBAT_TIPS } from '../services/characterSheetTips';
  import { deleteActiveEntry } from '../services/deleteEntry';
  import type { Character } from '../schemas/characterSchema';
  import type { WeaponMastery } from '../schemas/vocabulary';
  import type { CoverageBadge } from '../services/declarationCoverage';
  import type { EditSectionId } from '../services/characterEditSections';
  import EditorPanel from './EditorPanel.svelte';
  import CharacterEditForm from './CharacterEditForm.svelte';
  import CharacterSheetView from './character/CharacterSheetView.svelte';
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

  /**
   * Der Schnappschuss ist die Abhängigkeit: das Formular schreibt mit `Object.assign` IN den
   * Draft, ein Lesen der bloßen Referenz bliebe damit auf dem Ladestand stehen — Karte und
   * Druck zeigten die alte Zauberwahl bis zum Neuladen.
   */
  const casting = createFormCasting(() => (character ? ($state.snapshot(character) as Character) : null));
  const spellcasting = $derived(casting.current);

  const abilities = createCharacterAbilities(() => character ?? null, () => libs);
  const hpBasis = createHpBasis(
    () => character ?? { species: { sourceKey: '', name: '' }, classes: [], features: [], backgroundRef: { sourceKey: '', name: '' } },
    () => abilities.resolved.con,
  );
  const hpTipHtml = $derived(
    character && hpBasis.current ? hpTip(hpDerivation(character, hpBasis.current, abilities.resolved.con, hpBasis.sources)) : '',
  );

  const owned = createOwnedGrantFeatures(() => character ?? null);
  const acTip = createArmorClassTip(() => character ?? null, () => libs, () => abilities.resolved, () => owned.current);
  const fallbacks = $derived(character && combatFallbacks({
    ...character,
    acTotal: acTip.total,
    hpTotal: hpBasis.current && hpMaxTotal(character, hpBasis.current),
    features: owned.current,
    mods: abilityRecordOf((k) => mod(abilities.resolved[k].score)),
  }));
  const shown = $derived(character && fallbacks && withCombatFallbacks(character, fallbacks));
  const tips = $derived(character && fallbacks ? combatTips(character, fallbacks) : NO_COMBAT_TIPS);
  const defenses = $derived(owned.current && character ? characterDefenses(owned.current, effectiveProficiencyBonus(character), wornItemsIn(libs.itemIndex, character.inventory ?? [])) : []);
  const attackNotes = $derived(attackFootnotes(owned.current ?? []));
  const checks = $derived(checkSources(owned.current ?? []));
  const movement = $derived(owned.current ? characterMovement(owned.current, declaredSpeed(owned.current)?.feet ?? null) : []);
  const saving = createSavingThrows(() => character ?? null, () => libs, () => abilities.resolved, () => owned.current);
  const attackCtx = $derived<AttackCalcContext | null>(character && libs.itemsLoaded && owned.current ? {
    strMod: mod(abilities.resolved.str.score),
    dexMod: mod(abilities.resolved.dex.score),
    proficiencyBonus: effectiveProficiencyBonus(character),
    declared: declaredAttackEffects(libs.itemIndex, character.inventory ?? [], owned.current),
  } : null);

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
    figureFile: () => character?.figureFile,
  });
  const portraitUrl = createCharacterPortrait({ character: () => character, ownUrl: () => side.portraitUrl });
  const gallery = createCharacterGallery({ dirPath: () => dirPath, character: () => ed.draft });

  const feats = createFeaturePanelLayout();
  let featBadge = $state<CoverageBadge | null>(null);
  let featOpenCount = $state(0);
  let showLevelUp = $state(false);
  let showPrint = $state(false);
  let editSection = $state<EditSectionId>('general');
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
          masteryOf: (n) => { const m = masteryOf(n); return m ? masteryLabel(m) : undefined; },
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
          {#if saving.saves && shown}
          <CharacterSheetView character={shown} itemIndex={libs.itemIndex} spellIndex={libs.spellIndex}
            {spellcasting} {masteryOf} {masteryChips} companionImageUrl={side.companionImageUrl}
            figureUrl={side.figureUrl}
            abilities={abilities.resolved} combatTips={tips} {hpTipHtml} acTipHtml={acTip.html} {attackCtx}
            saves={saving.saves} deathSaveAdvantage={saving.deathSaveAdvantage} auras={saving.auras} {defenses} {movement}
            {attackNotes} {checks} />
          {/if}
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
