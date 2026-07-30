<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
  import { activeFile } from '../stores/campaign';
  import { confirmNavigation } from '../stores/navigationGuard';
  import { SKILL_DEFS, skillSheetKey, emptyPersonal, emptyProficiencies, formatClassLevel, totalLevel, type Character, type CharacterData, type CharacterClass, type CharacterSpecies, type CharacterBackground, type SpellEntry, type SpellRef, type Attack } from '../pdf/characterFields';
  import type { SkillName } from '../schemas/shared';
  import type { PendingCharacterUpgrade } from '../schemas/character';
  import {
    collectLegacyFixes,
    type LegacyFix, type LegacyFixKind, type LegacyLinkTarget, type LegacyLinkLibraries,
  } from '../services/characterLegacyLinks';
  import { collectGrants, type CollectedGrants } from '../services/proficiencyGrants';
  import { masteryOffer, type MasteryOffer } from '../services/weaponMastery';
  // Umbenannt, weil `spellSaveDC`/`spellAttackBonus` hier die Eingabefelder sind.
  import { spellAttackBonus as attackBonusFor, spellSaveDC as saveDcFor } from '../services/spellcasting';
  import { getSpellLibrary, searchSpells, loadSpellByPath, buildSpellIndex, matchSpell, SCHOOL_COLORS, type SpellInfo, type SpellSuggestion } from '../spellLibrary';
  import { getItemsByDir, searchItems, displayName, CATEGORY_COLORS, DIR_TO_CATEGORY, buildItemIndex, matchItem, formatDamageDice, ftToMVal, DAMAGE_TYPE_LABELS, type ItemInfo, type ItemSuggestion } from '../itemLibrary';
  import { getClasses, searchClasses, classDisplayName, type ClassInfo } from '../classLibrary';
  import { getSpeciesList, searchSpecies, speciesDisplayName, type SpeciesInfo } from '../speciesLibrary';
  import { getBackgroundsList, searchBackgrounds, backgroundDisplayName, type BackgroundInfo } from '../backgroundsLibrary';
  import {
    getFeats, searchFeats, featDisplayName, featDesc, featPrereq, matchFeatEntry,
    FEAT_CATEGORY_DE, type FeatEntry,
  } from '../featsLibrary';
  import { blankFeat, featDraftName, searchOpen5eFeats, loadOpen5eFeat, searchFeatLibrary } from '../services/featCreate';
  import {
    resolveClassFeatures, resolveSpeciesTraits, resolveBackground, resolveFeatLinks,
    splitFeatureEntries, keysOf, withChoices, type ResolvedFeatureGroup,
  } from '../services/characterFeatures';
  import { llmConfig } from '../stores/llm';
  import { runAiAction } from '../services/aiActions/runner';
  import {
    buildFieldSummaryAction, buildFieldSummaryInput, SHEET_FIELDS, type SummaryFeature,
  } from '../services/aiActions/fieldSummaryAction';
  import { CHARACTER_ALIGNMENTS_DE, SIZE_CATEGORIES_DE, type Item, type Spell } from '../types';
  import { CLASS_NAMES_DE } from '../services/classProgression';
  import { CASTER_ABILITY_DE } from '../services/spellcasting';
  import { lineWeightKg, totalWeightKg, formatKg } from '../utils/inventoryWeight';
  import SpellTooltip from './SpellTooltip.svelte';
  import ItemTooltip from './ItemTooltip.svelte';
  import FeatTooltip from './FeatTooltip.svelte';
  import CreateCardModal from './CreateCardModal.svelte';
  import Markdown from './Markdown.svelte';
  import WeaponMasteryPicker from './WeaponMasteryPicker.svelte';
  import { classifyChange, diffMark, type DiffDir } from '../utils/diffHighlight';

  // `character` ist der ed.draft-Proxy aus CharacterSheet. Das Formular pflegt seinen
  // eigenen lokalen Zustand und spiegelt ihn unten über einen $effect zurück in den
  // Draft (kein eigener Speichern-Button — das übernimmt die EditorPanel-Save-Bar).
  let { character = $bindable(), dirPath, saved, pendingUpgrade, upgradeAccepted = false, onAcceptUpgrade }: {
    character: Character;
    dirPath: string;
    saved?: Character | null;
    /** Schema-Rückstand der DATEI (aus CharacterSheet) — Teil des Umstellungs-Hinweises oben. */
    pendingUpgrade?: PendingCharacterUpgrade | null;
    upgradeAccepted?: boolean;
    onAcceptUpgrade?: () => void;
  } = $props();

  // Diff-Highlighting: vergleicht ein Quell-Feld gegen die gespeicherte Version.
  // Ohne Baseline (neuer/nie gespeicherter Charakter) → keine Hervorhebung.
  const dirOf = (o: unknown, n: unknown): DiffDir => (saved ? classifyChange(o, n) : 'none');

  // Passthrough-Felder, die das Formular nicht bearbeitet — einmalig erfassen, damit
  // der Sync-Effekt sie NICHT reaktiv liest (sonst Schreib-/Lese-Schleife auf character.*).
  const passivePerceptionInit = character.passivePerception;
  const totalWeightInit = character.totalWeight;
  const slotsUsedInit = (character.spells?.slots ?? []).map((s) => s.used);

  // ─── Felder ────────────────────────────────────────────
  let name = $state(character.name ?? '');
  // Strukturierte Klassen/Level-Items (Source-of-Truth; classLevel wird daraus abgeleitet).
  let classes = $state<CharacterClass[]>((character.classes ?? []).map((c) => ({ ...c })));
  let classLevelPreview = $derived(formatClassLevel(classes));
  let charTotalLevel = $derived(totalLevel(classes));
  // Ursprünglicher Freitext-Klassenstring — EINMALIG erfasst, bevor der Sync-Effekt unten
  // `character.classLevel` aus `classes` neu ableitet. Grundlage der Altformat-Umstellung
  // (services/characterLegacyLinks.ts), falls die Auto-Migration den Freitext nicht in
  // `classes` überführen konnte.
  const legacyClassLevelInit = character.classLevel ?? '';
  let playerName = $state(character.playerName ?? '');
  // Strukturierter Hintergrund-Link (Source-of-Truth). `background` = abgeleiteter Anzeige-String.
  let backgroundRef = $state<CharacterBackground>({ ...(character.backgroundRef ?? { sourceKey: '', name: '' }) });
  let background = $state(character.background ?? '');
  // Strukturierter Spezies-Link (Source-of-Truth). `race` = abgeleiteter Anzeige-String.
  let species = $state<CharacterSpecies>({ ...(character.species ?? { sourceKey: '', name: '' }) });
  let race = $state(character.race ?? '');
  let xp = $state(character.xp ?? '');

  let str = $state(character.str ?? 10);
  let ges = $state(character.ges ?? 10);
  let kon = $state(character.kon ?? 10);
  let int = $state(character.int ?? 10);
  let wei = $state(character.wei ?? 10);
  let cha = $state(character.cha ?? 10);

  let ac = $state(character.ac ?? '');
  let initiative = $state(character.initiative ?? '');
  let speed = $state(character.speed ?? '');
  let hpMax = $state(character.hpMax ?? '');
  let hpCurrent = $state(character.hpCurrent ?? '');
  let hpTemp = $state(character.hpTemp ?? '');
  let proficiencyBonus = $state(character.proficiencyBonus ?? 2);
  let hitDice = $state(character.hitDice ?? '');

  // ─── Übungen/Rüstungsausbildung (Waffen/Rüstung/Schild) ────────────────
  const profInit = character.proficiencies ?? emptyProficiencies();
  let profSimpleWeapons = $state(profInit.simpleWeapons);
  let profMartialWeapons = $state(profInit.martialWeapons);
  let profOtherWeapons = $state(profInit.otherWeapons ?? '');
  let profLightArmor = $state(profInit.lightArmor);
  let profMediumArmor = $state(profInit.mediumArmor);
  let profHeavyArmor = $state(profInit.heavyArmor);
  let profShields = $state(profInit.shields);

  // Waffenbeherrschung (5e 2024): Waffennamen wie in der Bibliothek. Die Wahl ist
  // jederzeit änderbar — das deckt die Regel „nach jeder langen Rast tauschbar" ab.
  let masteries = $state<string[]>([...(character.masteries ?? [])]);

  // ─── Persönliches ────────────────────────────────────────
  const personalInit = character.personal ?? emptyPersonal();
  let rassenmerkmale = $state(personalInit.rassenmerkmale ?? '');
  let alter = $state(personalInit.alter ?? '');
  let geschlecht = $state(personalInit.geschlecht ?? '');
  let sizeCat = $state(personalInit.sizeCat ?? '');
  let gesinnung = $state(personalInit.gesinnung ?? '');
  let glaube = $state(personalInit.glaube ?? '');
  let lebensstil = $state(personalInit.lebensstil ?? '');
  let taeglicheKosten = $state(personalInit.taeglicheKosten ?? '');
  let augenfarbe = $state(personalInit.augenfarbe ?? '');
  let haarfarbe = $state(personalInit.haarfarbe ?? '');
  let hautfarbe = $state(personalInit.hautfarbe ?? '');
  let gewicht = $state(personalInit.gewicht ?? '');
  let koerpergroesse = $state(personalInit.koerpergroesse ?? '');
  let aussehen = $state(personalInit.aussehen ?? '');

  // ─── Portrait ────────────────────────────────────────────
  let portraitFile = $state(character.portraitFile ?? '');
  let portraitPreview = $state<string>('');  // data URL für Vorschau
  let portraitError = $state('');
  let portraitBusy = $state(false);

  $effect(() => {
    if (!portraitFile) { portraitPreview = ''; return; }
    invoke<string>('read_file_base64', { path: `${dirPath}/${portraitFile}` })
      .then(b64 => {
        const mime = portraitFile.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        portraitPreview = `data:${mime};base64,${b64}`;
      })
      .catch(() => { portraitPreview = ''; });
  });

  async function pickPortrait() {
    portraitError = '';
    try {
      const selected = await openFileDialog({
        multiple: false,
        filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg'] }],
      });
      if (!selected || Array.isArray(selected)) return;
      portraitBusy = true;
      const src = selected as string;
      const ext = src.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
      const b64 = await invoke<string>('read_file_base64', { path: src });
      const targetName = `portrait.${ext}`;
      await invoke('write_file_base64', { path: `${dirPath}/${targetName}`, data: b64 });
      portraitFile = targetName;
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      portraitPreview = `data:${mime};base64,${b64}`;
    } catch (e) {
      portraitError = `Portrait konnte nicht geladen werden: ${e}`;
    } finally {
      portraitBusy = false;
    }
  }

  function clearPortrait() {
    portraitFile = '';
    portraitPreview = '';
  }

  let strSaveProf = $state(character.strSaveProf ?? false);
  let gesSaveProf = $state(character.gesSaveProf ?? false);
  let konSaveProf = $state(character.konSaveProf ?? false);
  let intSaveProf = $state(character.intSaveProf ?? false);
  let weiSaveProf = $state(character.weiSaveProf ?? false);
  let chaSaveProf = $state(character.chaSaveProf ?? false);

  let alleskoenner = $state(character.alleskoenner ?? false);

  let skillFlags = $state<Record<string, { prof: boolean; exp: boolean }>>(
    Object.fromEntries(SKILL_DEFS.map(s => [s.key, {
      prof: character.skills[s.key]?.prof ?? false,
      exp: character.skills[s.key]?.exp ?? false,
    }]))
  );

  // `modifiers` mitkopieren, sonst teilt der Editor die Array-Instanz mit dem Draft und
  // schreibt am Sync-Effekt vorbei.
  let attacks = $state(character.attacks.map(a => ({
    ...a,
    ...(a.modifiers ? { modifiers: a.modifiers.map(m => ({ ...m })) } : {}),
  })));
  let classFeatures = $state(character.classFeatures ?? '');
  // Das Merkmals-Ledger wird beim Bearbeiten AUFGETEILT: editierbar sind nur die
  // Talent-Links, die Entscheidungen laufen unangetastet durch. Ohne diese Trennung
  // würde `cleanRefs` sie beim Speichern verschlucken — sie tragen keinen `name`.
  let refFeats = $state((character.features ?? []).filter(r => !r.choice?.trim()).map(r => ({ ...r })));
  const choiceEntries = (character.features ?? []).filter(r => !!r.choice?.trim()).map(r => ({ ...r }));
  // Gegenstück für das Diff-Highlighting (Zuordnung über den Key, siehe `featDir`).
  const savedFeatLinks = $derived((saved?.features ?? []).filter(r => !r.choice?.trim()));
  let traits = $state(character.traits ?? '');
  let ideals = $state(character.ideals ?? '');
  let bonds = $state(character.bonds ?? '');
  let flaws = $state(character.flaws ?? '');

  let languages = $state([...character.languages]);
  let tools = $state([...character.tools]);
  let langInput = $state('');
  let toolInput = $state('');

  let currency = $state({ ...character.currency });
  let inventory = $state(character.inventory.map(i => ({ ...i })));
  let inventoryNotes = $state(character.inventoryNotes ?? '');
  // Gesamtlast automatisch aus Anzahl × Gewicht/Stück (reagiert live auf Eingaben).
  let computedTotalWeight = $derived(totalWeightKg(inventory));

  // ─── Zauber ──────────────────────────────────────────────
  let spellClass = $state(character.spells?.spellcastingClass ?? '');
  let spellAbility = $state(character.spells?.spellcastingAbility ?? '');
  let spellSaveDC = $state(character.spells?.saveDC ?? 0);
  let spellAttackBonus = $state(character.spells?.attackBonus ?? 0);
  let spellAutoCalc = $state(character.spells?.autoCalc ?? true);
  let slotTotals = $state(Array.from({ length: 9 }, (_, i) => character.spells?.slots[i]?.total ?? 0));
  // Deep-Copy: Link-Mutationen (sourceKey setzen) dürfen nicht das character-Prop aliasieren.
  let cantrips = $state<SpellRef[]>((character.spells?.cantrips ?? []).map((c) => ({ ...c })));
  let cantripInput = $state('');
  let spellsByLevel = $state<Record<string, SpellEntry[]>>(
    Object.fromEntries(
      Object.entries(character.spells?.byLevel ?? {}).map(([k, v]) => [k, v.map(s => ({ ...s }))])
    )
  );
  let spellInput = $state('');
  let spellInputLvl = $state('1');
  let spellInputPrepared = $state(false);

  // ─── Inventar: Bibliotheks-Link + Autocomplete ───────────
  let itemLoadedByDir = $state<Record<string, ItemInfo[]>>({});
  let itemSuggestions = $state<ItemSuggestion[]>([]);
  let itemSugIndex = $state(-1);
  let activeItemRow = $state(-1);
  /** Zeile, die trotz Link gerade neu getippt wird (✎). */
  let editingItemRow = $state(-1);

  // ─── Waffen-Picker für Angriffe ──────────────────────────
  let weaponSearch = $state('');
  let weaponSuggestions = $state<ItemSuggestion[]>([]);
  let weaponSugIndex = $state(-1);

  $effect(() => {
    if (!weaponSearch.trim()) { weaponSuggestions = []; weaponSugIndex = -1; return; }
    const weaponsOnly = { weapon: itemLoadedByDir.weapon ?? [] };
    weaponSuggestions = searchItems(weaponsOnly, weaponSearch, 8);
    weaponSugIndex = -1;
  });

  /**
   * Baut einen reaktiven Attack-Eintrag aus einem geladenen Waffen-Item.
   * Wählt das Attribut nach Reichweite/Finesse, übernimmt Waffenübung,
   * Schadenswürfel und magischen Bonus (item.magic_bonus). Bonus/Schaden werden
   * danach reaktiv aus den Attributen berechnet (auto = true).
   */
  function buildAttackFromWeapon(item: Item): Attack {
    const name = item.name_de ?? item.name;
    const isRanged = item.weapon_range === 'Ranged';
    const isFinesse = (item.properties ?? []).some(p => p.index === 'finesse');
    const ability: Attack['ability'] = isRanged ? 'ges' : (isFinesse ? 'finesse' : 'str');

    const proficient = (item.weapon_category === 'Simple' && profSimpleWeapons) ||
                       (item.weapon_category === 'Martial' && profMartialWeapons);

    const baseDamage = item.damage?.damage_dice ? formatDamageDice(item.damage.damage_dice) : '';
    const magicBonus = item.magic_bonus ?? 0;

    const damageTypeIdx = item.damage?.damage_type?.index ?? '';
    const damageTypeLabel = DAMAGE_TYPE_LABELS[damageTypeIdx] ?? item.damage?.damage_type?.name ?? '';
    // Kurzform für PDF-Spalte: "Hieb" / "Stich" / "Wucht"
    const damageTypeShort = damageTypeLabel.replace(/schaden$/i, '').trim();

    // Reichweite
    let range = '';
    if (isRanged && item.range) {
      const n = ftToMVal(item.range.normal);
      const l = item.range.long ? ftToMVal(item.range.long) : null;
      range = l ? `${n}/${l} m` : `${n} m`;
    } else if (item.throw_range) {
      const n = ftToMVal(item.throw_range.normal);
      const l = ftToMVal(item.throw_range.long);
      range = `Nah (Wurf ${n}/${l} m)`;
    } else {
      range = 'Nah';
    }

    const atk: Attack = {
      name, bonus: '', damage: '', type: damageTypeShort, range,
      auto: true, ability, proficient, baseDamage, magicBonus, modifiers: [],
    };
    atk.bonus = computeAttackBonus(atk);
    atk.damage = computeAttackDamage(atk);
    return atk;
  }

  // ─── Angriffe: reaktive Berechnung ───────────────────────
  /** Attributsmodifikator eines Angriffs (str/ges/finesse). */
  function attackAbilityMod(a: Pick<Attack, 'ability'>): number {
    if (a.ability === 'ges') return gesMod;
    if (a.ability === 'finesse') return Math.max(strMod, gesMod);
    return strMod;
  }
  const ATTACK_ABILITY_LABEL: Record<string, string> = { str: 'STR', ges: 'GES', finesse: 'Finesse' };

  /** Summe der benannten Zusatzeffekte, getrennt nach Angriffswurf und Schaden. */
  function attackModifierTotals(a: Attack): { attack: number; damage: number } {
    let attack = 0, damage = 0;
    for (const m of a.modifiers ?? []) {
      attack += m.attackBonus || 0;
      damage += m.damageBonus || 0;
    }
    return { attack, damage };
  }
  /** Angriffsbonus = Attributsmod + (geübt ? Übungsbonus) + magischer Bonus + Zusatzeffekte. */
  function computeAttackBonus(a: Attack): string {
    return sign(attackAbilityMod(a) + (a.proficient ? proficiencyBonus : 0)
      + (a.magicBonus ?? 0) + attackModifierTotals(a).attack);
  }
  /** Schaden = Würfel + Attributsmod + magischer Bonus + Zusatzeffekte (Übungsbonus zählt NICHT). */
  function computeAttackDamage(a: Attack): string {
    const base = (a.baseDamage ?? '').trim();
    if (!base) return '';
    const m = attackAbilityMod(a) + (a.magicBonus ?? 0) + attackModifierTotals(a).damage;
    return base + (m !== 0 ? sign(m) : '');
  }

  /**
   * Mehrzeilige Herleitung fürs `title`-Attribut der berechneten Zellen. Bewusst Plaintext:
   * das HTML-Tooltip-System (`row`/`total`) liegt lokal in CharacterSheet.svelte.
   */
  function attackBonusTip(a: Attack): string {
    const lines = [`${ATTACK_ABILITY_LABEL[a.ability ?? 'str']} ${sign(attackAbilityMod(a))}`];
    if (a.proficient) lines.push(`geübt ${sign(proficiencyBonus)}`);
    if (a.magicBonus) lines.push(`Magie ${sign(a.magicBonus)}`);
    for (const m of a.modifiers ?? [])
      if (m.attackBonus) lines.push(`${m.label.trim() || 'Effekt'} ${sign(m.attackBonus)}`);
    return [...lines, `= ${computeAttackBonus(a)}`].join('\n');
  }
  function attackDamageTip(a: Attack): string {
    const base = (a.baseDamage ?? '').trim();
    if (!base) return 'Kein Schadenswürfel eingetragen';
    const lines = [`Würfel ${base}`, `${ATTACK_ABILITY_LABEL[a.ability ?? 'str']} ${sign(attackAbilityMod(a))}`];
    if (a.magicBonus) lines.push(`Magie ${sign(a.magicBonus)}`);
    for (const m of a.modifiers ?? [])
      if (m.damageBonus) lines.push(`${m.label.trim() || 'Effekt'} ${sign(m.damageBonus)}`);
    return [...lines, `= ${computeAttackDamage(a)}`].join('\n');
  }

  /**
   * Vergleichsform fürs Diff-Highlighting. Zwei Angleichungen, ohne die eine Zeile nach
   * dem Speichern dauerhaft grün bliebe:
   *  - leeres `modifiers` gilt wie keins (gespeichert wird der Schlüssel dann nicht),
   *  - im Auto-Modus sind `bonus`/`damage` abgeleitet: der State trägt noch den Text vom
   *    Anlegen, in die Datei geht der berechnete Wert. Beide Seiten neu rechnen.
   */
  function attackForDiff(a: Attack): Attack {
    const r = { ...a };
    if (!r.modifiers?.length) delete r.modifiers;
    if (r.auto) {
      r.bonus = computeAttackBonus(r);
      r.damage = computeAttackDamage(r);
    }
    return r;
  }

  function addAttackModifier(i: number) {
    const a = attacks[i];
    a.modifiers = [...(a.modifiers ?? []), { label: '', attackBonus: 0, damageBonus: 0 }];
  }
  function removeAttackModifier(i: number, j: number) {
    attacks[i].modifiers?.splice(j, 1);
  }

  /** Schaltet einen Angriff zwischen reaktiver Berechnung und manueller Eingabe um. */
  function toggleAttackMode(i: number) {
    const a = attacks[i];
    if (a.auto) {
      // → manuell: aktuelle Werte als Freitext einfrieren
      a.bonus = computeAttackBonus(a);
      a.damage = computeAttackDamage(a);
      a.auto = false;
    } else {
      // → auto: Felder initialisieren, Würfel aus vorhandenem Schaden ableiten
      a.ability ??= 'str';
      a.proficient ??= false;
      a.magicBonus ??= 0;
      a.modifiers ??= [];
      if (a.baseDamage == null || a.baseDamage === '') {
        const m = a.damage.match(/^\s*(\d*\s*[WwDd]\s*\d+)/);
        a.baseDamage = m ? m[1].replace(/\s/g, '').replace(/[dD]/, 'W') : '';
      }
      a.auto = true;
    }
  }

  async function selectWeaponSuggestion(sug: ItemSuggestion) {
    try {
      const content = await invoke<string>('read_file_content', { path: sug.item.path });
      const data = JSON.parse(content) as Item;
      attacks.push(buildAttackFromWeapon(data));
      weaponSearch = '';
      weaponSuggestions = [];
      weaponSugIndex = -1;
    } catch {
      // Item nicht ladbar → Auto-Angriff mit dem Namen anlegen
      attacks.push({
        name: displayName(sug.item), bonus: '', damage: '', type: '', range: 'Nah',
        auto: true, ability: 'str', proficient: false, baseDamage: '', magicBonus: 0, modifiers: [],
      });
      weaponSearch = '';
      weaponSuggestions = [];
    }
  }

  function onWeaponSearchKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); weaponSugIndex = Math.min(weaponSugIndex + 1, weaponSuggestions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); weaponSugIndex = Math.max(weaponSugIndex - 1, -1); }
    else if (e.key === 'Escape') { weaponSuggestions = []; weaponSugIndex = -1; }
    else if (e.key === 'Enter') {
      if (weaponSugIndex >= 0 && weaponSuggestions[weaponSugIndex]) {
        e.preventDefault();
        selectWeaponSuggestion(weaponSuggestions[weaponSugIndex]);
      }
    }
  }

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

  const itemIndex = $derived(buildItemIndex(itemLoadedByDir));

  function libItemOf(line: { name: string; sourceKey?: string }): ItemInfo | undefined {
    return matchItem(itemIndex, line);
  }

  function onInventoryNameInput(i: number, value: string) {
    inventory[i].sourceKey = undefined; // getippter Name ≠ verlinkter Gegenstand
    // Hält die Zeile im Eingabefeld: sonst klappt sie mitten im Wort zur Link-Ansicht
    // um, sobald der Zwischenstand zufällig einen Bibliotheksnamen trifft.
    editingItemRow = i;
    activeItemRow = i;
    itemSuggestions = searchItems(itemLoadedByDir, value, 8);
    itemSugIndex = -1;
  }

  function selectInventoryItem(i: number, sug: ItemSuggestion) {
    inventory[i].name = displayName(sug.item); // deutscher Name, fällt auf Original zurück
    inventory[i].sourceKey = sug.item.key;
    // Überschreibt auch einen getippten Wert, und leert bei Items ohne Gewicht: „kein
    // Gewicht" ist eine Aussage der Bibliothek (Würfel), kein fehlender Wert.
    inventory[i].weight = sug.item.weight != null ? String(sug.item.weight) : '';
    itemSuggestions = [];
    activeItemRow = -1;
    itemSugIndex = -1;
    editingItemRow = -1;
  }

  function onInventoryNameKey(e: KeyboardEvent, i: number) {
    if (e.key === 'ArrowDown') { e.preventDefault(); itemSugIndex = Math.min(itemSugIndex + 1, itemSuggestions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); itemSugIndex = Math.max(itemSugIndex - 1, -1); }
    else if (e.key === 'Escape') { itemSuggestions = []; activeItemRow = -1; editingItemRow = -1; }
    else if (e.key === 'Enter' && itemSugIndex >= 0 && itemSuggestions[itemSugIndex]) {
      e.preventDefault();
      selectInventoryItem(i, itemSuggestions[itemSugIndex]);
    }
  }

  /** Bibliotheksname eines gelinkten Gegenstands, wenn er vom gespeicherten `name` abweicht. */
  function divergedItemName(line: { name: string; sourceKey?: string }): string | undefined {
    const key = line.sourceKey?.trim();
    if (!key) return undefined;
    const hit = itemIndex.byKey.get(key);
    if (!hit) return undefined;
    const canonical = displayName(hit);
    return canonical.trim() !== line.name.trim() ? canonical : undefined;
  }

  const divergedItemCount = $derived(inventory.filter((line) => divergedItemName(line)).length);

  function syncInventoryNames() {
    for (const line of inventory) {
      const canonical = divergedItemName(line);
      if (canonical) line.name = canonical;
    }
  }

  /**
   * Der Bibliotheksname zu einem gelinkten Zauber, wenn er vom gespeicherten `name`
   * abweicht (nur über den KEY verglichen — der Fallback-Name-Treffer wäre trivial gleich).
   * `undefined` = kein Link, kein Treffer oder identisch.
   */
  function divergedSpellName(ref: SpellRef): string | undefined {
    const key = ref.sourceKey?.trim();
    if (!key) return undefined;
    const canonical = spellIndex.byKey.get(key)?.name;
    return canonical && canonical.trim() !== ref.name.trim() ? canonical : undefined;
  }

  const divergedSpellCount = $derived.by(() => {
    let n = cantrips.filter((c) => divergedSpellName(c)).length;
    for (const arr of Object.values(spellsByLevel)) n += arr.filter((e) => divergedSpellName(e)).length;
    return n;
  });

  function syncSpellNames() {
    const fix = (ref: SpellRef) => {
      const canonical = divergedSpellName(ref);
      if (canonical) ref.name = canonical;
    };
    cantrips.forEach(fix);
    cantrips = [...cantrips];
    for (const lvl of Object.keys(spellsByLevel)) {
      spellsByLevel[lvl].forEach(fix);
      spellsByLevel[lvl] = [...spellsByLevel[lvl]];
    }
  }

  // ─── Gegenstands-Tooltip + Sprung zur Karte (wie im Bogen) ──
  let itemDataByPath = $state(new Map<string, Item | null>());
  let itemTooltip = $state<Item | null>(null);

  // Vorab laden → Tooltip erscheint ohne Verzögerung.
  $effect(() => {
    for (const line of inventory) {
      const lib = libItemOf(line);
      if (!lib || itemDataByPath.has(lib.path)) continue;
      itemDataByPath.set(lib.path, null);
      itemDataByPath = new Map(itemDataByPath);
      invoke<string>('read_file_content', { path: lib.path })
        .then((content) => {
          itemDataByPath.set(lib.path, JSON.parse(content) as Item);
          itemDataByPath = new Map(itemDataByPath);
        })
        .catch(() => {});
    }
  });

  function showItemTooltip(e: MouseEvent, lib: ItemInfo) {
    const data = itemDataByPath.get(lib.path);
    if (!data) return;
    itemTooltip = data;
    tooltipX = e.clientX + 14;
    tooltipY = e.clientY + 14;
  }
  function moveItemTooltip(e: MouseEvent) {
    if (!itemTooltip) return;
    tooltipX = e.clientX + 14;
    tooltipY = e.clientY + 14;
  }
  function hideItemTooltip() { itemTooltip = null; }

  async function openItemPage(lib: ItemInfo) {
    if (!(await confirmNavigation())) return; // ungespeicherte Charakter-Änderungen
    const name = lib.path.split('/').pop()?.replace('.json', '') ?? lib.name;
    activeFile.set({ name, path: lib.path, type: 'item' });
  }

  // ─── Zauber-Autocomplete ─────────────────────────────────
  let spellLibrary = $state<SpellInfo[]>([]);
  let cantripSuggestions = $state<SpellSuggestion[]>([]);
  let spellSuggestions = $state<SpellSuggestion[]>([]);
  let cantripSugIndex = $state(-1);
  let spellSugIndex = $state(-1);

  $effect(() => {
    getSpellLibrary().then(lib => { spellLibrary = lib; });
  });

  // Zauber werden per Key (Fallback Name) an die Bibliothek gebunden — wie Items.
  const spellIndex = $derived(buildSpellIndex(spellLibrary));
  const resolveSpell = (ref: { name: string; sourceKey?: string }): SpellInfo | undefined =>
    matchSpell(spellIndex, ref);

  function spellColor(ref: { name: string; sourceKey?: string }): string {
    const school = resolveSpell(ref)?.school;
    return school ? (SCHOOL_COLORS[school] ?? '') : '';
  }

  // ─── Zauber-Hover-Tooltip (analog Gegenstands-Tooltip) ───
  let spellDataCache = $state(new Map<string, Spell | null>());
  let spellTooltip = $state<Spell | null>(null);
  let tooltipX = $state(0);
  let tooltipY = $state(0);

  // Alle aktuell eingetragenen Zauber vorab laden → sofortiger Tooltip beim Hover.
  $effect(() => {
    const refs = [
      ...cantrips,
      ...Object.values(spellsByLevel).flat(),
    ];
    for (const ref of refs) {
      const name = ref.name;
      if (spellDataCache.has(name)) continue;
      const info = resolveSpell(ref);
      if (!info?.path) continue;
      spellDataCache.set(name, null);
      spellDataCache = new Map(spellDataCache);
      loadSpellByPath(info.path).then(data => {
        spellDataCache.set(name, data);
        spellDataCache = new Map(spellDataCache);
      });
    }
  });

  function showSpellTooltip(e: MouseEvent, name: string) {
    const data = spellDataCache.get(name);
    if (!data) return;
    spellTooltip = data;
    tooltipX = e.clientX + 14;
    tooltipY = e.clientY + 14;
  }
  function moveSpellTooltip(e: MouseEvent) {
    if (!spellTooltip) return;
    tooltipX = e.clientX + 14;
    tooltipY = e.clientY + 14;
  }
  function hideSpellTooltip() { spellTooltip = null; }

  async function openSpellPage(ref: { name: string; sourceKey?: string }) {
    const info = resolveSpell(ref);
    if (!info?.path) return;
    if (!(await confirmNavigation())) return; // ungespeicherte Charakter-Änderungen
    const name = info.path.split('/').pop()?.replace('.json', '') ?? ref.name;
    activeFile.set({ name, path: info.path, type: 'spell' });
  }

  $effect(() => {
    cantripSuggestions = cantripInput.length > 0
      ? searchSpells(spellLibrary, cantripInput, 0, spellClass)
      : [];
    cantripSugIndex = -1;
  });

  $effect(() => {
    spellSuggestions = spellInput.length > 0
      ? searchSpells(spellLibrary, spellInput, Number(spellInputLvl), spellClass)
      : [];
    spellSugIndex = -1;
  });

  // Aus der Autocomplete gewählt → Key gleich am SpellInfo abgreifen (wie selectInventoryItem).
  function selectCantripSuggestion(sug: SpellSuggestion) {
    if (!cantrips.some((c) => c.name === sug.spell.name))
      cantrips.push({ name: sug.spell.name, ...(sug.spell.key ? { sourceKey: sug.spell.key } : {}) });
    cantripInput = '';
    cantripSuggestions = [];
  }

  function selectSpellSuggestion(sug: SpellSuggestion) {
    const existing = spellsByLevel[spellInputLvl] ?? [];
    spellsByLevel[spellInputLvl] = [
      ...existing,
      { name: sug.spell.name, prepared: spellInputPrepared, ...(sug.spell.key ? { sourceKey: sug.spell.key } : {}) },
    ];
    spellInput = '';
    spellInputPrepared = false;
    spellSuggestions = [];
  }

  function onCantripKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); cantripSugIndex = Math.min(cantripSugIndex + 1, cantripSuggestions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cantripSugIndex = Math.max(cantripSugIndex - 1, -1); }
    else if (e.key === 'Escape') { cantripSuggestions = []; }
    else if (e.key === 'Enter') {
      if (cantripSugIndex >= 0 && cantripSuggestions[cantripSugIndex]) {
        selectCantripSuggestion(cantripSuggestions[cantripSugIndex]);
      } else {
        addCantrip();
      }
    }
  }

  function onSpellKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); spellSugIndex = Math.min(spellSugIndex + 1, spellSuggestions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); spellSugIndex = Math.max(spellSugIndex - 1, -1); }
    else if (e.key === 'Escape') { spellSuggestions = []; }
    else if (e.key === 'Enter') {
      if (spellSugIndex >= 0 && spellSuggestions[spellSugIndex]) {
        selectSpellSuggestion(spellSuggestions[spellSugIndex]);
      } else {
        addSpell();
      }
    }
  }

  function addCantrip(e?: KeyboardEvent) {
    if (e && e.key !== 'Enter') return;
    const v = cantripInput.trim();
    // Frei getippt → ohne Key; matchSpell löst später über den Namen auf.
    if (v && !cantrips.some((c) => c.name === v)) cantrips.push({ name: v });
    cantripInput = '';
    cantripSuggestions = [];
  }

  function addSpell() {
    const v = spellInput.trim();
    if (!v) return;
    const existing = spellsByLevel[spellInputLvl] ?? [];
    spellsByLevel[spellInputLvl] = [...existing, { name: v, prepared: spellInputPrepared }];
    spellInput = '';
    spellInputPrepared = false;
    spellSuggestions = [];
  }

  // ─── Berechnete Werte ───────────────────────────────────
  function modFor(score: number) { return Math.floor((score - 10) / 2); }

  const strMod = $derived(modFor(str));
  const gesMod = $derived(modFor(ges));
  const konMod = $derived(modFor(kon));
  const intMod = $derived(modFor(int));
  const weiMod = $derived(modFor(wei));
  const chaMod = $derived(modFor(cha));

  const computedSkills = $derived.by(() => {
    const mods: Record<string, number> = { str: strMod, ges: gesMod, kon: konMod, int: intMod, wei: weiMod, cha: chaMod };
    const result: CharacterData['skills'] = {};
    for (const def of SKILL_DEFS) {
      const flags = skillFlags[def.key];
      const base = mods[def.attr] ?? 0;
      const pb = proficiencyBonus;
      let value = base;
      if (flags.exp) value = base + pb * 2;
      else if (flags.prof) value = base + pb;
      else if (alleskoenner) value = base + Math.floor(pb / 2);
      result[def.key] = { value, prof: flags.prof, exp: flags.exp };
    }
    return result;
  });

  function sign(n: number) { return n >= 0 ? `+${n}` : `${n}`; }

  // ─── Übungs-Grants aus den Bibliotheks-Links ─────────────
  // Deterministisch abgeleitet (Hintergrund + Startklasse + Mehrklassen + Spezies-
  // Merkmale + Talente). Im Editor NUR noch Herkunfts-ANZEIGE: die ◆-Marker an Fertigkeiten
  // und die Herkunftshinweise an Waffen/Rüstung/RW. Das aktive „Übernehmen"-Panel gehört in
  // Erstellung/Level-Up, nicht in den Editor. Siehe services/proficiencyGrants.ts.
  let grants = $state<CollectedGrants | null>(null);

  // Nur die LINKS sind Abhängigkeit — nicht die Häkchen, sonst lüde es bei jedem Klick neu.
  const grantLinks = $derived.by(() => ({
    classes: classes.map((c) => ({ sourceKey: c.sourceKey, name: c.name, subclassKey: c.subclassKey })),
    species: { sourceKey: species.sourceKey, subspeciesKey: species.subspeciesKey },
    backgroundRef: { sourceKey: backgroundRef.sourceKey },
    features: refFeats.map((f) => ({ sourceKey: f.sourceKey, name: f.name })),
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

  /** Herkunft je Waffen-/Rüstungs-Häkchen (für die ◆-Marker im Übungs-Abschnitt). */
  const profGrantSources = $derived({
    simple: grantSourcesFor(grants?.weapons, 'Simple'),
    martial: grantSourcesFor(grants?.weapons, 'Martial'),
    light: grantSourcesFor(grants?.armor, 'Light'),
    medium: grantSourcesFor(grants?.armor, 'Medium'),
    heavy: grantSourcesFor(grants?.armor, 'Heavy'),
    shields: grantSourcesFor(grants?.armor, 'Shields'),
  });

  // ─── Waffenbeherrschung (5e 2024) ────────────────────────
  // Anders als beim Grant-Panel sind die HÄKCHEN hier Eingabe, nicht nur Vergleichs-
  // ziel: „zwei Waffenarten deiner Wahl, in denen du geübt bist". Ein Klick auf
  // „Kriegswaffen" darf die Auswahlmenge also sofort ändern; teuer ist das nicht,
  // weil der Item-Index gecacht ist (itemLibrary).
  let mastery = $state<MasteryOffer | null>(null);

  const masteryInput = $derived.by(() => ({
    classes: classes.map((c) => ({ sourceKey: c.sourceKey, name: c.name, level: c.level })),
    proficiencies: { simpleWeapons: profSimpleWeapons, martialWeapons: profMartialWeapons },
  }));

  $effect(() => {
    const input = masteryInput;
    let cancelled = false;
    void masteryOffer(input)
      .then((o) => { if (!cancelled) mastery = o; })
      .catch(() => { if (!cancelled) mastery = null; });
    return () => { cancelled = true; };
  });

  // ─── Zauber-SG / -Angriffsbonus: reaktive Berechnung ─────
  // Zauberattribut (Freitext, z.B. "INT" / "Weisheit") → Modifikator.
  const ABILITY_ALIASES: Record<string, 'str' | 'ges' | 'kon' | 'int' | 'wei' | 'cha'> = {
    str: 'str', stä: 'str', staerke: 'str', stärke: 'str', strength: 'str',
    ges: 'ges', geschicklichkeit: 'ges', dex: 'ges', dexterity: 'ges',
    kon: 'kon', konstitution: 'kon', con: 'kon', constitution: 'kon',
    int: 'int', intelligenz: 'int', intelligence: 'int',
    wei: 'wei', weisheit: 'wei', wis: 'wei', wisdom: 'wei',
    cha: 'cha', charisma: 'cha',
  };
  const spellAbilityMod = $derived.by(() => {
    const key = ABILITY_ALIASES[spellAbility.trim().toLowerCase()];
    if (!key) return null;
    return ({ str: strMod, ges: gesMod, kon: konMod, int: intMod, wei: weiMod, cha: chaMod })[key];
  });
  /** true, wenn Auto aktiv UND das Zauberattribut erkannt wurde. */
  const spellAutoActive = $derived(spellAutoCalc && spellAbilityMod !== null);
  const computedSpellSaveDC = $derived(spellAbilityMod === null ? null : saveDcFor(proficiencyBonus, spellAbilityMod));
  const computedSpellAttack = $derived(spellAbilityMod === null ? null : attackBonusFor(proficiencyBonus, spellAbilityMod));

  // ─── Auswahllisten ───────────────────────────────────────
  // Ein Wert aus einer Altdatei (oder aus dem PDF-Import) steht nicht zwingend in der Liste.
  // Er kommt deshalb als eigener Eintrag vorne dazu — sonst zeigt das Select ihn nicht an und
  // die erste Auswahl würde ihn stillschweigend verwerfen.
  const withCurrent = (options: string[], current: string): string[] =>
    current.trim() && !options.includes(current) ? [current, ...options] : options;

  const gesinnungOptions = $derived(withCurrent(CHARACTER_ALIGNMENTS_DE, gesinnung));
  const sizeCatOptions = $derived(withCurrent(SIZE_CATEGORIES_DE, sizeCat));
  const spellClassOptions = $derived(withCurrent(CLASS_NAMES_DE, spellClass));
  const spellAbilityOptions = $derived(withCurrent(Object.values(CASTER_ABILITY_DE), spellAbility));

  /**
   * Bewegungsrate ist eine Meterzahl, kein Freitext: „9 Meter" / „30 feet" tippt sich hier
   * nicht mehr ein. Das Schema-Feld bleibt ein String (PDF-Grenze), die Eingabe wird auf
   * Ziffern plus EIN Komma reduziert.
   */
  function cleanSpeed(raw: string): string {
    const [head, ...rest] = raw.replace(/[^\d.,]/g, '').replace(/\./g, ',').split(',');
    return rest.length ? `${head},${rest.join('')}` : head;
  }
  function onSpeedInput(e: Event & { currentTarget: HTMLInputElement }) {
    const cleaned = cleanSpeed(e.currentTarget.value);
    // Verwirft die Eingabe den getippten Rest, muss das DOM-Feld mitgezogen werden — der
    // reaktive Wert allein ändert sich dabei nicht und Svelte würde nichts schreiben.
    if (cleaned !== e.currentTarget.value) e.currentTarget.value = cleaned;
    speed = cleaned;
  }

  // ─── Aktionen ────────────────────────────────────────────
  function addAttack() {
    attacks.push({
      name: '', bonus: '', damage: '', type: '', range: '',
      auto: true, ability: 'str', proficient: false, baseDamage: '', magicBonus: 0, modifiers: [],
    });
  }
  function removeAttack(i: number) { attacks.splice(i, 1); }

  function addLanguage(e: KeyboardEvent | MouseEvent) {
    if ('key' in e && e.key !== 'Enter') return;
    const v = langInput.trim();
    if (v && !languages.includes(v)) languages.push(v);
    langInput = '';
  }
  function removeLang(l: string) { languages = languages.filter(x => x !== l); }

  function addTool(e: KeyboardEvent | MouseEvent) {
    if ('key' in e && e.key !== 'Enter') return;
    const v = toolInput.trim();
    if (v && !tools.includes(v)) tools.push(v);
    toolInput = '';
  }
  function removeTool(t: string) { tools = tools.filter(x => x !== t); }

  function addInventoryItem() {
    inventory.push({ name: '', sourceKey: undefined, count: '', weight: '' });
    editingItemRow = inventory.length - 1;
  }
  function removeInventoryItem(i: number) {
    inventory.splice(i, 1);
    editingItemRow = -1;
  }

  // Ledger-Einträge, die der Editor anlegt, sind immer Talent-Links (siehe `pickFeat`) —
  // Entscheidungen entstehen ausschließlich im Stufenaufstieg.
  function removeRef(list: typeof refFeats, i: number) { list.splice(i, 1); }

  // ─── Klassen/Level (strukturiert, multiclass-fähig) ──────────────────────────
  function addClass() { classes.push({ sourceKey: '', name: '', level: 1 }); editingClassRow = classes.length - 1; }
  function removeClass(i: number) { classes.splice(i, 1); editingClassRow = -1; }

  // Klassen-Bibliothek: für Autocomplete (nur Grundklassen) und Subklassen-Dropdown.
  let classIndex = $state<ClassInfo[]>([]);
  $effect(() => { getClasses().then((x) => { classIndex = x; }); });
  // Nur Grundklassen (ohne subclassOf) landen in der Namens-Vorschlagsliste.
  let baseClassIndex = $derived(classIndex.filter((c) => !c.subclassOf));

  let activeClassRow = $state(-1);
  let classSuggestions = $state<ClassInfo[]>([]);
  let classSugIndex = $state(-1);
  let editingClassRow = $state(-1); // Zeile im Bearbeiten-Modus (sonst: Link zur Bibliothek)


  /** Bibliotheks-Pfad zur GRUNDklasse eines Eintrags, falls verlinkt. */
  function classPath(cls: CharacterClass): string | undefined {
    if (!cls.sourceKey) return undefined;
    return classIndex.find((c) => c.key === cls.sourceKey)?.path;
  }

  /** Öffnet die Bibliotheks-Kartenseite der verlinkten Grundklasse. */
  async function openClassPage(cls: CharacterClass) {
    const path = classPath(cls);
    if (!path) return;
    if (!(await confirmNavigation())) return; // ungespeicherte Charakter-Änderungen
    activeFile.set({ name: path.split('/').pop()!.replace('.json', ''), path, type: 'class' });
  }

  /** Subklassen der gewählten Grundklasse (aus der Bibliothek). */
  function subclassesFor(cls: CharacterClass): ClassInfo[] {
    if (!cls.sourceKey) return [];
    return classIndex.filter((c) => c.subclassOf === cls.sourceKey);
  }

  /** Setzt/leert Subklasse (Key + Anzeigename) einer Zeile. */
  function setSubclass(i: number, key: string) {
    if (!key) { classes[i].subclassKey = undefined; classes[i].subclassName = undefined; return; }
    const info = classIndex.find((c) => c.key === key);
    classes[i].subclassKey = key;
    classes[i].subclassName = info ? classDisplayName(info) : undefined;
  }

  function onClassNameInput(i: number, value: string) {
    activeClassRow = i;
    classSugIndex = -1;
    const q = value.trim();
    classSuggestions = q ? searchClasses(baseClassIndex, q, 8) : [];
  }

  function selectClassSuggestion(i: number, info: ClassInfo) {
    // Nur Grundklassen sind vorschlagbar; Subklasse getrennt über das Dropdown.
    classes[i].name = classDisplayName(info);
    classes[i].sourceKey = info.key ?? '';
    classes[i].subclassKey = undefined;
    classes[i].subclassName = undefined;
    classSuggestions = [];
    activeClassRow = -1;
    classSugIndex = -1;
    editingClassRow = -1; // verlinkt → als Bibliotheks-Link darstellen
  }

  function onClassNameKey(e: KeyboardEvent, i: number) {
    if (activeClassRow !== i) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); classSugIndex = Math.min(classSugIndex + 1, classSuggestions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); classSugIndex = Math.max(classSugIndex - 1, -1); }
    else if (e.key === 'Escape') { classSuggestions = []; activeClassRow = -1; }
    else if (e.key === 'Enter' && classSugIndex >= 0 && classSuggestions[classSugIndex]) {
      e.preventDefault();
      selectClassSuggestion(i, classSuggestions[classSugIndex]);
    }
  }

  // ─── Spezies (strukturierter Bibliotheks-Link; analog zur Klasse) ─────────────
  // Der Charakter verlinkt EINE Spezies; die Traits werden auf der Karte aus der
  // Bibliothek aufgelöst. `race` ist der abgeleitete Anzeige-String (auch fürs PDF).
  let speciesIndex = $state<SpeciesInfo[]>([]);
  $effect(() => { getSpeciesList().then((x) => { speciesIndex = x; }); });

  let editingSpecies = $state(!species.sourceKey && !species.name.trim()); // Picker offen vs. Link
  let speciesActive = $state(false);
  let speciesSuggestions = $state<SpeciesInfo[]>([]);
  let speciesSugIndex = $state(-1);

  /** Bibliotheks-Pfad der verlinkten Spezies, falls vorhanden. */
  function speciesPath(): string | undefined {
    return species.sourceKey ? speciesIndex.find((s) => s.key === species.sourceKey)?.path : undefined;
  }
  async function openSpeciesPage() {
    const path = speciesPath();
    if (!path) return;
    if (!(await confirmNavigation())) return; // ungespeicherte Charakter-Änderungen
    activeFile.set({ name: path.split('/').pop()!.replace('.json', ''), path, type: 'species' });
  }

  function onSpeciesInput(value: string) {
    species.name = value;
    race = value; // abgeleiteter Anzeige-String live mitführen (auch für Homebrew-Freitext)
    species.sourceKey = ''; // freies Tippen = (noch) nicht verlinkt
    speciesActive = true;
    speciesSugIndex = -1;
    speciesSuggestions = value.trim() ? searchSpecies(speciesIndex, value, 8) : [];
  }

  function selectSpecies(info: SpeciesInfo) {
    species.name = speciesDisplayName(info);
    species.sourceKey = info.key ?? '';
    species.subspeciesKey = undefined;
    species.subspeciesName = undefined;
    race = species.name;
    speciesSuggestions = [];
    speciesActive = false;
    speciesSugIndex = -1;
    editingSpecies = false; // verlinkt → als Bibliotheks-Link darstellen
  }

  function onSpeciesKey(e: KeyboardEvent) {
    if (!speciesActive) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); speciesSugIndex = Math.min(speciesSugIndex + 1, speciesSuggestions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); speciesSugIndex = Math.max(speciesSugIndex - 1, -1); }
    else if (e.key === 'Escape') { speciesSuggestions = []; speciesActive = false; }
    else if (e.key === 'Enter' && speciesSugIndex >= 0 && speciesSuggestions[speciesSugIndex]) {
      e.preventDefault();
      selectSpecies(speciesSuggestions[speciesSugIndex]);
    }
  }


  // ─── Hintergrund (strukturierter Bibliotheks-Link; analog zur Spezies) ────────
  // `background` ist der abgeleitete Anzeige-String (auch fürs PDF), `backgroundRef`
  // die Source-of-Truth. Die Vorteile werden auf der Karte aus der Bibliothek aufgelöst.
  let backgroundIndex = $state<BackgroundInfo[]>([]);
  $effect(() => { getBackgroundsList().then((x) => { backgroundIndex = x; }); });

  let editingBackground = $state(!backgroundRef.sourceKey && !backgroundRef.name.trim());
  let backgroundActive = $state(false);
  let backgroundSuggestions = $state<BackgroundInfo[]>([]);
  let backgroundSugIndex = $state(-1);

  /** Bibliotheks-Pfad des verlinkten Hintergrunds, falls vorhanden. */
  function backgroundPath(): string | undefined {
    return backgroundRef.sourceKey
      ? backgroundIndex.find((b) => b.key === backgroundRef.sourceKey)?.path
      : undefined;
  }
  async function openBackgroundPage() {
    const path = backgroundPath();
    if (!path) return;
    if (!(await confirmNavigation())) return; // ungespeicherte Charakter-Änderungen
    activeFile.set({ name: path.split('/').pop()!.replace('.json', ''), path, type: 'background' });
  }

  function onBackgroundInput(value: string) {
    backgroundRef.name = value;
    background = value; // abgeleiteten Anzeige-String live mitführen
    backgroundRef.sourceKey = ''; // freies Tippen = (noch) nicht verlinkt
    backgroundActive = true;
    backgroundSugIndex = -1;
    backgroundSuggestions = value.trim() ? searchBackgrounds(backgroundIndex, value, 8) : [];
  }

  function selectBackground(info: BackgroundInfo) {
    backgroundRef.name = backgroundDisplayName(info);
    backgroundRef.sourceKey = info.key ?? '';
    background = backgroundRef.name;
    backgroundSuggestions = [];
    backgroundActive = false;
    backgroundSugIndex = -1;
    editingBackground = false; // verlinkt → als Bibliotheks-Link darstellen
  }

  function onBackgroundKey(e: KeyboardEvent) {
    if (!backgroundActive) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); backgroundSugIndex = Math.min(backgroundSugIndex + 1, backgroundSuggestions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); backgroundSugIndex = Math.max(backgroundSugIndex - 1, -1); }
    else if (e.key === 'Escape') { backgroundSuggestions = []; backgroundActive = false; }
    else if (e.key === 'Enter' && backgroundSugIndex >= 0 && backgroundSuggestions[backgroundSugIndex]) {
      e.preventDefault();
      selectBackground(backgroundSuggestions[backgroundSugIndex]);
    }
  }

  // ─── Nachziehbarer Altbestand (services/characterLegacyLinks.ts) ───────────────
  // Erkennung UND Verlinkung liegen im Modul; hier bleiben nur der Zustand, den es
  // mutiert, und der UI-Nachlauf (Anzeige-Spiegel, offene Picker).
  const legacyTarget = $derived<LegacyLinkTarget>({
    classes, legacyClassLevel: legacyClassLevelInit, species, backgroundRef,
    inventory, cantrips, spellsByLevel,
  });
  const legacyLibraries = $derived<LegacyLinkLibraries>({
    classes: classIndex, species: speciesIndex, backgrounds: backgroundIndex,
    items: itemIndex, spells: spellIndex,
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
      case 'species': race = species.name; speciesSuggestions = []; speciesActive = false; editingSpecies = false; break;
      case 'background': background = backgroundRef.name; backgroundSuggestions = []; backgroundActive = false; editingBackground = false; break;
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

  // ─── Read-only Merkmals-Vorschau (aus der Bibliothek aufgelöst) ────────────────
  // Zeigt im Editor, welche Klassen-/Subklassen-Merkmale bzw. Volks-Traits der
  // gewählte Link bis zur Stufe liefert (reagiert live auf Klasse/Stufe/Subklasse/Volk).
  let classFeatureGroups = $state<ResolvedFeatureGroup[]>([]);
  let speciesTraitGroups = $state<ResolvedFeatureGroup[]>([]);
  let backgroundGroups = $state<ResolvedFeatureGroup[]>([]);
  $effect(() => {
    const cls = $state.snapshot(classes);
    const spec = $state.snapshot(species);
    const bg = $state.snapshot(backgroundRef);
    void (async () => {
      const [c, s, b] = await Promise.all([resolveClassFeatures(cls), resolveSpeciesTraits(spec), resolveBackground(bg)]);
      const bgGroups = b ? [b] : [];
      const { annotations } = splitFeatureEntries(choiceEntries, keysOf([...c, ...(s ?? []), ...bgGroups]));
      classFeatureGroups = withChoices(c, annotations);
      speciesTraitGroups = withChoices(s ?? [], annotations);
      backgroundGroups = withChoices(bgGroups, annotations);
    })();
  });

  // ─── KI: die beiden Merkmals-Freitextfelder verdichten ─────────────────────────
  // Ein Prompt für beide Felder (`fieldSummaryAction`) — dieselbe Doktrin, die im
  // Stufenaufstieg die `sheetNote`s erzeugt. Rohstoff sind die aus der Bibliothek
  // aufgelösten DEUTSCHEN Merkmalstexte plus der bisherige Feldinhalt; das jeweils
  // andere Feld geht mit, damit keine Zeile in beiden Feldern landet.
  type SummaryField = keyof typeof SHEET_FIELDS;
  let summaryBusy = $state<SummaryField | null>(null);
  let summaryError = $state('');
  // Vorfassung je Feld — ein Fehlgriff der KI bleibt damit zurücknehmbar.
  let summaryUndo = $state<Partial<Record<SummaryField, string>>>({});

  function summaryFeaturesOf(groups: ResolvedFeatureGroup[], source: SummaryFeature['source']): SummaryFeature[] {
    return groups.flatMap((g) =>
      g.features.map((f) => ({
        // Hier sind Name und Text schon aufgelöst und deutsch (Bibliothek) — anders als im
        // Wizard, der die englische Fassung durchreicht. `nameDe` trägt deshalb dasselbe.
        name: f.name,
        nameDe: f.name,
        desc: f.desc,
        source,
        group: g.title,
        ...(f.gainedAt != null ? { gainedAt: f.gainedAt } : {}),
        ...(f.choice ? { choice: f.choice } : {}),
      })),
    );
  }

  async function summarizeField(field: SummaryField) {
    if (summaryBusy) return;
    summaryBusy = field;
    summaryError = '';
    try {
      const feats = await resolveFeatLinks($state.snapshot(refFeats));
      const features = [
        ...summaryFeaturesOf($state.snapshot(classFeatureGroups), 'class'),
        ...summaryFeaturesOf($state.snapshot(speciesTraitGroups), 'species'),
        ...summaryFeaturesOf($state.snapshot(backgroundGroups), 'background'),
        ...feats.map((f): SummaryFeature => ({
          name: f.name, desc: f.desc, source: 'feat',
          ...(f.gainedAt != null ? { gainedAt: f.gainedAt } : {}),
        })),
      ].filter((f) => f.name.trim() && f.desc.trim());

      const isClassField = field === 'classFeatures';
      const currentText = isClassField ? classFeatures : rassenmerkmale;
      const other = isClassField
        ? { label: SHEET_FIELDS.speciesTraits.label, text: rassenmerkmale }
        : { label: SHEET_FIELDS.classFeatures.label, text: classFeatures };

      const result = await runAiAction($llmConfig, buildFieldSummaryAction(),
        buildFieldSummaryInput({ target: SHEET_FIELDS[field], currentText, features, otherFields: [other] }));
      const text = result.text.trim();
      if (!text) {
        summaryError = 'Die KI lieferte keinen Text — Feld unverändert.';
        return;
      }
      summaryUndo = { ...summaryUndo, [field]: currentText };
      if (isClassField) classFeatures = text;
      else rassenmerkmale = text;
    } catch (e) {
      summaryError = e instanceof Error ? e.message : String(e);
    } finally {
      summaryBusy = null;
    }
  }

  function undoSummary(field: SummaryField) {
    const prev = summaryUndo[field];
    if (prev === undefined) return;
    if (field === 'classFeatures') classFeatures = prev;
    else rassenmerkmale = prev;
    summaryUndo = { ...summaryUndo, [field]: undefined };
  }

  // ─── Talente: nur Bibliotheks-Links ──────────────────────────────────────────
  // Ein Talent kommt ausschließlich aus der Bibliothek — freier Text erzeugt hier
  // keinen Eintrag mehr. Fehlt ein Talent, wird es über den „Neues Talent"-Dialog
  // als Karte angelegt (und ist danach im Picker wählbar).
  let featsLibrary = $state<FeatEntry[]>([]);
  // Vor dem ersten Laden sieht JEDER Link unverlinkt aus → „⚠"-Zeilen erst danach zeigen.
  let featsLoaded = $state(false);
  $effect(() => { getFeats().then((x) => { featsLibrary = x; featsLoaded = true; }); });

  /** Ziel des offenen Pickers: neuer Eintrag ('add') oder Ersatz für Zeile i. */
  let featPickerTarget = $state<'add' | number | null>(null);
  let featQuery = $state('');
  let featSugIndex = $state(-1);
  let showFeatCreate = $state(false);

  // Leere Eingabe = ganze Bibliothek als Dropdown; schon verlinkte Talente fallen raus.
  const featOptions = $derived.by(() => {
    const taken = new Set(
      refFeats
        .map((r) => matchFeatEntry(featsLibrary, { sourceKey: r.sourceKey, name: r.name })?.path)
        .filter((p): p is string => !!p),
    );
    const pool = featsLibrary.filter((f) => !f.path || !taken.has(f.path));
    return featQuery.trim() ? searchFeats(pool, featQuery, 8) : pool;
  });

  function openFeatPicker(target: 'add' | number) {
    featPickerTarget = target;
    featQuery = '';
    featSugIndex = -1;
  }
  function closeFeatPicker() {
    featPickerTarget = null;
    featQuery = '';
    featSugIndex = -1;
    hideFeatTooltip(); // Vorschlag verschwindet aus dem DOM → kein mouseleave mehr
  }

  // ─── Talent-Hover-Karte (analog Zauber-Tooltip; teilt dessen Cursor-Position,
  // weil nur ein Element unter dem Zeiger liegen kann) ─────────────────────────
  let featTooltip = $state<FeatEntry | null>(null);

  function showFeatTooltip(e: MouseEvent, entry: FeatEntry) {
    featTooltip = entry;
    tooltipX = e.clientX + 14;
    tooltipY = e.clientY + 14;
  }
  function moveFeatTooltip(e: MouseEvent) {
    if (!featTooltip) return;
    tooltipX = e.clientX + 14;
    tooltipY = e.clientY + 14;
  }
  function hideFeatTooltip() { featTooltip = null; }

  /** Übernimmt den LINK (Name + Key); Beschreibung kommt zur Laufzeit aus der Bibliothek. */
  function pickFeat(target: 'add' | number, f: FeatEntry) {
    const link = { sourceKey: f.sourceKey ?? '', name: featDisplayName(f) };
    if (target === 'add') refFeats.push({ ...link, choice: '', choiceDe: '', gainedAt: undefined, desc: '' });
    else {
      refFeats[target].sourceKey = link.sourceKey;
      refFeats[target].name = link.name;
      refFeats[target].desc = ''; // Legacy-Freitext-Beschreibung weicht der Bibliothek
    }
    closeFeatPicker();
  }

  function onFeatPickerKey(e: KeyboardEvent, target: 'add' | number) {
    if (featPickerTarget !== target) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); featSugIndex = Math.min(featSugIndex + 1, featOptions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); featSugIndex = Math.max(featSugIndex - 1, -1); }
    else if (e.key === 'Escape') closeFeatPicker();
    // Enter ohne markierten Treffer tut bewusst nichts — freier Text darf kein Talent anlegen.
    else if (e.key === 'Enter' && featSugIndex >= 0 && featOptions[featSugIndex]) {
      e.preventDefault();
      pickFeat(target, featOptions[featSugIndex]);
    }
  }

  /**
   * Diff-Richtung einer Talent-Zeile. Die Baseline wird über den Key (Fallback: Name)
   * gesucht, NICHT über den Index: `cleanRefs` filtert beim Speichern namenlose
   * Ledger-Einträge weg, wodurch die gespeicherte Liste verschoben sein kann — mit
   * Index-Zuordnung bliebe dann jede Folgezeile dauerhaft grün.
   * Verglichen wird nur, was diese Zeile pflegt: Link und erworbene Stufe.
   */
  function featDir(ref: { sourceKey?: string; name: string; gainedAt?: number }): DiffDir {
    if (!saved || !ref.name.trim()) return 'none';
    const key = (ref.sourceKey ?? '').trim();
    // „Unverändert" = es gibt einen gespeicherten Eintrag mit gleichem Link UND gleicher
    // Stufe. Über die Stufe, weil dasselbe Talent mehrfach vergeben sein darf.
    const unchanged = savedFeatLinks.some(
      (s) =>
        (key ? (s.sourceKey ?? '').trim() === key : !(s.sourceKey ?? '').trim()) &&
        s.name === ref.name &&
        (s.gainedAt ?? null) === (ref.gainedAt ?? null),
    );
    return unchanged ? 'none' : 'up';
  }

  /** Öffnet die Talent-Karte der Bibliothek (verlässt den Charakter → Guard). */
  async function openFeatPage(entry: FeatEntry) {
    if (!entry.path) return;
    if (!(await confirmNavigation())) return;
    activeFile.set({ name: entry.path.split('/').pop()!.replace('.json', ''), path: entry.path, type: 'feat' });
  }

  /** „Neues Talent": derselbe Dialog wie in der Sidebar. Er öffnet den Entwurf im
   *  Editor, der Charakter wird also verlassen — daher Guard schon vor dem Dialog. */
  async function createFeatCard() {
    if (!(await confirmNavigation())) return;
    closeFeatPicker();
    showFeatCreate = true;
  }

  // Formularzustand fortlaufend in den Draft (ed.draft) spiegeln → Dirty-Tracking und
  // Save-Bar des EditorPanel greifen ohne eigenen Speichern-Button. Schlüssel-Reihenfolge
  // entspricht dem Zod-Schema, damit ein frisch geladener Charakter NICHT „dirty" wirkt.
  // Liest nur die *Init-Werte (keine reaktiven character.*-Reads) → keine Schleife.
  $effect(() => {
    character.name = name;
    // classes = Source-of-Truth; classLevel wird als Anzeige-String daraus abgeleitet.
    // Lokale const NICHT über character.classes zurücklesen → sonst Read-after-Write-Schleife.
    const cleanedClasses = classes.filter((c) => c.name.trim() !== '').map((c) => ({ ...c }));
    character.classes = cleanedClasses;
    character.classLevel = formatClassLevel(cleanedClasses);
    character.playerName = playerName;
    // backgroundRef = Source-of-Truth; background ist der daraus abgeleitete Anzeige-String.
    character.backgroundRef = { ...backgroundRef };
    character.background = background;
    character.species = { ...species };
    character.race = race; character.xp = xp;
    character.str = str; character.ges = ges; character.kon = kon;
    character.int = int; character.wei = wei; character.cha = cha;
    character.strMod = strMod; character.gesMod = gesMod; character.konMod = konMod;
    character.intMod = intMod; character.weiMod = weiMod; character.chaMod = chaMod;
    character.ac = ac; character.initiative = initiative; character.speed = speed;
    character.hpMax = hpMax; character.hpCurrent = hpCurrent; character.hpTemp = hpTemp;
    character.proficiencyBonus = proficiencyBonus;
    character.passivePerception = passivePerceptionInit;
    character.hitDice = hitDice;
    character.strSaveProf = strSaveProf; character.gesSaveProf = gesSaveProf;
    character.konSaveProf = konSaveProf; character.intSaveProf = intSaveProf;
    character.weiSaveProf = weiSaveProf; character.chaSaveProf = chaSaveProf;
    character.skills = computedSkills;
    character.attacks = attacks
      .filter((a) => a.name.trim() !== '')
      .map((a) => {
        // Angetippte, aber nie gefüllte Effektzeilen fliegen raus — wie beim Inventar.
        const modifiers = (a.modifiers ?? [])
          .filter((m) => m.label.trim() !== '' || m.attackBonus !== 0 || m.damageBonus !== 0)
          .map((m) => ({ ...m }));
        const out = a.auto
          ? { ...a, bonus: computeAttackBonus(a), damage: computeAttackDamage(a) }
          : { ...a };
        // Leeres `modifiers` NICHT schreiben: sonst bekäme jede Waffe ohne Effekte den
        // Schlüssel, und der Diff gegen den geladenen Stand bliebe dauerhaft „geändert".
        if (modifiers.length) out.modifiers = modifiers;
        else delete out.modifiers;
        return out;
      });
    character.classFeatures = classFeatures;
    character.traits = traits; character.ideals = ideals;
    character.bonds = bonds; character.flaws = flaws;
    character.languages = [...languages];
    character.tools = [...tools];
    character.alleskoenner = alleskoenner;
    character.currency = { ...currency };
    character.inventory = inventory
      .filter((i) => i.name.trim() !== '')
      // Ein leerer `sourceKey` ist kein Link — das Feld fällt dann ganz weg.
      .map((i) => {
        const key = i.sourceKey?.trim();
        return { name: i.name, ...(key ? { sourceKey: key } : {}), count: i.count, weight: i.weight };
      });
    character.inventoryNotes = inventoryNotes;
    // Gesamtlast wird überall live aus Anzahl × Gewicht/Stück berechnet (inventoryWeight);
    // das gespeicherte Feld ist nur noch Alt-Ballast → unverändert durchreichen (kein Dirty).
    character.totalWeight = totalWeightInit;
    character.spells = {
      spellcastingClass: spellClass,
      spellcastingAbility: spellAbility,
      saveDC: spellAutoActive ? computedSpellSaveDC! : spellSaveDC,
      attackBonus: spellAutoActive ? computedSpellAttack! : spellAttackBonus,
      autoCalc: spellAutoCalc,
      slots: slotTotals.map((total, i) => ({ total, used: slotsUsedInit[i] ?? 0 })),
      cantrips: cantrips.map((c) => ({ ...c })),
      byLevel: Object.fromEntries(
        Object.entries(spellsByLevel)
          .filter(([, v]) => v.length > 0)
          .map(([k, v]) => [k, v.map((s) => ({ ...s }))]),
      ),
    };
    character.personal = {
      rassenmerkmale, alter, geschlecht, sizeCat, gesinnung, glaube,
      lebensstil, taeglicheKosten, augenfarbe, haarfarbe, hautfarbe,
      gewicht, koerpergroesse, aussehen,
    };
    character.proficiencies = {
      simpleWeapons: profSimpleWeapons,
      martialWeapons: profMartialWeapons,
      otherWeapons: profOtherWeapons,
      lightArmor: profLightArmor,
      mediumArmor: profMediumArmor,
      heavyArmor: profHeavyArmor,
      shields: profShields,
    };
    character.masteries = [...masteries];
    const cleanRefs = (list: typeof refFeats) =>
      list
        .filter((r) => r.name.trim() !== '')
        .map((r) => ({
          sourceKey: r.sourceKey ?? '',
          name: r.name,
          choice: '',
          choiceDe: '',
          gainedAt: r.gainedAt == null || Number.isNaN(r.gainedAt) ? undefined : Number(r.gainedAt),
          desc: r.desc ?? '',
        }));
    character.features = [...cleanRefs(refFeats), ...choiceEntries];
    character.portraitFile = portraitFile || undefined;
  });

  const ATTRS = [
    { key: 'str', label: 'STR' },
    { key: 'ges', label: 'GES' },
    { key: 'kon', label: 'KON' },
    { key: 'int', label: 'INT' },
    { key: 'wei', label: 'WEI' },
    { key: 'cha', label: 'CHA' },
  ] as const;
