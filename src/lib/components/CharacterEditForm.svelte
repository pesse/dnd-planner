<script lang="ts">
  import { activeFile } from '../stores/campaign';
  import { confirmNavigation } from '../stores/navigationGuard';
  import { SKILL_DEFS, skillSheetKey } from '../domain/skills';
  import { formatClassLevel } from '../schemas/classLevelText';
  import type { Character } from '../schemas/characterSchema';
  import type { SkillName } from '../schemas/vocabulary';
  import type { PendingCharacterUpgrade } from '../schemas/characterUpgrades';
  import {
    collectLegacyFixes,
    type LegacyFix, type LegacyFixKind, type LegacyLinkTarget, type LegacyLinkLibraries,
  } from '../services/characterLegacyLinks';
  import { collectGrants, type CollectedGrants } from '../services/proficiencyGrants';
  import { masteryOffer, type MasteryOffer } from '../services/weaponMastery';
  import { speciesDisplayName, searchSpecies, type SpeciesInfo } from '../speciesLibrary';
  import { backgroundDisplayName, searchBackgrounds, type BackgroundInfo } from '../backgroundsLibrary';
  import { abilityMods, attackContext, computeSkills } from '../services/characterFormFields';
  import { createCharacterFormState } from '../services/characterFormState.svelte';
  import { createFormLibraries } from '../services/characterFormLibraries.svelte';
  import { classifyChange, diffMark, type DiffDir } from '../utils/diffHighlight';
  import WeaponMasteryPicker from './WeaponMasteryPicker.svelte';
  import UpgradeBanner from './characterForm/UpgradeBanner.svelte';
  import RefBlock from './characterForm/RefBlock.svelte';
  import ClassLevelTable from './characterForm/ClassLevelTable.svelte';
  import AttributeRow from './characterForm/AttributeRow.svelte';
  import CombatFields from './characterForm/CombatFields.svelte';
  import SavingThrowGrid from './characterForm/SavingThrowGrid.svelte';
  import SkillGrid from './characterForm/SkillGrid.svelte';
  import AttackTable from './characterForm/AttackTable.svelte';
  import FeatureTextFields from './characterForm/FeatureTextFields.svelte';
  import PortraitField from './characterForm/PortraitField.svelte';
  import PersonalFields from './characterForm/PersonalFields.svelte';
  import TagEditor from './characterForm/TagEditor.svelte';
  import ProficiencyFields from './characterForm/ProficiencyFields.svelte';
  import CurrencyRow from './characterForm/CurrencyRow.svelte';
  import InventoryTable from './characterForm/InventoryTable.svelte';
  import SpellBlock from './characterForm/SpellBlock.svelte';
  import './characterForm/form.css';

  // `character` ist der ed.draft-Proxy aus CharacterSheet. Das Formular pflegt seinen
  // eigenen Zustand und spiegelt ihn über `createCharacterFormState` in den Draft zurück
  // (kein eigener Speichern-Knopf — das übernimmt die EditorPanel-Save-Bar).
  //
  // `character.features` gehört NICHT dazu: das Merkmals-Ledger besitzt die
  // Merkmals-Seitenleiste (`CharacterFeaturePanel`). Genau ein Schreiber — sonst
  // überschriebe der nächste Tastendruck hier jede Leisten-Änderung.
  let { character = $bindable(), dirPath, saved, pendingUpgrade, upgradeAccepted = false, onAcceptUpgrade }: {
    character: Character;
    dirPath: string;
    saved?: Character | null;
    /** Schema-Rückstand der DATEI (aus CharacterSheet) — Teil des Umstellungs-Hinweises oben. */
    pendingUpgrade?: PendingCharacterUpgrade | null;
    upgradeAccepted?: boolean;
    onAcceptUpgrade?: () => void;
  } = $props();

  const mirror = createCharacterFormState(() => character);
  const form = mirror.fields;
  const libs = createFormLibraries();

  const mods = $derived(abilityMods(form));
  const skills = $derived(computeSkills(form));
  const classLevelPreview = $derived(formatClassLevel(form.classes));

  // Diff-Highlighting: vergleicht ein Quell-Feld gegen die gespeicherte Version.
  // Ohne Baseline (neuer/nie gespeicherter Charakter) → keine Hervorhebung.
  const dirOf = (o: unknown, n: unknown): DiffDir => (saved ? classifyChange(o, n) : 'none');
  const savedField = (key: string): unknown => (saved as Record<string, unknown> | null | undefined)?.[key];

  // Welcher Picker offen steht, liegt hier und nicht im Unterformular: `applyFix`
  // schließt ihn beim Nachziehen.
  let editingClassRow = $state(-1);
  let editingSpecies = $state(!form.species.sourceKey && !form.species.name.trim());
  let editingBackground = $state(!form.backgroundRef.sourceKey && !form.backgroundRef.name.trim());

  async function openLibraryPage(path: string | undefined, type: 'species' | 'background') {
    if (!path) return;
    if (!(await confirmNavigation())) return; // ungespeicherte Charakter-Änderungen
    activeFile.set({ name: path.split('/').pop()!.replace('.json', ''), path, type });
  }

  function selectSpecies(info: SpeciesInfo) {
    form.species.name = speciesDisplayName(info);
    form.species.sourceKey = info.key ?? '';
    form.species.subspeciesKey = undefined;
    form.species.subspeciesName = undefined;
    form.race = form.species.name;
    editingSpecies = false;
  }

  function selectBackground(info: BackgroundInfo) {
    form.backgroundRef.name = backgroundDisplayName(info);
    form.backgroundRef.sourceKey = info.key ?? '';
    form.background = form.backgroundRef.name;
    editingBackground = false;
  }

  // Übungs-Grants aus den Bibliotheks-Links: deterministisch abgeleitet (Hintergrund +
  // Startklasse + Mehrklassen + Spezies-Merkmale + Talente). Im Editor NUR Herkunfts-
  // ANZEIGE (◆) — das aktive „Übernehmen" gehört in Erstellung/Level-Up.
  let grants = $state<CollectedGrants | null>(null);

  // Nur die LINKS sind Abhängigkeit — nicht die Häkchen, sonst lüde es bei jedem Klick neu.
  // Die Talent-Links kommen direkt aus dem Draft (die Seitenleiste pflegt sie): so ziehen
  // die ◆-Herkunftsmarker nach, sobald dort ein Talent dazukommt. Kein Read-after-Write,
  // weil der Rückschreib-Effekt `features` nicht schreibt.
  const grantLinks = $derived.by(() => ({
    classes: form.classes.map((c) => ({ sourceKey: c.sourceKey, name: c.name, subclassKey: c.subclassKey })),
    species: { sourceKey: form.species.sourceKey, subspeciesKey: form.species.subspeciesKey },
    backgroundRef: { sourceKey: form.backgroundRef.sourceKey },
    features: character.features.filter((e) => !e.choice.trim()).map((f) => ({ sourceKey: f.sourceKey, name: f.name })),
  }));

  $effect(() => {
    const input = grantLinks;
    let cancelled = false;
    void collectGrants(input)
      .then((g) => { if (!cancelled) grants = g; })
      .catch(() => { if (!cancelled) grants = null; });
    return () => { cancelled = true; };
  });

  /** Herkunfts-Marker je Bogen-Fertigkeit: „Soldat", „Schurke (Wahl)", … */
  const grantMarks = $derived.by(() => {
    const marks = new Map<string, string[]>();
    const add = (en: SkillName, label: string) => {
      const key = skillSheetKey(en);
      marks.set(key, [...(marks.get(key) ?? []), label]);
    };
    for (const g of grants?.skills ?? []) add(g.value, g.source.label);
    for (const c of grants?.choices ?? []) {
      const options = c.from.length ? c.from : SKILL_DEFS.map((d) => d.en);
      for (const en of options) add(en, `${c.source.label} (Wahl)`);
    }
    return marks;
  });

  /** Herkunfts-Labels zu einem gewährten Wert („Schurke · Soldat"); leer = kein Grant. */
  function grantSourcesFor(entries: { value: string; source: { label: string } }[] | undefined, value: string): string {
    return (entries ?? []).filter((e) => e.value === value).map((e) => e.source.label).join(' · ');
  }

  // Waffenbeherrschung (5e 2024): anders als beim Grant-Panel sind die Übungs-HÄKCHEN
  // hier Eingabe — „zwei Waffenarten deiner Wahl, in denen du geübt bist". Ein Klick auf
  // „Kriegswaffen" darf die Auswahlmenge sofort ändern; teuer ist das nicht, weil der
  // Item-Index gecacht ist.
  let mastery = $state<MasteryOffer | null>(null);

  const masteryInput = $derived.by(() => ({
    classes: form.classes.map((c) => ({ sourceKey: c.sourceKey, name: c.name, level: c.level })),
    proficiencies: {
      simpleWeapons: form.proficiencies.simpleWeapons,
      martialWeapons: form.proficiencies.martialWeapons,
    },
  }));

  $effect(() => {
    const input = masteryInput;
    let cancelled = false;
    void masteryOffer(input)
      .then((o) => { if (!cancelled) mastery = o; })
      .catch(() => { if (!cancelled) mastery = null; });
    return () => { cancelled = true; };
  });

  // Nachziehbarer Altbestand: Erkennung UND Verlinkung liegen in
  // `services/characterLegacyLinks.ts`; hier bleiben nur der Zustand, den es mutiert,
  // und der UI-Nachlauf (Anzeige-Spiegel, offene Picker).
  const legacyTarget = $derived<LegacyLinkTarget>({
    classes: form.classes,
    legacyClassLevel: mirror.legacyClassLevel,
    species: form.species,
    backgroundRef: form.backgroundRef,
    inventory: form.inventory,
    cantrips: form.spells.cantrips,
    spellsByLevel: form.spells.byLevel,
  });
  const legacyLibraries = $derived<LegacyLinkLibraries>({
    classes: libs.classes, species: libs.species, backgrounds: libs.backgrounds,
    items: libs.itemIndex, spells: libs.spellIndex,
  });
  const legacyFixes = $derived(collectLegacyFixes(legacyTarget, legacyLibraries));
  const fixOf = (kind: LegacyFixKind) => legacyFixes.find((f) => f.kind === kind);

  /**
   * Zieht ein Angebot nach und räumt hinterher die UI auf: `race`/`background` sind
   * abgeleitete Anzeige-Strings (auch fürs PDF), und ein frisch verlinktes Feld soll als
   * Bibliotheks-Link statt als offener Picker erscheinen.
   */
  function applyFix(fix: LegacyFix | undefined) {
    if (!fix) return;
    fix.apply();
    switch (fix.kind) {
      case 'classes': editingClassRow = -1; break;
      case 'species': form.race = form.species.name; editingSpecies = false; break;
      case 'background': form.background = form.backgroundRef.name; editingBackground = false; break;
    }
  }

  /**
   * Sammel-Aktion des Hinweises oben: alles Nachziehbare auf einmal. Der Schema-Stempel
   * der DATEI fasst den Draft nicht an und läuft darum über `onAcceptUpgrade` beim
   * Eltern-Editor, sonst bliebe die Speichern-Leiste unerreichbar.
   */
  function applyAllFixes() {
    for (const fix of legacyFixes) applyFix(fix);
    if (pendingUpgrade) onAcceptUpgrade?.();
  }
