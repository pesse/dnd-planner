/** Alles, was der Bogen aus einem Charakter herleitet: einmal gerechnet für Bogenseite, Karten-Popup und Tisch-Block. */
import { matchItem } from '../itemLibrary';
import { coversWeapon, weaponNameSet } from './weaponProficiency';
import { createFormCasting } from './characterFormCasting.svelte';
import { createCharacterAbilities } from './characterAbilities.svelte';
import { createHpBasis } from './hitPointBasis.svelte';
import { hpMaxTotal } from './hitPoints';
import { combatFallbacks, withCombatFallbacks } from './combatFallbacks';
import { effectiveProficiencyBonus } from './classProgression';
import { createArmorClassTip } from './armorClassTip.svelte';
import { createSavingThrows } from './savingThrows.svelte';
import { createOwnedGrantFeatures } from './ownedGrantFeatures.svelte';
import { attackFootnoteLines, declaredAttackEffects } from './attackEffects';
import { spellAttackSourceOf, spellRiderSources } from './spellAttacks';
import { totalLevel } from '../schemas/classLevelText';
import { checkSources } from './abilityChecks';
import { characterDefenses } from './defenses';
import { wornItemsIn } from './wornItems';
import { characterMovement } from './movement';
import { declaredSpeed } from './characterProperties';
import type { AttackCalcContext } from './attackCalc';
import { mod } from '../domain/skills';
import { abilityRecordOf } from '../schemas/abilities';
import { hpDerivation } from './hitPointDerivation';
import { combatTips, hpTip, NO_COMBAT_TIPS } from './characterSheetTips';
import type { createFormLibraries } from './characterFormLibraries.svelte';
import type { Character } from '../schemas/characterSchema';
import type { WeaponMastery } from '../schemas/vocabulary';

export function createCharacterSheetModel(read: () => Character | null, libs: ReturnType<typeof createFormLibraries>) {
  /**
   * Der Schnappschuss ist die Abhängigkeit: das Formular schreibt mit `Object.assign` IN den
   * Draft, ein Lesen der bloßen Referenz bliebe damit auf dem Ladestand stehen — Karte und
   * Druck zeigten die alte Zauberwahl bis zum Neuladen.
   */
  const casting = createFormCasting(() => {
    const c = read();
    return c ? ($state.snapshot(c) as Character) : null;
  });
  const spellcasting = $derived(casting.current);

  const abilities = createCharacterAbilities(() => read(), () => libs);
  const hpBasis = createHpBasis(
    () => read() ?? { species: { sourceKey: '', name: '' }, classes: [], features: [], backgroundRef: { sourceKey: '', name: '' } },
    () => abilities.resolved.con,
  );
  const hpTipHtml = $derived.by(() => {
    const c = read();
    return c && hpBasis.current ? hpTip(hpDerivation(c, hpBasis.current, abilities.resolved.con, hpBasis.sources)) : '';
  });

  const owned = createOwnedGrantFeatures(() => read());
  const acTip = createArmorClassTip(() => read(), () => libs, () => abilities.resolved, () => owned.current);
  const fallbacks = $derived.by(() => {
    const c = read();
    return c && combatFallbacks({
      ...c,
      acTotal: acTip.total,
      hpTotal: hpBasis.current && hpMaxTotal(c, hpBasis.current),
      features: owned.current,
      mods: abilityRecordOf((k) => mod(abilities.resolved[k].score)),
    });
  });
  const shown = $derived.by(() => {
    const c = read();
    return c && fallbacks ? withCombatFallbacks(c, fallbacks) : null;
  });
  const tips = $derived.by(() => {
    const c = read();
    return c && fallbacks ? combatTips(c, fallbacks) : NO_COMBAT_TIPS;
  });
  const defenses = $derived.by(() => {
    const c = read();
    return owned.current && c
      ? characterDefenses(owned.current, effectiveProficiencyBonus(c), wornItemsIn(libs.itemIndex, c.inventory ?? []), c.manualDefenses)
      : [];
  });
  const spellRiders = $derived(spellcasting ? spellRiderSources(spellcasting.state, libs.spellIndex, read()?.attackRiderSpells ?? []) : []);
  const attackNotes = $derived(attackFootnoteLines(owned.current ?? [], spellRiders));
  const checks = $derived(checkSources(owned.current ?? []));
  const movement = $derived(owned.current ? characterMovement(owned.current, declaredSpeed(owned.current)?.feet ?? null) : []);
  const saving = createSavingThrows(() => read(), () => libs, () => abilities.resolved, () => owned.current);
  const attackCtx = $derived.by<AttackCalcContext | null>(() => {
    const c = read();
    return c && libs.itemsLoaded && owned.current ? {
      strMod: mod(abilities.resolved.str.score),
      dexMod: mod(abilities.resolved.dex.score),
      proficiencyBonus: effectiveProficiencyBonus(c),
      declared: declaredAttackEffects(libs.itemIndex, c.inventory ?? [], owned.current, spellRiders),
      spells: {
        spellOf: spellAttackSourceOf(libs.spellIndex),
        mods: abilityRecordOf((k) => mod(abilities.resolved[k].score)),
        characterLevel: totalLevel(c.classes ?? []) || 1,
      },
    } : null;
  });

  /**
   * Die Eigenschaft hängt am Item, die Erlaubnis an `character.masteries`, aufgelöst über
   * Name und Waffenart: ein Waffentausch wirkt sofort auf alle Angriffe, ohne dass in
   * `attacks[]` etwas zurückgeschrieben werden müsste.
   */
  const masteredWeaponKinds = $derived(weaponNameSet(read()?.masteries ?? [], (n) => matchItem(libs.itemIndex, { name: n })));

  function masteryOf(name: string): WeaponMastery | undefined {
    const lib = matchItem(libs.itemIndex, { name });
    if (!lib?.mastery) return undefined;
    return coversWeapon(masteredWeaponKinds, lib) ? lib.mastery : undefined;
  }

  /**
   * Namen, die die Bibliothek nicht (mehr) kennt, bleiben bewusst STEHEN — sonst zeigte
   * der Bogen weniger als die Datei enthält; der Editor markiert sie als Überhang.
   */
  const masteryChips = $derived((read()?.masteries ?? []).map((n) => ({ name: n, mastery: matchItem(libs.itemIndex, { name: n })?.mastery })));

  return {
    libs,
    masteryOf,
    get spellcasting() { return spellcasting; },
    get abilities() { return abilities.resolved; },
    get hpTipHtml() { return hpTipHtml; },
    get acTipHtml() { return acTip.html; },
    get shown() { return shown; },
    get tips() { return tips; },
    get defenses() { return defenses; },
    get attackNotes() { return attackNotes; },
    get checks() { return checks; },
    get movement() { return movement; },
    get saves() { return saving.saves; },
    get auras() { return saving.auras; },
    get deathSaveAdvantage() { return saving.deathSaveAdvantage; },
    get attackCtx() { return attackCtx; },
    get masteryChips() { return masteryChips; },
  };
}

export type CharacterSheetModel = ReturnType<typeof createCharacterSheetModel>;
