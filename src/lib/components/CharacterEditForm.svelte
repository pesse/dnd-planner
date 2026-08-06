<script lang="ts">
  import { SKILL_DEFS, skillSheetKey } from '../domain/skills';
  import type { Character } from '../schemas/characterSchema';
  import type { SkillName } from '../schemas/vocabulary';
  import type { PendingCharacterUpgrade } from '../schemas/characterUpgrades';
  import {
    collectLegacyFixes,
    type LegacyFix, type LegacyFixKind, type LegacyLinkTarget, type LegacyLinkLibraries,
  } from '../services/characterLegacyLinks';
  import { collectGrants, type CollectedGrants } from '../services/proficiencyGrants';
  import { masteryOffer, type MasteryOffer } from '../services/weaponMastery';
  import { matchItem } from '../itemLibrary';
  import { abilityMods, attackContext, computeSkills } from '../services/characterFormFields';
  import { abilityKeyOf } from '../schemas/abilities';
  import { createCharacterFormState } from '../services/characterFormState.svelte';
  import { castingInput, createFormCasting } from '../services/characterFormCasting.svelte';
  import type { FormLibraries } from '../services/characterFormLibraries.svelte';
  import { classifyChange, diffMark, type DiffDir } from '../utils/diffHighlight';
  import WeaponMasteryPicker from './WeaponMasteryPicker.svelte';
  import UpgradeBanner from './characterForm/UpgradeBanner.svelte';
  import GeneralSection from './characterForm/GeneralSection.svelte';
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

  // `character.features` spiegelt das Formular NICHT zurück: das Ledger gehört der
  // Merkmals-Seitenleiste. Genau ein Schreiber — sonst überschriebe der nächste
  // Tastendruck hier jede Leisten-Änderung.
  let { character = $bindable(), dirPath, libs, saved, pendingUpgrade, upgradeAccepted = false, onAcceptUpgrade }: {
    character: Character;
    dirPath: string;
    /** Vom Bogen gehalten, nicht hier erzeugt: das Formular wird bei jedem Draft-Swap neu montiert. */
    libs: FormLibraries;
    saved?: Character | null;
    /** Schema-Rückstand der DATEI, nicht des Drafts. */
    pendingUpgrade?: PendingCharacterUpgrade | null;
    upgradeAccepted?: boolean;
    onAcceptUpgrade?: () => void;
  } = $props();

  const mirror = createCharacterFormState(() => character);
  const form = mirror.fields;

  const mods = $derived(abilityMods(form));
  const skills = $derived(computeSkills(form));

  // Angriffe entstehen an zwei Stellen: im Waffen-Picker der Angriffstabelle und am ⚔ einer
  // Inventarzeile — beide rechnen mit demselben Kontext.
  const weaponCtx = $derived({
    ...attackContext(form),
    proficiencies: form.proficiencies,
    weaponByName: (n: string) => matchItem(libs.itemIndex, { name: n }),
  });

  const dirOf = (o: unknown, n: unknown): DiffDir => (saved ? classifyChange(o, n) : 'none');

  // Der offene Picker liegt in GeneralSection, nicht hier — `applyFix` schließt ihn
  // über dieselben `$bindable`-Felder.
  let editingClassRow = $state(-1);
  let editingSpecies = $state(!form.species.sourceKey && !form.species.name.trim());
  let editingBackground = $state(!form.backgroundRef.sourceKey && !form.backgroundRef.name.trim());

  // Im Editor NUR Herkunfts-ANZEIGE (◆) — das aktive „Übernehmen" gehört in
  // Erstellung und Level-Up.
  let grants = $state<CollectedGrants | null>(null);

  // Nur die LINKS sind Abhängigkeit — nicht die Häkchen, sonst lüde es bei jedem Klick neu.
  // Die Talent-Links kommen aus dem Draft, damit die ◆-Marker nachziehen, sobald die
  // Seitenleiste ein Talent ergänzt; kein Read-after-Write, sie schreibt hier nichts.
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

  function grantSourcesFor(entries: { value: string; source: { label: string } }[] | undefined, value: string): string {
    return (entries ?? []).filter((e) => e.value === value).map((e) => e.source.label).join(' · ');
  }

  // Anders als beim Grant-Panel sind die Übungs-Häkchen hier EINGABE: ein Klick auf
  // „Kriegswaffen" ändert die wählbaren Waffen sofort.
  let mastery = $state<MasteryOffer | null>(null);

  const masteryInput = $derived.by(() => ({
    classes: form.classes.map((c) => ({ sourceKey: c.sourceKey, name: c.name, level: c.level })),
    proficiencies: {
      simpleWeapons: form.proficiencies.simpleWeapons,
      martialWeapons: form.proficiencies.martialWeapons,
      individualWeapons: [...form.proficiencies.individualWeapons],
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

  // Der Zauberblock UND der Umzug der Altform lesen dieselbe Auflösung.
  const casting = createFormCasting(() => castingInput(form, character.features ?? [], character.spells));

  // Erkennung UND Verlinkung liegen in `services/characterLegacyLinks.ts`; hier bleiben
  // nur der mutierte Zustand und der UI-Nachlauf.
  const legacyTarget = $derived<LegacyLinkTarget>({
    classes: form.classes,
    legacyClassLevel: mirror.legacyClassLevel,
    species: form.species,
    backgroundRef: form.backgroundRef,
    inventory: form.inventory,
    spells: character.spells,
    dropSpells: () => { delete character.spells; },
    spellcasting: form.spellcasting,
    proficiencies: form.proficiencies,
    attacks: form.attacks,
    weaponCtx,
  });
  const legacyLibraries = $derived<LegacyLinkLibraries>({
    classes: libs.classes, species: libs.species, backgrounds: libs.backgrounds,
    items: libs.itemIndex, casting: casting.current,
  });
  const legacyFixes = $derived(collectLegacyFixes(legacyTarget, legacyLibraries));
  const fixOf = (kind: LegacyFixKind) => legacyFixes.find((f) => f.kind === kind);

  /** `race`/`background` sind abgeleitete Anzeige-Strings — auch fürs PDF. */
  function applyFix(fix: LegacyFix | undefined) {
    if (!fix) return;
    fix.apply();
    switch (fix.kind) {
      case 'classes': editingClassRow = -1; break;
      case 'species': form.race = form.species.name; editingSpecies = false; break;
      case 'background': form.background = form.backgroundRef.name; editingBackground = false; break;
      case 'spells': form.spellcasting = { ...form.spellcasting }; break;
    }
  }

  /**
   * Der Schema-Stempel der DATEI fasst den Draft nicht an und läuft darum über
   * `onAcceptUpgrade`, sonst bliebe die Speichern-Leiste unerreichbar.
   */
  function applyAllFixes() {
    for (const fix of legacyFixes) applyFix(fix);
    if (pendingUpgrade) onAcceptUpgrade?.();
  }
</script>

<div class="edit-form">
  <UpgradeBanner {pendingUpgrade} {upgradeAccepted} fixLabels={legacyFixes.map((f) => f.label)} onapply={applyAllFixes} />

  <GeneralSection
    {form} {saved} {dirOf} {libs} {fixOf} onApplyFix={applyFix}
    bind:editingClassRow bind:editingSpecies bind:editingBackground
  />

  <section>
    <h3>Attribute</h3>
    <AttributeRow
      bind:abilities={form.abilities}
      dirOf={(key, value) => dirOf(saved?.abilities?.[key], value)}
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
      bind:saveProfs={form.saveProfs}
      {mods}
      proficiencyBonus={form.proficiencyBonus}
      sourceOf={(key) => grantSourcesFor(
        grants?.savingThrows?.map((g) => ({ ...g, value: abilityKeyOf(g.value) ?? g.value })),
        key,
      )}
      dirOf={(field, value) => dirOf(saved?.saveProfs?.[field], value)}
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
      weaponItems={libs.weapons}
      itemIndex={libs.itemIndex}
      sourceOf={(kind, value) => grantSourcesFor(kind === 'weapons' ? grants?.weapons : grants?.armor, value)}
      {dirOf}
    />
  </section>

  <section>
    <h3>Angriffe</h3>
    <AttackTable attacks={form.attacks} ctx={weaponCtx} {saved}
      fixLabel={fixOf('attacks')?.label}
      onfix={() => applyFix(fixOf('attacks'))}
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
      attacks={form.attacks}
      attackCtx={weaponCtx}
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
      casting={casting.current}
      spellLibrary={libs.spells}
      {saved}
      fixLabel={fixOf('spells')?.label}
      onfix={() => applyFix(fixOf('spells'))}
      onlibraryreload={() => libs.reloadSpells()}
    />
  </section>
</div>