</script>

<div class="edit-form">
  <!-- Speichern/Verwerfen übernimmt die EditorPanel-Save-Bar (kein eigener Button). -->
  <UpgradeBanner {pendingUpgrade} {upgradeAccepted} fixLabels={legacyFixes.map((f) => f.label)} onapply={applyAllFixes} />

  <section>
    <h3>Allgemein</h3>
    <div class="grid-2">
      <label use:diffMark={dirOf(saved?.name, form.name)}>Name<input bind:value={form.name} placeholder="Charaktername" /></label>
      <label use:diffMark={dirOf(saved?.playerName, form.playerName)}>Spieler<input bind:value={form.playerName} placeholder="Spielername" /></label>
      <label use:diffMark={dirOf(saved?.xp, form.xp)}>EP<input bind:value={form.xp} placeholder="0" /></label>
    </div>

    <RefBlock
      title="Hintergrund"
      kindLabel="Hintergrund"
      name={form.backgroundRef.name}
      sourceKey={form.backgroundRef.sourceKey}
      placeholder="z.B. Soldat"
      editTitle="Hintergrund ändern"
      diff={dirOf(saved?.background, form.background)}
      hasFix={!!fixOf('background')}
      onfix={() => applyFix(fixOf('background'))}
      editing={editingBackground}
      search={(q) => searchBackgrounds(libs.backgrounds, q, 8)}
      label={backgroundDisplayName}
      onopen={() => openLibraryPage(libs.backgrounds.find((b) => b.key === form.backgroundRef.sourceKey)?.path, 'background')}
      oninput={(v) => { form.backgroundRef.name = v; form.background = v; form.backgroundRef.sourceKey = ''; }}
      onselect={selectBackground}
      onediting={(v) => (editingBackground = v)}
    />

    <RefBlock
      title="Volk"
      kindLabel="Volk"
      name={form.species.name}
      sourceKey={form.species.sourceKey}
      placeholder="z.B. Zwerg"
      editTitle="Volk ändern"
      diff={dirOf(saved?.race, form.race)}
      hasFix={!!fixOf('species')}
      onfix={() => applyFix(fixOf('species'))}
      editing={editingSpecies}
      search={(q) => searchSpecies(libs.species, q, 8)}
      label={speciesDisplayName}
      onopen={() => openLibraryPage(libs.species.find((s) => s.key === form.species.sourceKey)?.path, 'species')}
      oninput={(v) => { form.species.name = v; form.race = v; form.species.sourceKey = ''; }}
      onselect={selectSpecies}
      onediting={(v) => (editingSpecies = v)}
    />

    <ClassLevelTable
      classes={form.classes}
      classIndex={libs.classes}
      diff={dirOf(saved?.classLevel, classLevelPreview)}
      fixLabel={fixOf('classes')?.label}
      onfix={() => applyFix(fixOf('classes'))}
      editingRow={editingClassRow}
      oneditingRow={(row) => (editingClassRow = row)}
    />
  </section>

  <section>
    <h3>Attribute</h3>
    <AttributeRow
      bind:str={form.str} bind:ges={form.ges} bind:kon={form.kon}
      bind:int={form.int} bind:wei={form.wei} bind:cha={form.cha}
      dirOf={(key, value) => dirOf(savedField(key), value)}
    />
  </section>

  <section>
    <h3>Kampfwerte</h3>
    <CombatFields
      bind:ac={form.ac} bind:initiative={form.initiative} bind:speed={form.speed}
      bind:hitDice={form.hitDice} bind:hpMax={form.hpMax} bind:hpCurrent={form.hpCurrent}
      bind:hpTemp={form.hpTemp} bind:proficiencyBonus={form.proficiencyBonus}
      {saved} {dirOf}
    />
  </section>

  <section>
    <h3>Rettungswürfe (Übungen)</h3>
    <SavingThrowGrid
      bind:strSaveProf={form.strSaveProf} bind:gesSaveProf={form.gesSaveProf} bind:konSaveProf={form.konSaveProf}
      bind:intSaveProf={form.intSaveProf} bind:weiSaveProf={form.weiSaveProf} bind:chaSaveProf={form.chaSaveProf}
      {mods}
      proficiencyBonus={form.proficiencyBonus}
      sourceOf={(en) => grantSourcesFor(grants?.savingThrows, en)}
      dirOf={(field, value) => dirOf(savedField(field), value)}
    />
  </section>

  <section>
    <h3>Fertigkeiten</h3>
    <SkillGrid
      skillFlags={form.skillFlags}
      bind:alleskoenner={form.alleskoenner}
      computed={skills}
      {grantMarks}
      {saved}
      {dirOf}
    />
  </section>

  <section>
    <h3>Angriffe</h3>
    <AttackTable
      attacks={form.attacks}
      ctx={{
        ...attackContext(form),
        simpleWeapons: form.proficiencies.simpleWeapons,
        martialWeapons: form.proficiencies.martialWeapons,
      }}
      weaponItems={libs.weapons}
      {saved}
    />
  </section>

  <!-- Direkt bei den Angriffen, weil die Wahl nach jeder langen Rast wechseln kann —
       kein Vorschlag wie im Grant-Panel: das hier IST die Wahl. -->
  {#if mastery && mastery.allowance > 0}
    <section>
      <WeaponMasteryPicker
        offer={mastery}
        bind:masteries={form.masteries}
        diff={dirOf(saved?.masteries, $state.snapshot(form.masteries))}
      />
    </section>
  {/if}

  <section>
    <FeatureTextFields
      {character}
      bind:classFeatures={form.classFeatures}
      bind:speciesTraits={form.personal.rassenmerkmale}
      {saved} {dirOf}
    />
  </section>

  <section>
    <h3>Persönlichkeit</h3>
    <div class="grid-2">
      <label use:diffMark={dirOf(saved?.traits, form.traits)}>Persönlichkeitsmerkmale<textarea bind:value={form.traits}></textarea></label>
      <label use:diffMark={dirOf(saved?.ideals, form.ideals)}>Ideale<textarea bind:value={form.ideals}></textarea></label>
      <label use:diffMark={dirOf(saved?.bonds, form.bonds)}>Bindungen<textarea bind:value={form.bonds}></textarea></label>
      <label use:diffMark={dirOf(saved?.flaws, form.flaws)}>Makel<textarea bind:value={form.flaws}></textarea></label>
    </div>
  </section>

  <section>
    <h3>Persönliches</h3>
    <div class="personal-grid">
      <PortraitField bind:portraitFile={form.portraitFile} {dirPath} diff={dirOf(saved?.portraitFile, form.portraitFile)} />
      <PersonalFields personal={form.personal} savedPersonal={saved?.personal} {dirOf} />
    </div>
    <label class="block-label" use:diffMark={dirOf(saved?.personal?.aussehen, form.personal.aussehen)}>
      Aussehen
      <textarea class="ta-small" bind:value={form.personal.aussehen} placeholder="Auffällige Merkmale, Kleidung, Statur…"></textarea>
    </label>
  </section>

  <section>
    <h3>Sprachen</h3>
    <TagEditor values={form.languages} placeholder="Sprache…" savedValues={saved?.languages} />

    <h3 style="margin-top:1rem">Werkzeuge &amp; Fahrzeuge</h3>
    <TagEditor values={form.tools} placeholder="Werkzeug…" savedValues={saved?.tools} />
  </section>

  <section>
    <h3>Übungen &amp; Rüstungsausbildung</h3>
    <ProficiencyFields
      proficiencies={form.proficiencies}
      savedProficiencies={saved?.proficiencies}
      sourceOf={(kind, value) => grantSourcesFor(kind === 'weapons' ? grants?.weapons : grants?.armor, value)}
      {dirOf}
    />
  </section>

  <section>
    <h3>Währung</h3>
    <CurrencyRow currency={form.currency} savedCurrency={saved?.currency} {dirOf} />
  </section>

  <section>
    <h3>Inventar</h3>
    <InventoryTable
      inventory={form.inventory}
      bind:inventoryNotes={form.inventoryNotes}
      itemIndex={libs.itemIndex}
      itemsByDir={libs.itemsByDir}
      {saved}
      fixLabel={fixOf('inventory')?.label}
      onfix={() => applyFix(fixOf('inventory'))}
      {dirOf}
    />
  </section>

  <section>
    <h3>Zauberwirken</h3>
    <SpellBlock
      {form}
      spellLibrary={libs.spells}
      spellIndex={libs.spellIndex}
      {saved}
      fixLabel={fixOf('spells')?.label}
      onfix={() => applyFix(fixOf('spells'))}
      {dirOf}
    />
  </section>
</div>