</script>

<div class="edit-form">
  <!-- Speichern/Verwerfen übernimmt die EditorPanel-Save-Bar (kein eigener Button). -->

  <!-- Read-only Merkmals-Auflösung (aus der Bibliothek): was der Klassen-/Volks-LINK liefert. -->
  {#snippet featureGroups(groups: ResolvedFeatureGroup[], emptyHint: string)}
    {#if !groups.length}
      <p class="fp-empty">{emptyHint}</p>
    {:else}
      {#each groups as g}
        <div class="fp-group">
          <span class="fp-title">{g.title}</span>
          {#if g.unresolved}
            <span class="fp-unresolved">— nicht in der Bibliothek verlinkt</span>
          {:else if g.features.length}
            <ul class="fp-list">
              {#each g.features as f}
                <li>
                  <div class="fp-head">
                    <span class="fp-name">{f.name}</span>
                    {#if f.gainedAt}<span class="fp-lvl">Stufe {f.gainedAt}</span>{/if}
                    {#if f.choice}<span class="fp-choice">Entscheidung: {f.choice}</span>{/if}
                  </div>
                  {#if f.desc}<div class="fp-desc"><Markdown source={f.desc} /></div>{/if}
                </li>
              {/each}
            </ul>
          {:else}
            <span class="fp-unresolved">— keine</span>
          {/if}
        </div>
      {/each}
    {/if}
  {/snippet}

  <!-- Talent-Picker: Dropdown über die Bibliothek. Einmal zum Hinzufügen, einmal je
       Altdaten-Zeile zum Ersetzen — deshalb als Snippet mit Ziel-Parameter. -->
  {#snippet featPicker(target: 'add' | number, placeholder: string)}
    <div class="autocomplete-wrap feat-picker">
      <input
        value={featPickerTarget === target ? featQuery : ''}
        {placeholder}
        onfocus={() => openFeatPicker(target)}
        oninput={(e) => { featPickerTarget = target; featQuery = (e.currentTarget as HTMLInputElement).value; featSugIndex = -1; }}
        onkeydown={(e) => onFeatPickerKey(e, target)}
        onblur={() => setTimeout(() => { if (featPickerTarget === target) closeFeatPicker(); }, 150)}
      />
      {#if featPickerTarget === target}
        <ul class="suggestions">
          {#each featOptions as opt, si}
            <li class:active={si === featSugIndex} onmousedown={() => pickFeat(target, opt)}
              onmouseenter={(e) => showFeatTooltip(e, opt)}
              onmousemove={moveFeatTooltip}
              onmouseleave={hideFeatTooltip}>
              <span>{featDisplayName(opt)}</span>
              {#if opt.category}<span class="sug-cat">{FEAT_CATEGORY_DE[opt.category]}</span>{/if}
            </li>
          {/each}
          {#if !featOptions.length}
            <li class="sug-empty">Kein Treffer in der Bibliothek — mit „+ Neues Talent" anlegen.</li>
          {/if}
        </ul>
      {/if}
    </div>
  {/snippet}

  <!-- KI-Verdichtung eines Freitextfeldes — ein Knopf je Feld, gleiche Aktion. -->
  {#snippet summaryBtn(field: SummaryField)}
    <span class="summary-actions">
      {#if summaryUndo[field] !== undefined && summaryBusy !== field}
        <button class="ai-btn" onclick={() => undoSummary(field)} title="Fassung vor der Zusammenfassung wiederherstellen">↩ Zurück</button>
      {/if}
      <button class="ai-btn" onclick={() => summarizeField(field)} disabled={summaryBusy !== null}
        title="Aus allen verlinkten Merkmalen und dem bisherigen Text eine knappe Fassung für den Bogen erzeugen">
        {summaryBusy === field ? '⏳ KI verdichtet…' : '✨ Zusammenfassen'}
      </button>
    </span>
  {/snippet}

  <!-- ── Umstellungs-Angebot: Schemaversion der Datei + alles Nachverlinkbare ─── -->
  {#if pendingUpgrade || legacyFixes.length}
    <div class="legacy-banner upgrade-banner">
      <span class="legacy-banner-text">
        {#if pendingUpgrade}
          Diese Datei liegt im Format <strong>v{pendingUpgrade.fromVersion}</strong> vor
          (aktuell: <strong>v{pendingUpgrade.toVersion}</strong>).
        {:else}
          Dieser Charakter lässt sich vollständiger mit der Bibliothek verknüpfen.
        {/if}
        <ul class="upgrade-steps">
          {#if pendingUpgrade}
            {#each pendingUpgrade.applied as step}<li>{step}</li>{/each}
            {#if !pendingUpgrade.applied.length}<li>Versionsstempel nachtragen</li>{/if}
          {/if}
          {#each legacyFixes as fix}<li>{fix.label}</li>{/each}
        </ul>
      </span>
      {#if pendingUpgrade && upgradeAccepted && !legacyFixes.length}
        <span class="upgrade-done">✓ Wird beim Speichern übernommen</span>
      {:else}
        <button type="button" class="legacy-banner-btn" onclick={applyAllFixes}
          title="Übernimmt alles hier Aufgeführte — geschrieben wird über Speichern.">
          Alles umstellen
        </button>
      {/if}
    </div>
  {/if}

  <!-- ── Kopf ─── -->
  <section>
    <h3>Allgemein</h3>
    <div class="grid-2">
      <label use:diffMark={dirOf(saved?.name, name)}>Name<input bind:value={name} placeholder="Charaktername" /></label>
      <label use:diffMark={dirOf(saved?.playerName, playerName)}>Spieler<input bind:value={playerName} placeholder="Spielername" /></label>
      <label use:diffMark={dirOf(saved?.xp, xp)}>EP<input bind:value={xp} placeholder="0" /></label>
    </div>

    <!-- Hintergrund als Bibliotheks-Link (Vorteile werden auf der Karte aufgelöst; `background` = Anzeige). -->
    <div class="ref-block species-block" use:diffMark={dirOf(saved?.background, background)}>
      <h4>Hintergrund</h4>
      {#if fixOf('background')}
        {@const fix = fixOf('background')}
        <div class="legacy-banner">
          <span class="legacy-banner-text">
            Altes Freitext-Format erkannt: „{backgroundRef.name}" lässt sich mit der Bibliothek verknüpfen.
          </span>
          <button type="button" class="legacy-banner-btn" onclick={() => applyFix(fix)}>Verknüpfen</button>
        </div>
      {/if}
      {#if backgroundRef.sourceKey && !editingBackground}
        <div class="class-linked">
          <button type="button" class="class-link" title="Bibliotheks-Seite öffnen" onclick={openBackgroundPage}>{backgroundRef.name}</button>
          <button type="button" class="link-edit" title="Hintergrund ändern" onclick={() => { editingBackground = true; }}>✎</button>
        </div>
      {:else}
        <div class="autocomplete-wrap species-picker">
          <input
            value={backgroundRef.name}
            placeholder="z.B. Soldat"
            oninput={(e) => onBackgroundInput((e.currentTarget as HTMLInputElement).value)}
            onkeydown={onBackgroundKey}
            onblur={() => setTimeout(() => { backgroundActive = false; backgroundSuggestions = []; if (backgroundRef.sourceKey) editingBackground = false; }, 150)}
          />
          {#if backgroundActive && backgroundSuggestions.length > 0}
            <ul class="suggestions">
              {#each backgroundSuggestions as sug, bi}
                <li class:active={bi === backgroundSugIndex} onmousedown={() => selectBackground(sug)}>
                  <span>{backgroundDisplayName(sug)}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
        {#if !backgroundRef.sourceKey && backgroundRef.name.trim() && !fixOf('background')}
          <p class="species-hint">Nicht in der Bibliothek verlinkt – aus der Liste wählen oder als Hintergrund anlegen.</p>
        {/if}
      {/if}
    </div>

    <!-- Volk als Bibliotheks-Link (Traits werden auf der Karte aufgelöst; `race` = Anzeige). -->
    <div class="ref-block species-block" use:diffMark={dirOf(saved?.race, race)}>
      <h4>Volk</h4>
      {#if fixOf('species')}
        {@const fix = fixOf('species')}
        <div class="legacy-banner">
          <span class="legacy-banner-text">
            Altes Freitext-Format erkannt: „{species.name}" lässt sich mit der Bibliothek verknüpfen.
          </span>
          <button type="button" class="legacy-banner-btn" onclick={() => applyFix(fix)}>Verknüpfen</button>
        </div>
      {/if}
      {#if species.sourceKey && !editingSpecies}
        <div class="class-linked">
          <button type="button" class="class-link" title="Bibliotheks-Seite öffnen" onclick={openSpeciesPage}>{species.name}</button>
          <button type="button" class="link-edit" title="Volk ändern" onclick={() => { editingSpecies = true; }}>✎</button>
        </div>
      {:else}
        <div class="autocomplete-wrap species-picker">
          <input
            value={species.name}
            placeholder="z.B. Zwerg"
            oninput={(e) => onSpeciesInput((e.currentTarget as HTMLInputElement).value)}
            onkeydown={onSpeciesKey}
            onblur={() => setTimeout(() => { speciesActive = false; speciesSuggestions = []; if (species.sourceKey) editingSpecies = false; }, 150)}
          />
          {#if speciesActive && speciesSuggestions.length > 0}
            <ul class="suggestions">
              {#each speciesSuggestions as sug, si}
                <li class:active={si === speciesSugIndex} onmousedown={() => selectSpecies(sug)}>
                  <span>{speciesDisplayName(sug)}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
        {#if !species.sourceKey && species.name.trim() && !fixOf('species')}
          <p class="species-hint">Nicht in der Bibliothek verlinkt – aus der Liste wählen oder als Volk anlegen.</p>
        {/if}
      {/if}
    </div>

    <!-- Klasse & Stufe strukturiert (multiclass-fähig); „Klasse & Stufe"-Anzeige wird abgeleitet. -->
    <div class="ref-block class-block" use:diffMark={dirOf(saved?.classLevel, classLevelPreview)}>
      <h4>Klassen & Stufen{#if charTotalLevel > 0} <span class="class-total">· Gesamtstufe {charTotalLevel}</span>{/if}</h4>
      {#if fixOf('classes')}
        {@const fix = fixOf('classes')}
        <div class="legacy-banner">
          <span class="legacy-banner-text">Altes Freitext-Format erkannt: {fix?.label}.</span>
          <button type="button" class="legacy-banner-btn" onclick={() => applyFix(fix)}>Aufs neue Format umstellen</button>
        </div>
      {/if}
      <table class="ref-table">
        <thead><tr><th>Klasse</th><th>Stufe</th><th>Subklasse</th><th></th></tr></thead>
        <tbody>
          {#each classes as cls, i}
            {@const path = classPath(cls)}
            {@const subs = subclassesFor(cls)}
            <tr>
              <td>
                {#if path && editingClassRow !== i}
                  <div class="class-linked">
                    <button type="button" class="class-link" title="Bibliotheks-Seite öffnen" onclick={() => openClassPage(cls)}>{cls.name}</button>
                    <button type="button" class="link-edit" title="Klasse ändern" onclick={() => { editingClassRow = i; }}>✎</button>
                  </div>
                {:else}
                  <div class="autocomplete-wrap">
                    <input
                      value={cls.name}
                      placeholder="z.B. Waldläufer"
                      oninput={(e) => { cls.name = (e.currentTarget as HTMLInputElement).value; onClassNameInput(i, cls.name); }}
                      onkeydown={(e) => onClassNameKey(e, i)}
                      onblur={() => setTimeout(() => { if (activeClassRow === i) { classSuggestions = []; activeClassRow = -1; } editingClassRow = -1; }, 150)}
                    />
                    {#if activeClassRow === i && classSuggestions.length > 0}
                      <ul class="suggestions">
                        {#each classSuggestions as sug, si}
                          <li class:active={si === classSugIndex} onmousedown={() => selectClassSuggestion(i, sug)}>
                            <span>{classDisplayName(sug)}</span>
                          </li>
                        {/each}
                      </ul>
                    {/if}
                  </div>
                {/if}
              </td>
              <td><input class="ref-level" type="number" min="1" max="20" value={cls.level}
                oninput={(e) => { const v = parseInt((e.target as HTMLInputElement).value); cls.level = Number.isNaN(v) ? 1 : Math.min(20, Math.max(1, v)); }} /></td>
              <td>
                {#if subs.length > 0}
                  <select value={cls.subclassKey ?? ''} onchange={(e) => setSubclass(i, (e.currentTarget as HTMLSelectElement).value)}>
                    <option value="">— keine —</option>
                    {#each subs as sub}
                      <option value={sub.key}>{classDisplayName(sub)}</option>
                    {/each}
                  </select>
                {:else}
                  <span class="subclass-na">—</span>
                {/if}
              </td>
              <td><button class="remove-btn" onclick={() => removeClass(i)}>✕</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
      <button class="btn-add" onclick={addClass}>+ Klasse</button>
      {#if classLevelPreview}<p class="class-preview">Anzeige: {classLevelPreview}</p>{/if}
    </div>
  </section>

  <!-- ── Attribute ─── -->
  <section>
    <h3>Attribute</h3>
    <div class="attr-row">
      {#each ATTRS as attr}
        {@const score = attr.key === 'str' ? str : attr.key === 'ges' ? ges : attr.key === 'kon' ? kon : attr.key === 'int' ? int : attr.key === 'wei' ? wei : cha}
        {@const mod = modFor(score)}
        <div class="attr-box" use:diffMark={dirOf((saved as Record<string, unknown> | null | undefined)?.[attr.key], score)}>
          <span class="attr-mod-display">{sign(mod)}</span>
          <span class="attr-label">{attr.label}</span>
          <input
            class="attr-input"
            type="number"
            min="1" max="30"
            value={score}
            oninput={(e) => {
              const v = Number((e.target as HTMLInputElement).value);
              if (attr.key === 'str') str = v;
              else if (attr.key === 'ges') ges = v;
              else if (attr.key === 'kon') kon = v;
              else if (attr.key === 'int') int = v;
              else if (attr.key === 'wei') wei = v;
              else cha = v;
            }}
          />
        </div>
      {/each}
    </div>
  </section>

  <!-- ── Kampf ─── -->
  <section>
    <h3>Kampfwerte</h3>
    <div class="grid-3">
      <label use:diffMark={dirOf(saved?.ac, ac)}>RK<input bind:value={ac} placeholder="15" /></label>
      <label use:diffMark={dirOf(saved?.initiative, initiative)}>Initiative<input bind:value={initiative} placeholder="+2" /></label>
      <label use:diffMark={dirOf(saved?.speed, speed)}>Bewegung (m)
        <input inputmode="decimal" value={speed} oninput={onSpeedInput} placeholder="9" />
      </label>
      <label use:diffMark={dirOf(saved?.hitDice, hitDice)}>Trefferwürfel<input bind:value={hitDice} placeholder="5W10" /></label>
      <label use:diffMark={dirOf(saved?.hpMax, hpMax)}>TP Maximum<input bind:value={hpMax} placeholder="45" /></label>
      <label use:diffMark={dirOf(saved?.hpCurrent, hpCurrent)}>TP Aktuell<input bind:value={hpCurrent} placeholder="45" /></label>
      <label use:diffMark={dirOf(saved?.hpTemp, hpTemp)}>Temp. TP<input bind:value={hpTemp} placeholder="0" /></label>
      <label use:diffMark={dirOf(saved?.proficiencyBonus, proficiencyBonus)}>Übungsbonus
        <input type="number" bind:value={proficiencyBonus} min="2" max="6" />
      </label>
    </div>
  </section>

  <!-- ── Rettungswürfe ─── -->
  <section>
    <h3>Rettungswürfe (Übungen)</h3>
    <div class="save-checks">
      {#each [['STR', strSaveProf, (v: boolean) => (strSaveProf = v), strMod, 'Strength'],
              ['GES', gesSaveProf, (v: boolean) => (gesSaveProf = v), gesMod, 'Dexterity'],
              ['KON', konSaveProf, (v: boolean) => (konSaveProf = v), konMod, 'Constitution'],
              ['INT', intSaveProf, (v: boolean) => (intSaveProf = v), intMod, 'Intelligence'],
              ['WEI', weiSaveProf, (v: boolean) => (weiSaveProf = v), weiMod, 'Wisdom'],
              ['CHA', chaSaveProf, (v: boolean) => (chaSaveProf = v), chaMod, 'Charisma']] as [label, checked, setter, mod, en]}
        {@const saveSource = grantSourcesFor(grants?.savingThrows, en as string)}
        <label class="check-row" use:diffMark={dirOf((saved as Record<string, unknown> | null | undefined)?.[`${(label as string).toLowerCase()}SaveProf`], checked)}>
          <input type="checkbox" checked={checked as boolean} onchange={(e) => (setter as (v: boolean) => void)((e.target as HTMLInputElement).checked)} />
          <span class="check-label">{label}</span>
          {#if saveSource}<span class="grant-mark" title={saveSource}>◆</span>{/if}
          <span class="check-val">{sign((mod as number) + ((checked as boolean) ? proficiencyBonus : 0))}</span>
        </label>
      {/each}
    </div>
  </section>

  <!-- ── Fertigkeiten ─── -->
  <section>
    <h3>Fertigkeiten</h3>

    <label class="check-row alleskoenner" use:diffMark={dirOf(saved?.alleskoenner, alleskoenner)}>
      <input type="checkbox" bind:checked={alleskoenner} />
      <span>Alleskönner</span>
    </label>
    <div class="skill-grid">
      {#each SKILL_DEFS as def}
        {@const flags = skillFlags[def.key]}
        {@const computed = computedSkills[def.key]}
        {@const savedSkill = saved?.skills?.[def.key]}
        {@const skillDir = !saved ? 'none'
          : (flags.prof && !savedSkill?.prof) || (flags.exp && !savedSkill?.exp) ? 'up'
          : (!flags.prof && savedSkill?.prof) || (!flags.exp && savedSkill?.exp) ? 'down' : 'none'}
        <div class="skill-edit-row" use:diffMark={skillDir}>
          <input
            type="checkbox"
            checked={flags.prof}
            title="Übung"
            onchange={(e) => { skillFlags[def.key].prof = (e.target as HTMLInputElement).checked; if (!skillFlags[def.key].prof) skillFlags[def.key].exp = false; }}
          />
          <input
            type="checkbox"
            checked={flags.exp}
            title="Expertise"
            disabled={!flags.prof}
            onchange={(e) => { skillFlags[def.key].exp = (e.target as HTMLInputElement).checked; }}
          />
          <span class="skill-name" class:proficient={flags.prof} class:expertise={flags.exp}>{def.label}</span>
          {#if grantMarks.has(def.key)}
            <span class="grant-mark" title={grantMarks.get(def.key)!.join(' · ')}>◆</span>
          {/if}
          <span class="skill-val">{sign(computed.value)}</span>
        </div>
      {/each}
    </div>
  </section>

  <!-- ── Angriffe ─── -->
  <section>
    <h3>Angriffe</h3>

    <div class="autocomplete-wrap weapon-picker">
      <input
        placeholder="Waffe aus Bibliothek hinzufügen…"
        bind:value={weaponSearch}
        onkeydown={onWeaponSearchKey}
      />
      {#if weaponSuggestions.length}
        <ul class="suggestions">
          {#each weaponSuggestions as sug, i}
            <li
              class:active={i === weaponSugIndex}
              onclick={() => selectWeaponSuggestion(sug)}
              onmouseenter={() => (weaponSugIndex = i)}
            >
              <span>{displayName(sug.item)}</span>
              <span class="sug-cat" style:color={CATEGORY_COLORS[sug.item.category] ?? 'var(--ink-muted)'}>
                {sug.item.category}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <table class="attack-table">
      <thead><tr><th>Waffe</th><th>Bonus</th><th>Schaden</th><th>Typ</th><th>RW</th><th></th><th></th></tr></thead>
      <tbody>
        {#each attacks as atk, i}
          {@const atkDir = !saved || !atk.name.trim() ? 'none'
            : i >= (saved.attacks?.length ?? 0) ? 'up'
            : classifyChange(attackForDiff($state.snapshot(saved.attacks[i])), attackForDiff($state.snapshot(atk)))}
          <tr use:diffMark={atkDir}>
            <td><input bind:value={atk.name} placeholder="Langschwert" /></td>
            {#if atk.auto}
              <td><span class="computed-cell" title={attackBonusTip(atk)}>{computeAttackBonus(atk)}</span></td>
              <td><span class="computed-cell" title={attackDamageTip(atk)}>{computeAttackDamage(atk) || '—'}</span></td>
            {:else}
              <td><input bind:value={atk.bonus} placeholder="+5" /></td>
              <td><input bind:value={atk.damage} placeholder="1W8+3" /></td>
            {/if}
            <td><input bind:value={atk.type} placeholder="Hieb" /></td>
            <td><input bind:value={atk.range} placeholder="Nah" /></td>
            <td>
              <button type="button" class="mode-btn" class:active={atk.auto}
                title={atk.auto ? 'Reaktiv berechnet – klicken für manuelle Eingabe' : 'Manuell – klicken für automatische Berechnung'}
                onclick={() => toggleAttackMode(i)}>{atk.auto ? '🔗' : '✎'}</button>
            </td>
            <td><button class="remove-btn" onclick={() => removeAttack(i)}>✕</button></td>
          </tr>
          {#if atk.auto}
            <tr class="attack-auto-row">
              <td colspan="7">
                <div class="auto-controls">
                  <label class="ac-field">Attribut
                    <select bind:value={atk.ability}>
                      <option value="str">STR ({sign(strMod)})</option>
                      <option value="ges">GES ({sign(gesMod)})</option>
                      <option value="finesse">Finesse ({sign(Math.max(strMod, gesMod))})</option>
                    </select>
                  </label>
                  <label class="ac-check">
                    <input type="checkbox" bind:checked={atk.proficient} /> geübt (+{proficiencyBonus})
                  </label>
                  <label class="ac-field">Würfel
                    <input class="ac-dice" bind:value={atk.baseDamage} placeholder="1W8" />
                  </label>
                  <label class="ac-field">Magie
                    <input class="ac-magic" type="number" step="1"
                      value={atk.magicBonus ?? 0}
                      oninput={(e) => (atk.magicBonus = parseInt((e.target as HTMLInputElement).value) || 0)} />
                  </label>
                </div>

                <!-- Nicht-magische Effekte (Kampfstil, Segen …). Gehören hierher und nicht
                     ins Feld „Magie", sonst wandert Nicht-Magisches in die Gegenstands-Logik. -->
                <div class="attack-mods">
                  {#each atk.modifiers ?? [] as m, j}
                    <div class="am-row">
                      <input class="am-label" bind:value={m.label} placeholder="Kampfstil „Bogenschießen“" />
                      <label class="ac-field">Angriff
                        <input class="am-num" type="number" step="1"
                          value={m.attackBonus}
                          oninput={(e) => (m.attackBonus = parseInt((e.target as HTMLInputElement).value) || 0)} />
                      </label>
                      <label class="ac-field">Schaden
                        <input class="am-num" type="number" step="1"
                          value={m.damageBonus}
                          oninput={(e) => (m.damageBonus = parseInt((e.target as HTMLInputElement).value) || 0)} />
                      </label>
                      <button type="button" class="remove-btn" title="Effekt entfernen"
                        onclick={() => removeAttackModifier(i, j)}>✕</button>
                    </div>
                  {/each}
                  <button type="button" class="am-add" onclick={() => addAttackModifier(i)}>+ Effekt</button>
                </div>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
    <button class="btn-add" onclick={addAttack}>+ Angriff</button>
  </section>

  <!-- ── Waffenbeherrschung ─── -->
  <!-- Direkt bei den Angriffen, weil die Wahl nach jeder langen Rast wechseln kann —
       Kein Vorschlag wie im Grant-Panel: das hier IST die Wahl. -->
  {#if mastery && mastery.allowance > 0}
    <section>
      <WeaponMasteryPicker
        offer={mastery}
        bind:masteries
        diff={dirOf(saved?.masteries, $state.snapshot(masteries))}
      />
    </section>
  {/if}

  <!-- ── Klassenmerkmale & Volksmerkmale ─── -->
  <!-- Beide Felder wandern ins PDF und sind knapp bemessen — daher je ein KI-Knopf,
       der aus den verlinkten Merkmalen eine bogentaugliche Fassung verdichtet. -->
  <section>
    <div class="field-head">
      <h3>Klassenmerkmale & Eigenschaften</h3>
      {@render summaryBtn('classFeatures')}
    </div>
    <textarea class="ta-large" use:diffMark={dirOf(saved?.classFeatures, classFeatures)} bind:value={classFeatures} placeholder="Klassenmerkmale, Rasseneigenschaften…"></textarea>

    <div class="field-head sub">
      <span class="field-title">Volksmerkmale</span>
      {@render summaryBtn('speciesTraits')}
    </div>
    <textarea class="ta-medium" aria-label="Volksmerkmale"
      use:diffMark={dirOf(saved?.personal?.rassenmerkmale, rassenmerkmale)}
      bind:value={rassenmerkmale} placeholder="Dunkelsicht, Zwergenresistenz, …"></textarea>

    {#if summaryError}<p class="summary-error">{summaryError}</p>{/if}
  </section>

  <!-- ── Verknüpfte Merkmale & Talente ─── -->
  <!-- Klasse & Volk liefern ihre Merkmale read-only aus der Bibliothek (abgeleitet aus
       Link + Stufe, nicht hier editiert). Talente werden als Link gepflegt. -->
  <section>
    <details class="ref-section">
      <summary>Verknüpfte Merkmale & Talente</summary>
      <p class="ref-hint">Klassen-, Volks- & Hintergrundmerkmale werden aus der Bibliothek aufgelöst (read-only). Talente kommen immer aus der Bibliothek — fehlt eines, zuerst als Talent-Karte anlegen. Beschreibungen kommen aus der Bibliothek, nicht ins PDF.</p>

      <div class="ref-block">
        <h4>Klassenmerkmale</h4>
        {@render featureGroups(classFeatureGroups, 'Keine verlinkte Klasse — oben eine Klasse aus der Bibliothek wählen.')}
      </div>
      <div class="ref-block">
        <h4>Volksmerkmale</h4>
        {@render featureGroups(speciesTraitGroups, 'Kein verlinktes Volk — oben ein Volk aus der Bibliothek wählen.')}
      </div>
      <div class="ref-block">
        <h4>Hintergrund</h4>
        {@render featureGroups(backgroundGroups, 'Kein verlinkter Hintergrund — oben einen Hintergrund aus der Bibliothek wählen.')}
      </div>

      <div class="ref-block">
        <h4>Talente</h4>
        <!-- Gleiche Karten-Optik wie die aufgelösten Klassen-/Volksmerkmale (fp-*),
             nur mit Stufe/Entfernen als Bedienelemente. -->
        {#if refFeats.length}
          <ul class="fp-list">
            {#each refFeats as ref, i}
              {@const entry = matchFeatEntry(featsLibrary, { sourceKey: ref.sourceKey, name: ref.name })}
              <li class="feat-row" use:diffMark={featDir(ref)}>
                <div class="fp-head">
                  {#if entry}
                    <button type="button" class="fp-name fp-name-link" title="Talent-Karte öffnen" onclick={() => openFeatPage(entry)}>{featDisplayName(entry)}</button>
                    {#if entry.category}<span class="fp-choice">{FEAT_CATEGORY_DE[entry.category]}</span>{/if}
                  {:else if featPickerTarget === i}
                    {@render featPicker(i, 'Talent aus der Bibliothek…')}
                  {:else if !featsLoaded}
                    <span class="fp-name feat-loading">{ref.name}</span>
                  {:else}
                    <!-- Altdaten: Freitext ohne Bibliotheks-Quelle. Ersetzen oder löschen. -->
                    <span class="fp-name ref-unlinked" title="Kein Talent dieses Namens in der Bibliothek">⚠ {ref.name.trim() || '(ohne Namen)'}</span>
                    <button type="button" class="link-edit" title="Aus der Bibliothek wählen" onclick={() => openFeatPicker(i)}>✎</button>
                  {/if}
                  <span class="feat-row-actions">
                    <label class="feat-lvl" title="Charakterstufe, auf der das Talent erworben wurde (nur Herkunftsangabe, ohne Regelwirkung)">Stufe
                      <input class="ref-level" type="number" min="1" max="20" value={ref.gainedAt ?? ''}
                        oninput={(e) => { const v = parseInt((e.target as HTMLInputElement).value); ref.gainedAt = Number.isNaN(v) ? undefined : v; }} />
                    </label>
                    <button class="remove-btn" title="Talent entfernen" onclick={() => removeRef(refFeats, i)}>✕</button>
                  </span>
                </div>
                {#if entry}
                  {@const prereq = featPrereq(entry)}
                  {@const desc = featDesc(entry)}
                  {#if prereq}<div class="fp-prereq">Voraussetzung: {prereq}</div>{/if}
                  {#if desc}<div class="fp-desc"><Markdown source={desc} /></div>{/if}
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="fp-empty">Noch keine Talente verlinkt.</p>
        {/if}
        <div class="feat-add-row">
          {@render featPicker('add', 'Talent hinzufügen — Bibliothek durchsuchen…')}
          <button type="button" class="btn-add" title="Talent-Karte in der Bibliothek anlegen (öffnet den Talent-Editor)" onclick={createFeatCard}>+ Neues Talent</button>
        </div>
      </div>
    </details>
  </section>

  <!-- ── Persönlichkeit ─── -->
  <section>
    <h3>Persönlichkeit</h3>
    <div class="grid-2">
      <label use:diffMark={dirOf(saved?.traits, traits)}>Persönlichkeitsmerkmale<textarea bind:value={traits}></textarea></label>
      <label use:diffMark={dirOf(saved?.ideals, ideals)}>Ideale<textarea bind:value={ideals}></textarea></label>
      <label use:diffMark={dirOf(saved?.bonds, bonds)}>Bindungen<textarea bind:value={bonds}></textarea></label>
      <label use:diffMark={dirOf(saved?.flaws, flaws)}>Makel<textarea bind:value={flaws}></textarea></label>
    </div>
  </section>

  <!-- ── Persönliches & Portrait ─── -->
  <section>
    <h3>Persönliches</h3>
    <div class="personal-grid">
      <div class="portrait-block" use:diffMark={dirOf(saved?.portraitFile, portraitFile)}>
        {#if portraitPreview}
          <img class="portrait-preview" src={portraitPreview} alt="Portrait" />
        {:else}
          <div class="portrait-placeholder">Kein Portrait</div>
        {/if}
        <div class="portrait-actions">
          <button class="btn-add" onclick={pickPortrait} disabled={portraitBusy}>
            {portraitBusy ? '…' : (portraitFile ? 'Ersetzen' : 'Bild wählen')}
          </button>
          {#if portraitFile}
            <button class="remove-btn" onclick={clearPortrait} title="Portrait-Verknüpfung entfernen">✕</button>
          {/if}
        </div>
        {#if portraitError}<div class="error-sm">{portraitError}</div>{/if}
      </div>
      <div class="personal-fields">
        <label use:diffMark={dirOf(saved?.personal?.alter, alter)}>Alter<input bind:value={alter} placeholder="32" /></label>
        <label use:diffMark={dirOf(saved?.personal?.geschlecht, geschlecht)}>Geschlecht<input bind:value={geschlecht} placeholder="männlich" /></label>
        <label use:diffMark={dirOf(saved?.personal?.gesinnung, gesinnung)}>Gesinnung
          <select bind:value={gesinnung}>
            <option value="">—</option>
            {#each gesinnungOptions as a}<option value={a}>{a}</option>{/each}
          </select>
        </label>
        <label use:diffMark={dirOf(saved?.personal?.glaube, glaube)}>Glaube<input bind:value={glaube} placeholder="Moradin" /></label>
        <label use:diffMark={dirOf(saved?.personal?.sizeCat, sizeCat)}>Größenkategorie
          <select bind:value={sizeCat}>
            <option value="">—</option>
            {#each sizeCatOptions as s}<option value={s}>{s}</option>{/each}
          </select>
        </label>
        <label use:diffMark={dirOf(saved?.personal?.koerpergroesse, koerpergroesse)}>Körpergröße<input bind:value={koerpergroesse} placeholder="1,30 m" /></label>
        <label use:diffMark={dirOf(saved?.personal?.gewicht, gewicht)}>Gewicht<input bind:value={gewicht} placeholder="65 kg" /></label>
        <label use:diffMark={dirOf(saved?.personal?.augenfarbe, augenfarbe)}>Augenfarbe<input bind:value={augenfarbe} placeholder="braun" /></label>
        <label use:diffMark={dirOf(saved?.personal?.haarfarbe, haarfarbe)}>Haarfarbe<input bind:value={haarfarbe} placeholder="schwarz" /></label>
        <label use:diffMark={dirOf(saved?.personal?.hautfarbe, hautfarbe)}>Hautfarbe<input bind:value={hautfarbe} placeholder="hell" /></label>
        <label use:diffMark={dirOf(saved?.personal?.lebensstil, lebensstil)}>Lebensstil<input bind:value={lebensstil} placeholder="bescheiden" /></label>
        <label use:diffMark={dirOf(saved?.personal?.taeglicheKosten, taeglicheKosten)}>Tägliche Kosten<input bind:value={taeglicheKosten} placeholder="1 GM" /></label>
      </div>
    </div>
    <label class="block-label" use:diffMark={dirOf(saved?.personal?.aussehen, aussehen)}>
      Aussehen
      <textarea class="ta-small" bind:value={aussehen} placeholder="Auffällige Merkmale, Kleidung, Statur…"></textarea>
    </label>
  </section>

  <!-- ── Sprachen & Werkzeuge ─── -->
  <section>
    <h3>Sprachen</h3>
    <div class="tag-editor">
      {#each languages as lang}
        <span class="tag" use:diffMark={!saved ? 'none' : saved.languages.includes(lang) ? 'none' : 'up'}>{lang}<button onclick={() => removeLang(lang)}>✕</button></span>
      {/each}
      <input
        class="tag-input"
        bind:value={langInput}
        placeholder="Sprache…"
        onkeydown={addLanguage}
      />
      <button class="btn-add-sm" onclick={addLanguage}>+</button>
    </div>

    <h3 style="margin-top:1rem">Werkzeuge & Fahrzeuge</h3>
    <div class="tag-editor">
      {#each tools as tool}
        <span class="tag" use:diffMark={!saved ? 'none' : saved.tools.includes(tool) ? 'none' : 'up'}>{tool}<button onclick={() => removeTool(tool)}>✕</button></span>
      {/each}
      <input
        class="tag-input"
        bind:value={toolInput}
        placeholder="Werkzeug…"
        onkeydown={addTool}
      />
      <button class="btn-add-sm" onclick={addTool}>+</button>
    </div>
  </section>

  <!-- ── Übungen & Rüstungsausbildung (Waffen / Rüstung / Schilde) ─── -->
  <section>
    <h3>Übungen &amp; Rüstungsausbildung</h3>
    <!-- ◆ = aus einem Bibliotheks-Link gewährt (Titel nennt die Quelle); übernommen wird
         im Grant-Panel im Abschnitt „Fertigkeiten". -->
    <div class="prof-grid">
      <label class="check-row" use:diffMark={dirOf(saved?.proficiencies?.simpleWeapons, profSimpleWeapons)}><input type="checkbox" bind:checked={profSimpleWeapons} /><span class="check-label">Einfache Waffen</span>{#if profGrantSources.simple}<span class="grant-mark" title={profGrantSources.simple}>◆</span>{/if}</label>
      <label class="check-row" use:diffMark={dirOf(saved?.proficiencies?.martialWeapons, profMartialWeapons)}><input type="checkbox" bind:checked={profMartialWeapons} /><span class="check-label">Kriegswaffen</span>{#if profGrantSources.martial}<span class="grant-mark" title={profGrantSources.martial}>◆</span>{/if}</label>
      <label class="check-row" use:diffMark={dirOf(saved?.proficiencies?.lightArmor, profLightArmor)}><input type="checkbox" bind:checked={profLightArmor} /><span class="check-label">Leichte Rüstung</span>{#if profGrantSources.light}<span class="grant-mark" title={profGrantSources.light}>◆</span>{/if}</label>
      <label class="check-row" use:diffMark={dirOf(saved?.proficiencies?.mediumArmor, profMediumArmor)}><input type="checkbox" bind:checked={profMediumArmor} /><span class="check-label">Mittlere Rüstung</span>{#if profGrantSources.medium}<span class="grant-mark" title={profGrantSources.medium}>◆</span>{/if}</label>
      <label class="check-row" use:diffMark={dirOf(saved?.proficiencies?.heavyArmor, profHeavyArmor)}><input type="checkbox" bind:checked={profHeavyArmor} /><span class="check-label">Schwere Rüstung</span>{#if profGrantSources.heavy}<span class="grant-mark" title={profGrantSources.heavy}>◆</span>{/if}</label>
      <label class="check-row" use:diffMark={dirOf(saved?.proficiencies?.shields, profShields)}><input type="checkbox" bind:checked={profShields} /><span class="check-label">Schilde</span>{#if profGrantSources.shields}<span class="grant-mark" title={profGrantSources.shields}>◆</span>{/if}</label>
    </div>
    <label class="block-label" use:diffMark={dirOf(saved?.proficiencies?.otherWeapons, profOtherWeapons)}>
      Weitere Waffen
      <input bind:value={profOtherWeapons} placeholder="z.B. Steinhammer, Wurfdolch" />
    </label>

  </section>

  <!-- ── Währung ─── -->
  <section>
    <h3>Währung</h3>
    <div class="currency-row">
      {#each [['km','Kupfer'],['sm','Silber'],['em','Elektrum'],['gm','Gold'],['pm','Platin']] as [key, label]}
        <label class="coin-label" use:diffMark={dirOf((saved?.currency as Record<string, unknown> | undefined)?.[key], (currency as any)[key])}>
          {label}
          <input
            class="coin-input"
            value={(currency as any)[key]}
            oninput={(e) => ((currency as any)[key] = (e.target as HTMLInputElement).value)}
          />
        </label>
      {/each}
    </div>
  </section>

  <!-- ── Inventar ─── -->
  <section>
    <h3>Inventar</h3>
    <table class="inv-table">
      <thead><tr><th>Gegenstand</th><th>Anz.</th><th>Gew./St. (kg)</th><th class="inv-line-col">Zeile</th><th></th></tr></thead>
      <tbody>
        {#each inventory as item, i}
          {@const invDir = !saved || !item.name.trim() ? 'none'
            : i >= (saved.inventory?.length ?? 0) ? 'up'
            : classifyChange($state.snapshot(saved.inventory[i]), $state.snapshot(item))}
          {@const lib = libItemOf(item)}
          <tr use:diffMark={invDir}>
            <td class="inv-name-cell">
              {#if lib && editingItemRow !== i}
                <!-- Kein Eingabefeld: freies Tippen läuft über ✎, sonst löst jeder
                     Tastendruck in einer verlinkten Zeile den Link. -->
                <span class="inv-linked-name">
                  <span class="inv-dot" style="background:{CATEGORY_COLORS[lib.category] ?? 'var(--border-strong)'}"></span>
                  <button
                    type="button"
                    class="inv-name-link"
                    title="Gegenstandskarte öffnen"
                    onclick={() => openItemPage(lib)}
                    onmouseenter={(e) => showItemTooltip(e, lib)}
                    onmousemove={moveItemTooltip}
                    onmouseleave={hideItemTooltip}
                  >{item.name}</button>
                  {#if divergedItemName(item)}
                    <span class="name-diverged" title="Bibliothek: {divergedItemName(item)}">≠</span>
                  {/if}
                  <button type="button" class="link-edit" title="Anderen Gegenstand wählen oder frei benennen"
                    onclick={() => { editingItemRow = i; hideItemTooltip(); }}>✎</button>
                  {#if !item.sourceKey?.trim() && itemIndex.ambiguous.has(item.name.trim().toLowerCase())}
                    <!-- Angezeigt wird der erste Treffer, der womöglich falsche — daher
                         der Hinweis statt eines automatischen Links. -->
                    <span class="inv-ambiguous" title="Mehrere Gegenstände dieses Namens — über ✎ den richtigen wählen">mehrdeutig</span>
                  {/if}
                </span>
              {:else}
                <div class="autocomplete-wrap">
                  <input
                    value={item.name}
                    placeholder="Seil (15m)"
                    oninput={(e) => { item.name = (e.currentTarget as HTMLInputElement).value; onInventoryNameInput(i, item.name); }}
                    onkeydown={(e) => onInventoryNameKey(e, i)}
                    onblur={() => setTimeout(() => {
                      if (activeItemRow === i) { itemSuggestions = []; activeItemRow = -1; }
                      if (editingItemRow === i) editingItemRow = -1;
                    }, 150)}
                  />
                  {#if activeItemRow === i && itemSuggestions.length > 0}
                    <ul class="suggestions">
                      {#each itemSuggestions as sug, si}
                        <li class:active={si === itemSugIndex}
                          onmousedown={() => selectInventoryItem(i, sug)}>
                          <span style="color:{CATEGORY_COLORS[sug.item.category] ?? 'inherit'}">{displayName(sug.item)}</span>
                          <span class="sug-cat">{sug.dir}</span>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </div>
              {/if}
            </td>
            <!-- Kein bind:value: `count` ist ein String (PDF-Feld, leer = unbestimmt),
                 bind würde bei type="number" eine Zahl zurückschreiben. -->
            <td><input class="num-input" type="number" min="1" step="1" inputmode="numeric" placeholder="1"
              value={item.count}
              oninput={(e) => { item.count = (e.currentTarget as HTMLInputElement).value; }} /></td>
            {#if item.sourceKey?.trim() && lib}
              <!-- Bedingung ist der ECHTE Link, nicht der Namenstreffer: sonst wären
                   getippte Gewichte im Altbestand gesperrt, ehe verlinkt wurde. -->
              <td class="inv-fixed-cell" title="Gewicht kommt aus der Bibliothek — über die Gegenstandskarte änderbar">{item.weight || '—'}</td>
            {:else}
              <td><input bind:value={item.weight} placeholder="2" /></td>
            {/if}
            <td class="inv-line-cell num">{lineWeightKg(item) > 0 ? formatKg(lineWeightKg(item)) : '—'}</td>
            <td><button class="remove-btn" onclick={() => removeInventoryItem(i)}>✕</button></td>
          </tr>
        {/each}
      </tbody>
      {#if inventory.length}
        <tfoot>
          <tr class="inv-total-row">
            <td colspan="3">Gesamtlast</td>
            <td class="num"><strong>{computedTotalWeight > 0 ? formatKg(computedTotalWeight) + ' kg' : '—'}</strong></td>
            <td></td>
          </tr>
        </tfoot>
      {/if}
    </table>
    <div class="inv-actions">
      <button class="btn-add" onclick={addInventoryItem}>+ Gegenstand</button>
      {#if fixOf('inventory')}
        {@const fix = fixOf('inventory')}
        <button class="btn-link-all" onclick={() => applyFix(fix)}
          title="Setzt bei diesen Zeilen den Bibliotheks-Link. Wird beim Speichern übernommen.">
          🔗 {fix?.label}
        </button>
      {/if}
      {#if divergedItemCount > 0}
        <button class="btn-link-all" onclick={syncInventoryNames}
          title="Diese Zeilen sind verlinkt, ihr Name weicht aber vom Bibliothekseintrag ab. Übernimmt den Bibliotheksnamen.">
          ✎ {divergedItemCount} Namen an die Bibliothek angleichen
        </button>
      {/if}
    </div>
    <label style="display:block; margin-top:0.5rem" use:diffMark={dirOf(saved?.inventoryNotes, inventoryNotes)}>
      Notizen
      <textarea class="ta-small" bind:value={inventoryNotes}></textarea>
    </label>
  </section>

  <!-- ── Zauber ─── -->
  <section>
    <h3>Zauberwirken</h3>
    <div class="grid-3">
      <label use:diffMark={dirOf(saved?.spells?.spellcastingClass, spellClass)}>Zauberklasse
        <select bind:value={spellClass}>
          <option value="">—</option>
          {#each spellClassOptions as c}<option value={c}>{c}</option>{/each}
        </select>
      </label>
      <label use:diffMark={dirOf(saved?.spells?.spellcastingAbility, spellAbility)}>Fähigkeit
        <select bind:value={spellAbility}>
          <option value="">—</option>
          {#each spellAbilityOptions as a}<option value={a}>{a}</option>{/each}
        </select>
      </label>
      {#if spellAutoActive}
        <label title="8 + Übungsbonus + Zauberattribut-Mod">Zauber-SG
          <span class="computed-cell computed-block">{computedSpellSaveDC}</span>
        </label>
        <label title="Übungsbonus + Zauberattribut-Mod">Angriffsbonus
          <span class="computed-cell computed-block">{sign(computedSpellAttack ?? 0)}</span>
        </label>
      {:else}
        <label use:diffMark={dirOf(saved?.spells?.saveDC, spellSaveDC)}>Zauber-SG<input type="number" min="0" bind:value={spellSaveDC} /></label>
        <label use:diffMark={dirOf(saved?.spells?.attackBonus, spellAttackBonus)}>Angriffsbonus<input type="number" bind:value={spellAttackBonus} /></label>
      {/if}
    </div>
    <label class="check-row spell-auto-toggle" use:diffMark={dirOf(saved?.spells?.autoCalc, spellAutoCalc)}>
      <input type="checkbox" bind:checked={spellAutoCalc} />
      <span>Zauber-SG &amp; Angriffsbonus automatisch berechnen</span>
    </label>
    {#if spellAutoCalc && spellAbilityMod === null}
      <p class="auto-hint">Zauberattribut nicht erkannt – wähle oben eines aus der Liste, damit die Berechnung greift.</p>
    {/if}

    {#if fixOf('spells')}
      {@const fix = fixOf('spells')}
      <button class="btn-link-all" onclick={() => applyFix(fix)}
        title="Setzt bei diesen Zaubern den Bibliotheks-Link (sourceKey). Wird beim Speichern übernommen.">
        🔗 {fix?.label}
      </button>
    {/if}
    {#if divergedSpellCount > 0}
      <button class="btn-link-all" onclick={syncSpellNames}
        title="Diese Zauber sind verlinkt, ihr Name weicht aber vom Bibliothekseintrag ab. Übernimmt den Bibliotheksnamen.">
        ✎ {divergedSpellCount} Namen an die Bibliothek angleichen
      </button>
    {/if}

    <h3 style="margin-top:0.75rem">Slots je Stufe</h3>
    <div class="slot-edit-row">
      {#each slotTotals as _, i}
        <label class="slot-label" use:diffMark={dirOf(saved?.spells?.slots?.[i]?.total, slotTotals[i])}>S{i + 1}<input type="number" min="0" max="9" bind:value={slotTotals[i]} /></label>
      {/each}
    </div>

    <h3 style="margin-top:0.75rem">Zaubertricks</h3>
    <div class="tag-editor">
      {#each cantrips as c}
        <span class="tag" style="color:{spellColor(c) || 'inherit'}" use:diffMark={!saved ? 'none' : (saved.spells?.cantrips ?? []).some((s) => s.name === c.name) ? 'none' : 'up'}><span
          class="spell-link" class:linked={!!resolveSpell(c)?.path}
          role="button" tabindex="0"
          onclick={() => openSpellPage(c)}
          onkeydown={(e) => e.key === 'Enter' && openSpellPage(c)}
          onmouseenter={(e) => showSpellTooltip(e, c.name)}
          onmousemove={moveSpellTooltip}
          onmouseleave={hideSpellTooltip}>{c.name}</span>{#if divergedSpellName(c)}<span class="name-diverged" title="Bibliothek: {divergedSpellName(c)}">≠</span>{/if}<button onclick={() => { cantrips = cantrips.filter(x => x !== c); }}>✕</button></span>
      {/each}
      <div class="autocomplete-wrap">
        <input class="tag-input" bind:value={cantripInput} placeholder="Zaubertrick…"
          onkeydown={onCantripKey}
          onblur={() => setTimeout(() => { cantripSuggestions = []; }, 150)} />
        {#if cantripSuggestions.length > 0}
          <ul class="suggestions">
            {#each cantripSuggestions as sug, i}
              <li class:active={i === cantripSugIndex} class:out-of-class={!sug.inClass}
                onmousedown={() => selectCantripSuggestion(sug)}>
                <span style={sug.inClass ? `color:${SCHOOL_COLORS[sug.spell.school] ?? 'inherit'}` : ''}>{sug.spell.name}</span>
                {#if !sug.inClass}<span class="sug-hint">nicht in Klasse</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <button class="btn-add-sm" onclick={() => addCantrip()}>+</button>
    </div>

    <h3 style="margin-top:0.75rem">Zauber hinzufügen</h3>
    <div class="spell-add-row">
      <select bind:value={spellInputLvl} class="spell-level-select">
        {#each ['1','2','3','4','5','6','7','8','9'] as lvl}
          <option value={lvl}>Stufe {lvl}</option>
        {/each}
      </select>
      <div class="autocomplete-wrap spell-autocomplete">
        <input class="spell-name-input" bind:value={spellInput} placeholder="Zauber-Name…"
          onkeydown={onSpellKey}
          onblur={() => setTimeout(() => { spellSuggestions = []; }, 150)} />
        {#if spellSuggestions.length > 0}
          <ul class="suggestions">
            {#each spellSuggestions as sug, i}
              <li class:active={i === spellSugIndex} class:out-of-class={!sug.inClass}
                onmousedown={() => selectSpellSuggestion(sug)}>
                <span style={sug.inClass ? `color:${SCHOOL_COLORS[sug.spell.school] ?? 'inherit'}` : ''}>{sug.spell.name}</span>
                {#if !sug.inClass}<span class="sug-hint">nicht in Klasse</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <label class="prep-check"><input type="checkbox" bind:checked={spellInputPrepared} /> Vorb.</label>
      <button class="btn-add-sm" onclick={addSpell}>+</button>
    </div>

    {#each ['1','2','3','4','5','6','7','8','9'] as lvl}
      {@const spells = spellsByLevel[lvl] ?? []}
      {#if spells.length || slotTotals[Number(lvl) - 1] > 0}
        <div class="spell-level-block">
          <span class="spell-level-label">Stufe {lvl} ({slotTotals[Number(lvl) - 1]} Slots)</span>
          {#each spells as spell, i}
            {@const savedSpell = saved?.spells?.byLevel?.[lvl]?.find(s => s.name === spell.name)}
            {@const spellDir = !saved ? 'none' : !savedSpell ? 'up' : savedSpell.prepared !== spell.prepared ? 'up' : 'none'}
            <div class="spell-edit-row" use:diffMark={spellDir}>
              <button class="prep-toggle" title={spell.prepared ? 'Vorbereitet' : 'Nicht vorbereitet'}
                onclick={() => { spells[i] = { ...spell, prepared: !spell.prepared }; spellsByLevel[lvl] = [...spells]; }}>
                {spell.prepared ? '●' : '○'}
              </button>
              <span class="spell-item-name" class:prepared={spell.prepared}
                class:linked={!!resolveSpell(spell)?.path}
                style="color:{spellColor(spell) || 'inherit'}"
                role="button" tabindex="0"
                onclick={() => openSpellPage(spell)}
                onkeydown={(e) => e.key === 'Enter' && openSpellPage(spell)}
                onmouseenter={(e) => showSpellTooltip(e, spell.name)}
                onmousemove={moveSpellTooltip}
                onmouseleave={hideSpellTooltip}>{spell.name}</span>
              {#if divergedSpellName(spell)}<span class="name-diverged" title="Bibliothek: {divergedSpellName(spell)}">≠</span>{/if}
              <button class="remove-btn" onclick={() => { spellsByLevel[lvl] = spells.filter((_, j) => j !== i); }}>✕</button>
            </div>
          {/each}
        </div>
      {/if}
    {/each}
  </section>
</div>

<SpellTooltip spell={spellTooltip} x={tooltipX} y={tooltipY} />
<FeatTooltip feat={featTooltip} x={tooltipX} y={tooltipY} />
<ItemTooltip item={itemTooltip} x={tooltipX} y={tooltipY} />

<!-- Derselbe „Neues Talent"-Dialog wie in der Sidebar; er öffnet den Entwurf im Editor. -->
{#if showFeatCreate}
  <CreateCardModal
    type="feat"
    title="Neues Talent"
    searchApi={searchOpen5eFeats}
    loadApi={loadOpen5eFeat}
    searchLibrary={searchFeatLibrary}
    blank={blankFeat}
    nameOf={featDraftName}
    onclose={() => (showFeatCreate = false)}
  />
{/if}

<style>
  .edit-form {
    padding: 1rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0;
    color: var(--ink);
    font-size: 0.85rem;
  }

  section {
    margin-bottom: 1.25rem;
  }

  h3 {
    margin: 0 0 0.5rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
    border-bottom: 1px solid var(--surface);
    padding-bottom: 0.2rem;
  }

  /* Feld-Kopfzeile: Titel links, KI-Knöpfe rechts — die Trennlinie wandert vom
     Titel auf die Zeile, sonst endet sie mitten im Kopf. */
  .field-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    border-bottom: 1px solid var(--surface);
    margin-bottom: 0.5rem;
    padding-bottom: 0.2rem;
  }
  .field-head.sub { margin-top: 0.9rem; }
  .field-head h3 { border-bottom: none; margin: 0; padding: 0; }
  .field-title {
    font-size: 0.75rem;
    color: var(--ink-soft);
  }
  .summary-actions { display: flex; gap: 0.35rem; flex-shrink: 0; }
  .ai-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--ink-muted);
    font-size: 0.7rem;
    padding: 0.15rem 0.4rem;
    cursor: pointer;
  }
  .ai-btn:hover:not(:disabled) { border-color: var(--arcane); color: var(--arcane); }
  .ai-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .summary-error {
    margin: 0.35rem 0 0;
    font-size: 0.72rem;
    color: var(--danger);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.75rem;
    color: var(--ink-soft);
  }

  input, textarea, select {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink);
    padding: 0.25rem 0.4rem;
    font-size: 0.82rem;
    outline: none;
    font-family: inherit;
  }
  input:focus, textarea:focus { border-color: var(--arcane); }
  input[type="number"] { width: 4rem; }
  input[type="checkbox"] { width: auto; }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .grid-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.5rem;
  }

  /* Attribute */
  .attr-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .attr-box {
    background: var(--surface);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    min-width: 58px;
  }
  .attr-mod-display {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--arcane);
  }
  .attr-label {
    font-size: 0.65rem;
    color: var(--ink-muted);
    text-transform: uppercase;
  }
  .attr-input {
    width: 3rem !important;
    text-align: center;
    padding: 0.15rem;
  }

  /* Rettungswürfe */
  .save-checks {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.25rem 0.5rem;
  }
  .check-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.82rem;
    color: var(--ink);
  }
  .check-label { flex: 1; }
  .check-val { font-weight: 600; min-width: 2rem; text-align: right; color: var(--ink-soft); }
  .alleskoenner { margin-bottom: 0.5rem; }

  /* Fertigkeiten */
  .skill-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.15rem 0.5rem;
  }
  .skill-edit-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.8rem;
  }
  .skill-name { color: var(--ink-soft); }
  .skill-name.proficient { color: var(--green); }
  .skill-name.expertise { color: var(--steel); }
  .skill-val { font-weight: 600; margin-left: auto; }

  /* Grant-Panel: Angebot aus den Bibliotheks-Links (Herkunft, Klasse, Volk, Talente) */
  /* ◆-Herkunftsmarker an Fertigkeiten/Übungen (das aktive Grant-Panel wurde entfernt —
     Übungen ableiten gehört in Erstellung/Level-Up, nicht in den Editor). */
  .grant-mark { color: var(--copper); font-size: 0.62rem; cursor: help; }

  /* Angriffe */
  .attack-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0.4rem;
    font-size: 0.8rem;
  }
  .attack-table th {
    text-align: left;
    color: var(--ink-muted);
    font-weight: 400;
    padding: 0.1rem 0.3rem;
    border-bottom: 1px solid var(--surface);
  }
  .attack-table td {
    padding: 0.15rem 0.2rem;
  }
  .attack-table input {
    width: 100%;
    min-width: 40px;
  }
  /* ── Referenzen (Berechnungsgrundlage) ── */
  .ref-section summary {
    cursor: pointer;
    user-select: none;
    list-style: none;
    font-weight: 600;
    color: var(--ink-muted);
  }
  .ref-section summary::-webkit-details-marker { display: none; }
  .ref-section summary::before { content: '› '; color: var(--border); }
  .ref-section[open] summary::before { content: '▾ '; }
  .ref-hint {
    font-size: 0.75rem;
    color: var(--ink-muted);
    margin: 0.3rem 0 0.6rem;
  }
  .ref-block { margin-bottom: 0.8rem; }
  .ref-block h4 {
    font-size: 0.8rem;
    font-weight: 600;
    margin: 0 0 0.2rem;
  }
  .ref-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0.3rem;
    font-size: 0.8rem;
  }
  .ref-table th {
    text-align: left;
    color: var(--ink-muted);
    font-weight: 400;
    padding: 0.1rem 0.3rem;
    border-bottom: 1px solid var(--surface);
  }
  .ref-table td { padding: 0.15rem 0.2rem; }
  .ref-table input { width: 100%; min-width: 40px; }
  .ref-table .ref-level { width: 3.5rem; min-width: 3rem; }
  .class-block { margin-top: 0.6rem; }
  .class-total { color: var(--ink-muted); font-weight: 400; font-size: 0.75rem; }
  /* .legacy-banner* liegt global in app.css — hier nur der mehrzeilige Sammel-Hinweis. */
  .upgrade-banner { align-items: flex-start; margin: 0 0 0.8rem; }
  .upgrade-steps { margin: 0.25rem 0 0; padding-left: 1.2rem; list-style: '· '; }
  .upgrade-done { flex-shrink: 0; font-size: 0.8rem; color: var(--green); }
  .class-preview { margin: 0.1rem 0 0; font-size: 0.75rem; color: var(--ink-muted); }
  .species-block { max-width: 24rem; }
  .species-picker { max-width: 18rem; }
  .species-hint { margin: 0.25rem 0 0; font-size: 0.75rem; color: var(--ink-muted); font-style: italic; }
  .fp-group { margin-top: 0.9rem; }
  .fp-group:first-child { margin-top: 0.3rem; }
  .fp-title {
    font-weight: 700; font-size: 0.95rem; color: var(--copper);
    padding-bottom: 0.2rem; border-bottom: 1px solid var(--surface);
    display: block;
  }
  .fp-unresolved { color: var(--ink-muted); font-style: italic; font-size: 0.8rem; margin-left: 0.3rem; }
  .fp-list { list-style: none; margin: 0.45rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .fp-list li {
    margin: 0; padding: 0.4rem 0.55rem;
    border: 1px solid var(--border); border-radius: 5px;
    background: color-mix(in srgb, var(--surface) 40%, transparent);
  }
  .fp-head { display: flex; align-items: baseline; gap: 0.5rem; }
  .fp-name { font-weight: 700; font-variant: small-caps; color: var(--ink); }
  .fp-lvl { color: var(--ink-muted); font-size: 0.72rem; font-style: italic; }
  .fp-choice {
    color: var(--gold); font-size: 0.72rem; font-weight: 600;
    border: 1px solid var(--border); border-radius: 999px; padding: 0.02rem 0.4rem;
    background: color-mix(in srgb, var(--surface) 60%, transparent);
  }
  .fp-desc { color: var(--ink-soft); font-size: 0.78rem; line-height: 1.5; margin-top: 0.15rem; }
  .fp-empty { color: var(--ink-muted); font-style: italic; font-size: 0.8rem; margin: 0.3rem 0 0; }
  .ref-unlinked { display: inline-block; margin-top: 0.15rem; font-size: 0.72rem; color: var(--ink-muted); font-style: italic; }
  .class-linked { display: flex; align-items: center; gap: 0.25rem; }
  .class-link {
    background: none; border: none; padding: 0.1rem 0; cursor: pointer;
    color: var(--accent, var(--ink)); text-decoration: underline; font: inherit; text-align: left;
    flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .class-link:hover { text-decoration: none; }
  .link-edit {
    background: none; border: none; cursor: pointer; padding: 0 0.2rem;
    color: var(--ink-muted); font-size: 0.8rem; flex-shrink: 0;
  }
  .link-edit:hover { color: var(--ink); }
  .ref-table select { width: 100%; min-width: 90px; font: inherit; }
  .subclass-na { color: var(--ink-muted); }
  .computed-cell {
    display: inline-block;
    font-weight: 600;
    color: var(--arcane);
    padding: 0.15rem 0.1rem;
  }
  .computed-block {
    background: var(--surface);
    border: 1px dashed var(--border);
    border-radius: 4px;
    padding: 0.25rem 0.4rem;
    width: 4rem;
    text-align: center;
  }
  .mode-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0.1rem 0.2rem;
    opacity: 0.55;
    line-height: 1;
  }
  .mode-btn:hover { opacity: 1; }
  .mode-btn.active { opacity: 1; }

  .attack-auto-row td {
    padding: 0 0.2rem 0.4rem;
  }
  .auto-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    background: var(--surface);
    /* Unten eckig: `.attack-mods` schließt direkt an und rundet dort ab. */
    border-radius: 4px 4px 0 0;
    padding: 0.35rem 0.5rem;
    margin-top: -0.1rem;
  }
  .ac-field {
    flex-direction: row;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.72rem;
    color: var(--ink-muted);
  }
  .ac-check {
    flex-direction: row;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.72rem;
    color: var(--ink);
  }
  .ac-check input, .ac-field input[type="checkbox"] { width: auto; }
  .ac-dice { width: 5rem !important; }
  .ac-magic { width: 3.5rem !important; }

  .attack-mods {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    background: var(--surface);
    border-radius: 0 0 4px 4px;
    border-top: 1px solid var(--border);
    padding: 0.35rem 0.5rem;
  }
  .am-row {
    display: flex;
    align-items: center;
    gap: 0.5rem 0.75rem;
  }
  .am-label { flex: 1; min-width: 8rem; }
  .am-num { width: 3.5rem !important; }
  .am-add {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 0;
    font-size: 0.72rem;
    color: var(--gold);
    cursor: pointer;
  }
  .am-add:hover { text-decoration: underline; }

  .spell-auto-toggle { margin-top: 0.5rem; }
  .auto-hint {
    font-size: 0.72rem;
    color: var(--gold);
    margin: 0.3rem 0 0;
  }

  /* Tags */
  .tag-editor {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    align-items: center;
  }
  .tag {
    background: var(--surface);
    border-radius: 4px;
    padding: 0.1rem 0.3rem 0.1rem 0.5rem;
    font-size: 0.78rem;
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }
  .tag button {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--border);
    font-size: 0.7rem;
    padding: 0;
    line-height: 1;
  }
  .tag button:hover { color: var(--danger); }
  .tag-input {
    flex: 1;
    min-width: 80px;
    max-width: 120px;
  }

  /* Währung */
  .currency-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .coin-label {
    flex-direction: column;
    font-size: 0.72rem;
    color: var(--ink-muted);
  }
  .coin-input {
    width: 4rem;
    text-align: center;
  }

  /* Inventar */
  .inv-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0.4rem;
    font-size: 0.8rem;
  }
  .inv-table th {
    text-align: left;
    color: var(--ink-muted);
    font-weight: 400;
    padding: 0.1rem 0.3rem;
    border-bottom: 1px solid var(--surface);
  }
  .inv-table td { padding: 0.15rem 0.2rem; }
  .inv-table input { width: 100%; min-width: 40px; }
  .inv-table .num { text-align: right; white-space: nowrap; }
  .num-input { text-align: right; }
  .inv-fixed-cell {
    color: var(--ink-muted);
    font-style: italic;
    white-space: nowrap;
    cursor: help;
  }

  .inv-line-col { text-align: right !important; }
  .inv-line-cell { color: var(--ink-muted); }
  .inv-total-row td {
    border-top: 1px solid var(--surface);
    padding-top: 0.3rem;
    color: var(--ink-soft);
  }
  .inv-total-row td:first-child {
    text-align: right;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.72rem;
    color: var(--ink-muted);
  }

  .inv-name-cell { position: relative; }

  .inv-linked-name { display: flex; align-items: center; gap: 0.3rem; min-width: 0; }
  .inv-dot {
    width: 6px; height: 6px; border-radius: 50%;
    flex-shrink: 0; display: inline-block;
  }
  .inv-name-link {
    background: none; border: none; padding: 0.1rem 0; cursor: pointer;
    color: var(--accent, var(--ink)); text-decoration: underline; font: inherit; text-align: left;
    flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .inv-name-link:hover { text-decoration: none; }
  .inv-ambiguous {
    flex-shrink: 0;
    font-size: 0.68rem;
    font-style: italic;
    color: var(--copper, var(--ink-muted));
  }

  /* Marker an einer gelinkten Zeile, deren Name von der Bibliothek abweicht. */
  .name-diverged {
    flex-shrink: 0;
    margin: 0 0.15rem;
    font-weight: 700;
    color: var(--copper, var(--ink-muted));
    cursor: help;
  }

  .inv-actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .btn-link-all {
    background: none;
    border: 1px dashed var(--border-strong);
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .btn-link-all:hover { color: var(--ink); border-color: var(--ink-muted); }

  .autocomplete-wrap {
    position: relative;
  }
  .autocomplete-wrap input { width: 100%; box-sizing: border-box; }

  .suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 100;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    list-style: none;
    margin: 0;
    padding: 0.2rem 0;
    max-height: 180px;
    overflow-y: auto;
    box-shadow: 0 6px 16px rgba(0,0,0,0.5);
  }
  .suggestions li {
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--ink);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
  }
  .suggestions li:hover, .suggestions li.active { background: var(--surface); }
  .sug-cat { color: var(--ink-muted); font-size: 0.75rem; flex-shrink: 0; }

  .ta-large {
    width: 100%;
    min-height: 240px;
    resize: vertical;
  }
  .ta-medium {
    width: 100%;
    min-height: 140px;
    resize: vertical;
  }
  .ta-small {
    width: 100%;
    min-height: 50px;
    resize: vertical;
  }
  section label textarea { resize: vertical; min-height: 50px; }

  .remove-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--border);
    font-size: 0.75rem;
    padding: 0.1rem 0.2rem;
  }
  .remove-btn:hover { color: var(--danger); }

  /* Talent-Karten: Optik der aufgelösten Merkmale (.fp-*), Name klickbar.
     Stufe/Entfernen sitzen in der Kopfzeile → mittig statt an der Grundlinie. */
  .feat-row .fp-head { align-items: center; }
  .fp-name-link {
    background: none; border: none; padding: 0; font: inherit; cursor: pointer;
    font-weight: 700; font-variant: small-caps; color: var(--ink);
    text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--gold) 55%, transparent);
    text-underline-offset: 0.15em;
  }
  .fp-name-link:hover { color: var(--gold); }
  .fp-prereq { margin-top: 0.15rem; font-size: 0.74rem; font-style: italic; color: color-mix(in srgb, var(--gold) 70%, var(--ink)); }
  .feat-row-actions { margin-left: auto; display: flex; align-items: center; gap: 0.3rem; flex-shrink: 0; }
  .feat-lvl { display: flex; align-items: center; gap: 0.25rem; font-size: 0.72rem; color: var(--ink-muted); }
  .feat-lvl .ref-level { width: 3.2rem; font: inherit; font-size: 0.78rem; }
  .feat-loading { color: var(--ink-muted); }

  /* Talent-Picker: Eingabe + „Neues Talent" in einer Zeile. */
  .feat-add-row { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.5rem; }
  .feat-picker { flex: 1; max-width: 22rem; }
  .feat-add-row .btn-add { flex-shrink: 0; white-space: nowrap; }
  .sug-empty { color: var(--ink-muted); font-style: italic; cursor: default; }

  .btn-add {
    background: var(--surface);
    color: var(--ink);
    border: none;
    border-radius: 4px;
    padding: 0.2rem 0.6rem;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .btn-add:hover { background: var(--border); }

  .btn-add-sm {
    background: var(--surface);
    color: var(--ink);
    border: none;
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.82rem;
    cursor: pointer;
    line-height: 1.4;
  }

  /* ── Zauber ── */
  .slot-edit-row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .slot-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 0.7rem;
    color: var(--ink-muted);
    gap: 0.1rem;
  }
  .slot-label input { width: 2.8rem; text-align: center; }

  .spell-add-row {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }
  .spell-level-select {
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.2rem 0.3rem;
    font-size: 0.8rem;
    font-family: inherit;
  }
  .spell-name-input {
    flex: 1;
    min-width: 100px;
    width: 100%;
  }
  .autocomplete-wrap {
    position: relative;
    flex: 1;
    min-width: 100px;
  }
  .spell-autocomplete {
    flex: 1;
  }
  .suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 100;
    background: var(--bg);
    border: 1px solid var(--border);
    border-top: none;
    border-radius: 0 0 6px 6px;
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 220px;
    overflow-y: auto;
    box-shadow: 0 6px 16px rgba(0,0,0,0.5);
  }
  .suggestions li {
    padding: 0.3rem 0.6rem;
    cursor: pointer;
    font-size: 0.82rem;
    color: var(--ink);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: space-between;
  }
  .suggestions li:hover,
  .suggestions li.active {
    background: var(--surface);
  }
  .suggestions li.out-of-class {
    color: var(--ink-muted);
  }
  .suggestions li.out-of-class:hover,
  .suggestions li.out-of-class.active {
    background: var(--bg-raised);
    color: var(--ink-faint);
  }
  .sug-hint {
    font-size: 0.7rem;
    color: var(--border);
    white-space: nowrap;
  }
  .prep-check {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.78rem;
    color: var(--ink-soft);
    cursor: pointer;
  }

  .spell-level-block {
    margin: 0.4rem 0 0.2rem;
  }
  .spell-level-label {
    display: block;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-muted);
    margin-bottom: 0.2rem;
  }
  .spell-edit-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.82rem;
    padding: 0.05rem 0;
  }
  .spell-item-name { flex: 1; color: var(--ink-soft); }
  .spell-item-name.prepared { font-weight: 600; }
  .spell-item-name.linked { cursor: pointer; }
  .spell-item-name.linked:hover { text-decoration: underline; }

  .spell-link { cursor: help; }
  .spell-link.linked { cursor: pointer; }
  .spell-link.linked:hover { text-decoration: underline; }

  .prep-toggle {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.62rem;
    color: var(--border);
    padding: 0;
    width: 0.9rem;
  }
  .spell-edit-row .prep-toggle:hover { color: var(--green); }

  /* Persönliches / Portrait */
  .personal-grid {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 1rem;
    align-items: start;
  }
  .portrait-block {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .portrait-preview {
    width: 160px;
    height: 200px;
    object-fit: cover;
    border-radius: 6px;
    background: var(--bg);
    border: 1px solid var(--border);
  }
  .portrait-placeholder {
    width: 160px;
    height: 200px;
    border: 1px dashed var(--border);
    border-radius: 6px;
    color: var(--ink-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.78rem;
  }
  .portrait-actions {
    display: flex;
    gap: 0.3rem;
    align-items: center;
  }
  .personal-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
  }
  .block-label {
    display: block;
    margin-top: 0.7rem;
  }
  .error-sm {
    color: var(--danger);
    font-size: 0.75rem;
  }

  .prof-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.2rem 0.5rem;
  }

  .weapon-picker { margin-bottom: 0.5rem; max-width: 320px; }
</style>
