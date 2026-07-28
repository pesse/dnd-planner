<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
  import { activeFile } from '../stores/campaign';
  import { confirmNavigation } from '../stores/navigationGuard';
  import { SKILL_DEFS, skillSheetKey, emptyPersonal, emptyProficiencies, formatClassLevel, totalLevel, parseClassLevelText, cleanClassName, type Character, type CharacterData, type CharacterClass, type CharacterSpecies, type CharacterBackground, type SpellEntry, type Attack } from '../pdf/characterFields';
  import type { SkillName } from '../schemas/shared';
  import { ABILITY_FROM_EN } from '../services/classProgression';
  import {
    collectGrants, abilityLabelDe, skillLabelDe, ARMOR_LABEL_DE, WEAPON_LABEL_DE,
    type CollectedGrants, type OpenChoice,
  } from '../services/proficiencyGrants';
  import { masteryOffer, masteryName, type MasteryOffer } from '../services/weaponMastery';
  import { getSpellLibrary, searchSpells, loadSpellByPath, SCHOOL_COLORS, type SpellInfo, type SpellSuggestion } from '../spellLibrary';
  import { getItemsByDir, searchItems, displayName, CATEGORY_COLORS, DIR_TO_CATEGORY, formatDamageDice, ftToMVal, DAMAGE_TYPE_LABELS, MASTERY_INFO, masteryLabel, type ItemInfo, type ItemSuggestion } from '../itemLibrary';
  import { getClasses, searchClasses, classDisplayName, type ClassInfo } from '../classLibrary';
  import { getSpeciesList, searchSpecies, speciesDisplayName, type SpeciesInfo } from '../speciesLibrary';
  import { getBackgroundsList, searchBackgrounds, backgroundDisplayName, type BackgroundInfo } from '../backgroundsLibrary';
  import { getFeats, searchFeats, saveFeat, type FeatEntry } from '../featsLibrary';
  import {
    resolveClassFeatures, resolveSpeciesTraits, resolveBackground,
    splitFeatureEntries, keysOf, withChoices, type ResolvedFeatureGroup,
  } from '../services/characterFeatures';
  import { slugify } from '../editor/saveAs';
  import type { Item, Spell } from '../types';
  import { OWN_SOURCE } from '../schemas/shared';
  import { lineWeightKg, totalWeightKg, formatKg } from '../utils/inventoryWeight';
  import SpellTooltip from './SpellTooltip.svelte';
  import Markdown from './Markdown.svelte';
  import { classifyChange, diffMark, type DiffDir } from '../utils/diffHighlight';

  // `character` ist der ed.draft-Proxy aus CharacterSheet. Das Formular pflegt seinen
  // eigenen lokalen Zustand und spiegelt ihn unten über einen $effect zurück in den
  // Draft (kein eigener Speichern-Button — das übernimmt die EditorPanel-Save-Bar).
  let { character = $bindable(), dirPath, saved }: {
    character: Character;
    dirPath: string;
    saved?: Character | null;
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
  // (siehe legacyConversion/convertLegacyClasses), falls die Auto-Migration den Freitext
  // nicht in `classes` überführen konnte.
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

  // ─── Profizienzen (Waffen/Rüstung/Schild) ────────────────
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

  let attacks = $state(character.attacks.map(a => ({ ...a })));
  let classFeatures = $state(character.classFeatures ?? '');
  // Das Merkmals-Ledger wird beim Bearbeiten AUFGETEILT: editierbar sind nur die
  // Talent-Links, die Entscheidungen laufen unangetastet durch. Ohne diese Trennung
  // würde `cleanRefs` sie beim Speichern verschlucken — sie tragen keinen `name`.
  let refFeats = $state((character.features ?? []).filter(r => !r.choice?.trim()).map(r => ({ ...r })));
  const choiceEntries = (character.features ?? []).filter(r => !!r.choice?.trim()).map(r => ({ ...r }));
  // Gegenstück für das Diff-Highlighting: dieselbe Teilmenge am gespeicherten Stand,
  // damit die Indizes zu `refFeats` passen.
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
  let cantrips = $state([...(character.spells?.cantrips ?? [])]);
  let cantripInput = $state('');
  let spellsByLevel = $state<Record<string, SpellEntry[]>>(
    Object.fromEntries(
      Object.entries(character.spells?.byLevel ?? {}).map(([k, v]) => [k, v.map(s => ({ ...s }))])
    )
  );
  let spellInput = $state('');
  let spellInputLvl = $state('1');
  let spellInputPrepared = $state(false);

  // ─── Inventar-Autocomplete ───────────────────────────────
  let itemLoadedByDir = $state<Record<string, ItemInfo[]>>({});
  let itemSuggestions = $state<ItemSuggestion[]>([]);
  let itemSugIndex = $state(-1);
  let activeItemRow = $state(-1);

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
   * Wählt das Attribut nach Reichweite/Finesse, übernimmt Waffenprofizienz,
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
      auto: true, ability, proficient, baseDamage, magicBonus,
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
  /** Angriffsbonus = Attributsmod + (geübt ? Übungsbonus) + magischer Bonus. */
  function computeAttackBonus(a: Attack): string {
    return sign(attackAbilityMod(a) + (a.proficient ? proficiencyBonus : 0) + (a.magicBonus ?? 0));
  }
  /** Schaden = Würfel + Attributsmod + magischer Bonus (Übungsbonus zählt NICHT). */
  function computeAttackDamage(a: Attack): string {
    const base = (a.baseDamage ?? '').trim();
    if (!base) return '';
    const m = attackAbilityMod(a) + (a.magicBonus ?? 0);
    return base + (m !== 0 ? sign(m) : '');
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
        auto: true, ability: 'str', proficient: false, baseDamage: '', magicBonus: 0,
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

  function onInventoryNameInput(i: number, value: string) {
    activeItemRow = i;
    itemSuggestions = searchItems(itemLoadedByDir, value, 8);
    itemSugIndex = -1;
  }

  function selectInventoryItem(i: number, sug: ItemSuggestion) {
    inventory[i].name = displayName(sug.item); // deutscher Name, fällt auf Original zurück
    if (sug.item.weight != null && !inventory[i].weight) {
      inventory[i].weight = String(sug.item.weight);
    }
    itemSuggestions = [];
    activeItemRow = -1;
    itemSugIndex = -1;
  }

  function onInventoryNameKey(e: KeyboardEvent, i: number) {
    if (e.key === 'ArrowDown') { e.preventDefault(); itemSugIndex = Math.min(itemSugIndex + 1, itemSuggestions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); itemSugIndex = Math.max(itemSugIndex - 1, -1); }
    else if (e.key === 'Escape') { itemSuggestions = []; activeItemRow = -1; }
    else if (e.key === 'Enter' && itemSugIndex >= 0 && itemSuggestions[itemSugIndex]) {
      e.preventDefault();
      selectInventoryItem(i, itemSuggestions[itemSugIndex]);
    }
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

  const spellSchoolMap = $derived(
    new Map(spellLibrary.map(s => [s.name, s.school]))
  );

  function spellColor(name: string): string {
    const school = spellSchoolMap.get(name);
    return school ? (SCHOOL_COLORS[school] ?? '') : '';
  }

  // ─── Zauber-Hover-Tooltip (analog Gegenstands-Tooltip) ───
  const spellInfoMap = $derived(new Map(spellLibrary.map(s => [s.name, s])));
  let spellDataCache = $state(new Map<string, Spell | null>());
  let spellTooltip = $state<Spell | null>(null);
  let tooltipX = $state(0);
  let tooltipY = $state(0);

  // Alle aktuell eingetragenen Zauber vorab laden → sofortiger Tooltip beim Hover.
  $effect(() => {
    const names = [
      ...cantrips,
      ...Object.values(spellsByLevel).flat().map(s => s.name),
    ];
    for (const name of names) {
      if (spellDataCache.has(name)) continue;
      const info = spellInfoMap.get(name);
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

  async function openSpellPage(spellName: string) {
    const info = spellInfoMap.get(spellName);
    if (!info?.path) return;
    if (!(await confirmNavigation())) return; // ungespeicherte Charakter-Änderungen
    const name = info.path.split('/').pop()?.replace('.json', '') ?? spellName;
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

  function selectCantripSuggestion(name: string) {
    if (!cantrips.includes(name)) cantrips.push(name);
    cantripInput = '';
    cantripSuggestions = [];
  }

  function selectSpellSuggestion(name: string) {
    const existing = spellsByLevel[spellInputLvl] ?? [];
    spellsByLevel[spellInputLvl] = [...existing, { name, prepared: spellInputPrepared }];
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
        selectCantripSuggestion(cantripSuggestions[cantripSugIndex].spell.name);
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
        selectSpellSuggestion(spellSuggestions[spellSugIndex].spell.name);
      } else {
        addSpell();
      }
    }
  }

  function addCantrip(e?: KeyboardEvent) {
    if (e && e.key !== 'Enter') return;
    const v = cantripInput.trim();
    if (v && !cantrips.includes(v)) cantrips.push(v);
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
  // Merkmale + Talente), ANGEBOTEN statt still angewandt: die Häkchen bleiben die
  // Wahrheit, das Panel vergleicht nur Ist gegen Soll. Siehe services/proficiencyGrants.ts.
  let grants = $state<CollectedGrants | null>(null);
  /** Getroffene Auswahl je offener Wahl (Index in `grants.choices`). */
  let choicePicks = $state<Record<number, SkillName[]>>({});

  // Nur die LINKS sind Abhängigkeit des Panels — nicht die Häkchen, sonst lüde es
  // bei jedem Klick neu. Das Derived liest sie synchron, der Effect hängt daran.
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
      .then((g) => { if (!cancelled) { grants = g; choicePicks = {}; } })
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

  /** Wie viele Fertigkeiten einer Wahl auf dem Bogen schon geübt sind. */
  function choiceTaken(choice: OpenChoice): number {
    const options = choice.from.length ? choice.from : SKILL_DEFS.map((d) => d.en);
    return options.filter((en) => skillFlags[skillSheetKey(en)]?.prof).length;
  }

  function choiceOptions(choice: OpenChoice): SkillName[] {
    return choice.from.length ? choice.from : SKILL_DEFS.map((d) => d.en);
  }

  function togglePick(index: number, skill: SkillName, choose: number) {
    const current = choicePicks[index] ?? [];
    choicePicks[index] = current.includes(skill)
      ? current.filter((s) => s !== skill)
      : [...current, skill].slice(-choose); // über das Limit hinaus rutscht die älteste raus
  }

  /** Setzt eine Rettungswurf-Übung über den englischen Attributsnamen. */
  function applySave(en: string) {
    switch (ABILITY_FROM_EN[en.toLowerCase()]) {
      case 'str': strSaveProf = true; break;
      case 'ges': gesSaveProf = true; break;
      case 'kon': konSaveProf = true; break;
      case 'int': intSaveProf = true; break;
      case 'wei': weiSaveProf = true; break;
      case 'cha': chaSaveProf = true; break;
    }
  }

  /**
   * Übernimmt die Grants in die Häkchen. Rein ADDITIV — nichts wird zurückgenommen,
   * weil der Bogen auch Übungen aus Merkmalen/Handwaage tragen kann, die hier keine
   * Quelle haben. Mehrfaches Klicken ist dadurch folgenlos (idempotent).
   */
  function applyGrants() {
    if (!grants) return;
    for (const g of grants.skills) {
      const key = skillSheetKey(g.value);
      if (skillFlags[key]) skillFlags[key].prof = true;
    }
    for (const picks of Object.values(choicePicks))
      for (const en of picks) {
        const key = skillSheetKey(en);
        if (skillFlags[key]) skillFlags[key].prof = true;
      }
    for (const s of grants.savingThrows) applySave(s.value);
    for (const w of grants.weapons) {
      if (w.value === 'Simple') profSimpleWeapons = true;
      if (w.value === 'Martial') profMartialWeapons = true;
    }
    const others = grants.weaponsOther.map((w) => w.value).filter((w) => !profOtherWeapons.includes(w));
    if (others.length) profOtherWeapons = [profOtherWeapons, ...others].filter(Boolean).join('; ');
    for (const a of grants.armor) {
      if (a.value === 'Light') profLightArmor = true;
      if (a.value === 'Medium') profMediumArmor = true;
      if (a.value === 'Heavy') profHeavyArmor = true;
      if (a.value === 'Shields') profShields = true;
    }
    choicePicks = {};
  }

  /** true, sobald es überhaupt etwas anzubieten gibt. */
  const hasGrants = $derived(
    Boolean(grants) &&
    (grants!.skills.length || grants!.choices.length || grants!.savingThrows.length ||
      grants!.weapons.length || grants!.weaponsOther.length || grants!.armor.length),
  );

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

  /**
   * Gewähltes, das nicht (mehr) wählbar ist: Übung abgewählt, Waffe aus dem Vault
   * verschwunden, Klasse getauscht. Wird ANGEZEIGT statt still gekappt — sonst
   * verschwände eine Wahl unbemerkt.
   */
  const masteryOverflow = $derived(
    mastery ? masteries.filter((n) => !mastery!.weapons.some((w) => masteryName(w) === n)) : [],
  );

  /**
   * Wahl umschalten. Am Maximum wird BLOCKIERT, nicht (wie `toggleIn` im
   * Aufstiegs-Assistenten) die älteste herausgeschoben — der Tausch soll bewusst sein.
   */
  function toggleMastery(name: string) {
    if (masteries.includes(name)) masteries = masteries.filter((n) => n !== name);
    else if (masteries.length < (mastery?.allowance ?? 0)) masteries = [...masteries, name];
  }

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
  const computedSpellSaveDC = $derived(spellAbilityMod === null ? null : 8 + proficiencyBonus + spellAbilityMod);
  const computedSpellAttack = $derived(spellAbilityMod === null ? null : proficiencyBonus + spellAbilityMod);

  // ─── Aktionen ────────────────────────────────────────────
  function addAttack() {
    attacks.push({
      name: '', bonus: '', damage: '', type: '', range: '',
      auto: true, ability: 'str', proficient: false, baseDamage: '', magicBonus: 0,
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
    inventory.push({ name: '', count: '', weight: '' });
  }
  function removeInventoryItem(i: number) { inventory.splice(i, 1); }

  // Ledger-Einträge, die der Editor anlegt, sind immer Talent-Links — Entscheidungen
  // entstehen ausschließlich im Stufenaufstieg.
  function addRef(list: typeof refFeats) {
    list.push({ sourceKey: '', name: '', choice: '', gainedAt: undefined, desc: '' });
  }
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

  // ─── Altformat-Umstellung (Freitext → strukturiert + Bibliotheks-Verknüpfung) ─────
  /**
   * Findet die passende GRUNDklasse zu einem Freitext-Namen — nur ein sicherer,
   * exakter Treffer (deutscher oder englischer Name, mit vorhandenem Key). Kein
   * Substring-Matching, damit die Umstellung nichts falsch verknüpft.
   */
  function matchBaseClass(rawName: string): ClassInfo | undefined {
    // Stufen-Schlüsselwörter entfernen ("Schurke Level" → "Schurke"), damit auch
    // bereits gespeicherte, verrauschte Namen sicher zugeordnet werden.
    const q = cleanClassName(rawName).toLowerCase();
    if (!q) return undefined;
    return baseClassIndex.find(
      (c) => !!c.key && ((c.nameDe ?? c.name).toLowerCase() === q || c.name.toLowerCase() === q),
    );
  }

  // Umstellungs-Angebot: sichtbar, wenn es noch unstrukturierten Freitext gibt ODER
  // strukturierte Klassen ohne Bibliotheks-Verknüpfung, die sich sicher zuordnen lassen.
  const legacyConversion = $derived.by(() => {
    const needsStructuring = classes.length === 0 && legacyClassLevelInit.trim().length > 0;
    const base = classes.length > 0 ? classes : parseClassLevelText(legacyClassLevelInit);
    if (base.length === 0) return null;
    const linkable = base.filter((c) => !c.sourceKey && c.name.trim() && matchBaseClass(c.name));
    if (!needsStructuring && linkable.length === 0) return null;
    return { needsStructuring, linkable: linkable.length };
  });

  /**
   * Stellt den Charakter aufs neue Format um: zerlegt Freitext bei Bedarf in `classes`
   * und verknüpft unverlinkte Grundklassen best-effort mit der Bibliothek (setzt
   * sourceKey + normalisierten Anzeigenamen). Nicht sicher zuordenbare Einträge bleiben
   * unverlinkt zur manuellen Auswahl. Mutiert den Formular-Zustand → Sync-Effekt greift.
   */
  function convertLegacyClasses() {
    if (classes.length === 0 && legacyClassLevelInit.trim()) {
      classes = parseClassLevelText(legacyClassLevelInit);
    }
    for (const cls of classes) {
      if (cls.sourceKey || !cls.name.trim()) continue;
      const match = matchBaseClass(cls.name);
      if (match?.key) {
        cls.sourceKey = match.key;
        cls.name = classDisplayName(match);
      } else {
        cls.name = cleanClassName(cls.name); // Homebrew: wenigstens „Level"-Rauschen entfernen
      }
    }
    editingClassRow = -1;
  }

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

  // ─── Altformat-Umstellung Volk (Auto-Guess wie bei der Klasse) ─────────────────
  /** Exakter, sicherer Bibliotheks-Treffer für einen Freitext-Volksnamen (kein Substring). */
  function matchSpecies(rawName: string): SpeciesInfo | undefined {
    const q = rawName.trim().toLowerCase();
    if (!q) return undefined;
    return speciesIndex.find(
      (s) => !!s.key && ((s.nameDe ?? s.name).toLowerCase() === q || s.name.toLowerCase() === q),
    );
  }
  // Angebot sichtbar, wenn ein unverlinkter Volksname sicher in der Bibliothek existiert.
  const speciesLegacyMatch = $derived(
    !species.sourceKey && species.name.trim() ? matchSpecies(species.name) : undefined,
  );
  /** Verknüpft den erkannten Freitext-Volksnamen mit der Bibliothek. */
  function linkLegacySpecies() {
    if (speciesLegacyMatch) selectSpecies(speciesLegacyMatch);
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

  /** Exakter, sicherer Bibliotheks-Treffer für einen Freitext-Hintergrund (kein Substring). */
  function matchBackground(rawName: string): BackgroundInfo | undefined {
    const q = rawName.trim().toLowerCase();
    if (!q) return undefined;
    return backgroundIndex.find(
      (b) => !!b.key && ((b.nameDe ?? b.name).toLowerCase() === q || b.name.toLowerCase() === q),
    );
  }
  // Angebot sichtbar, wenn ein unverlinkter Hintergrundname sicher in der Bibliothek existiert.
  const backgroundLegacyMatch = $derived(
    !backgroundRef.sourceKey && backgroundRef.name.trim() ? matchBackground(backgroundRef.name) : undefined,
  );
  function linkLegacyBackground() {
    if (backgroundLegacyMatch) selectBackground(backgroundLegacyMatch);
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

  // ─── Feats-Wörterbuch: Autocomplete + „ins Wörterbuch übernehmen" ────────────
  let featsLibrary = $state<FeatEntry[]>([]);
  let featSavedRow = $state(-1); // Kurzzeit-Bestätigung nach Speichern
  $effect(() => { getFeats().then((x) => { featsLibrary = x; }); });

  let activeFeatRow = $state(-1);
  let featSuggestions = $state<FeatEntry[]>([]);
  let featSugIndex = $state(-1);

  function onFeatNameInput(i: number, value: string) {
    activeFeatRow = i;
    featSugIndex = -1;
    featSuggestions = searchFeats(featsLibrary, value, 8);
  }

  function selectFeatSuggestion(i: number, f: FeatEntry) {
    // Nur den LINK speichern (Name + Key); die Beschreibung wird aus der Bibliothek aufgelöst.
    refFeats[i].name = f.nameDe || f.name;
    refFeats[i].sourceKey = f.sourceKey ?? '';
    featSuggestions = [];
    activeFeatRow = -1;
    featSugIndex = -1;
  }

  function onFeatNameKey(e: KeyboardEvent, i: number) {
    if (activeFeatRow !== i) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); featSugIndex = Math.min(featSugIndex + 1, featSuggestions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); featSugIndex = Math.max(featSugIndex - 1, -1); }
    else if (e.key === 'Escape') { featSuggestions = []; activeFeatRow = -1; }
    else if (e.key === 'Enter' && featSugIndex >= 0 && featSuggestions[featSugIndex]) {
      e.preventDefault();
      selectFeatSuggestion(i, featSuggestions[featSugIndex]);
    }
  }

  /** Legt das getippte Talent als (Homebrew-)Eintrag in der Bibliothek an, damit der
   *  Charakter darauf verlinken kann (statt Freitext). Setzt danach den sourceKey. */
  async function saveFeatToDict(i: number) {
    const ref = refFeats[i];
    if (!ref.name.trim()) return;
    const sourceKey = ref.sourceKey?.trim() || `${OWN_SOURCE}_${slugify(ref.name)}`;
    await saveFeat({ name: ref.name, sourceKey });
    ref.sourceKey = sourceKey;
    featsLibrary = await getFeats();
    featSavedRow = i;
    setTimeout(() => { if (featSavedRow === i) featSavedRow = -1; }, 1500);
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
      .map((a) => (a.auto ? { ...a, bonus: computeAttackBonus(a), damage: computeAttackDamage(a) } : { ...a }));
    character.classFeatures = classFeatures;
    character.traits = traits; character.ideals = ideals;
    character.bonds = bonds; character.flaws = flaws;
    character.languages = [...languages];
    character.tools = [...tools];
    character.alleskoenner = alleskoenner;
    character.currency = { ...currency };
    character.inventory = inventory.filter((i) => i.name.trim() !== '').map((i) => ({ ...i }));
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
      cantrips: [...cantrips],
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
      {#if backgroundLegacyMatch}
        <div class="legacy-banner">
          <span class="legacy-banner-text">
            Altes Freitext-Format erkannt: „{backgroundRef.name}" lässt sich mit der Bibliothek verknüpfen.
          </span>
          <button type="button" class="legacy-banner-btn" onclick={linkLegacyBackground}>Verknüpfen</button>
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
        {#if !backgroundRef.sourceKey && backgroundRef.name.trim() && !backgroundLegacyMatch}
          <p class="species-hint">Nicht in der Bibliothek verlinkt – aus der Liste wählen oder als Hintergrund anlegen.</p>
        {/if}
      {/if}
    </div>

    <!-- Volk als Bibliotheks-Link (Traits werden auf der Karte aufgelöst; `race` = Anzeige). -->
    <div class="ref-block species-block" use:diffMark={dirOf(saved?.race, race)}>
      <h4>Volk</h4>
      {#if speciesLegacyMatch}
        <div class="legacy-banner">
          <span class="legacy-banner-text">
            Altes Freitext-Format erkannt: „{species.name}" lässt sich mit der Bibliothek verknüpfen.
          </span>
          <button type="button" class="legacy-banner-btn" onclick={linkLegacySpecies}>Verknüpfen</button>
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
        {#if !species.sourceKey && species.name.trim() && !speciesLegacyMatch}
          <p class="species-hint">Nicht in der Bibliothek verlinkt – aus der Liste wählen oder als Volk anlegen.</p>
        {/if}
      {/if}
    </div>

    <!-- Klasse & Stufe strukturiert (multiclass-fähig); „Klasse & Stufe"-Anzeige wird abgeleitet. -->
    <div class="ref-block class-block" use:diffMark={dirOf(saved?.classLevel, classLevelPreview)}>
      <h4>Klassen & Stufen{#if charTotalLevel > 0} <span class="class-total">· Gesamtstufe {charTotalLevel}</span>{/if}</h4>
      {#if legacyConversion}
        <div class="legacy-banner">
          <span class="legacy-banner-text">
            Altes Freitext-Format erkannt.
            {#if legacyConversion.linkable > 0}
              {legacyConversion.linkable} {legacyConversion.linkable === 1 ? 'Klasse lässt' : 'Klassen lassen'} sich mit der Bibliothek verknüpfen.
            {:else}
              Freitext in strukturierte Klassen übernehmen.
            {/if}
          </span>
          <button type="button" class="legacy-banner-btn" onclick={convertLegacyClasses}>Aufs neue Format umstellen</button>
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
      <label use:diffMark={dirOf(saved?.speed, speed)}>Bewegung (m)<input bind:value={speed} placeholder="9" /></label>
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
    <h3>Rettungswürfe (Profizienzen)</h3>
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

    {#if hasGrants && grants}
      <!-- Grant-Panel: deterministisch aus den Bibliotheks-Links abgeleitet, per Klick
           übernommen — nie still überschrieben. -->
      <div class="grant-panel">
        <div class="grant-head">
          <span class="grant-title">Aus Hintergrund, Klasse, Volk &amp; Talenten</span>
          <button type="button" class="grant-apply" onclick={applyGrants}>Übernehmen</button>
        </div>

        {#if grants.skills.length}
          <div class="grant-line">
            <span class="grant-label">Fest</span>
            <span class="grant-value">
              {grants.skills.map((g) => `${skillLabelDe(g.value)} (${g.source.label})`).join(', ')}
            </span>
          </div>
        {/if}

        {#each grants.choices as choice, i}
          <div class="grant-choice">
            <div class="grant-line">
              <span class="grant-label">{choice.source.label}</span>
              <span class="grant-value">
                {choice.from.length ? `${choice.choose} aus ${choice.from.length}` : `${choice.choose} frei wählbar`}
                — {choiceTaken(choice)} von {choice.choose} belegt
              </span>
            </div>
            <div class="grant-options">
              {#each choiceOptions(choice) as en}
                {@const sheetKey = skillSheetKey(en)}
                {@const already = skillFlags[sheetKey]?.prof}
                <button
                  type="button"
                  class="grant-opt"
                  class:picked={(choicePicks[i] ?? []).includes(en)}
                  class:already
                  disabled={already}
                  title={already ? 'schon geübt' : 'zur Übernahme vormerken'}
                  onclick={() => togglePick(i, en, choice.choose)}
                >{skillLabelDe(en)}</button>
              {/each}
            </div>
          </div>
        {/each}

        {#if grants.savingThrows.length || grants.weapons.length || grants.weaponsOther.length || grants.armor.length}
          <div class="grant-line">
            <span class="grant-label">Außerdem</span>
            <span class="grant-value">
              {[
                ...grants.savingThrows.map((s) => `RW ${abilityLabelDe(s.value)}`),
                ...grants.weapons.map((w) => WEAPON_LABEL_DE[w.value]),
                ...grants.weaponsOther.map((w) => w.value),
                ...grants.armor.map((a) => ARMOR_LABEL_DE[a.value]),
              ].join(', ')}
            </span>
          </div>
        {/if}
      </div>
    {/if}

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
            title="Profizient"
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
            : classifyChange($state.snapshot(saved.attacks[i]), $state.snapshot(atk))}
          <tr use:diffMark={atkDir}>
            <td><input bind:value={atk.name} placeholder="Langschwert" /></td>
            {#if atk.auto}
              <td><span class="computed-cell" title="Reaktiv berechnet">{computeAttackBonus(atk)}</span></td>
              <td><span class="computed-cell" title="Reaktiv berechnet">{computeAttackDamage(atk) || '—'}</span></td>
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
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
    <button class="btn-add" onclick={addAttack}>+ Angriff</button>
  </section>

  <!-- ── Klassenmerkmale & Volksmerkmale ─── -->
  <section>
    <h3>Klassenmerkmale & Eigenschaften</h3>
    <textarea class="ta-large" use:diffMark={dirOf(saved?.classFeatures, classFeatures)} bind:value={classFeatures} placeholder="Klassenmerkmale, Rasseneigenschaften…"></textarea>
    <label class="block-label" use:diffMark={dirOf(saved?.personal?.rassenmerkmale, rassenmerkmale)}>
      Volksmerkmale
      <textarea class="ta-small" bind:value={rassenmerkmale} placeholder="Dunkelsicht, Zwergenresistenz, …"></textarea>
    </label>
  </section>

  <!-- ── Verknüpfte Merkmale & Talente ─── -->
  <!-- Klasse & Volk liefern ihre Merkmale read-only aus der Bibliothek (abgeleitet aus
       Link + Stufe, nicht hier editiert). Talente werden als Link gepflegt. -->
  <section>
    <details class="ref-section">
      <summary>Verknüpfte Merkmale & Talente</summary>
      <p class="ref-hint">Klassen-, Volks- & Hintergrundmerkmale werden aus der Bibliothek aufgelöst (read-only). Talente aus der Bibliothek wählen; fehlt eins, mit 📖 als (Homebrew-)Talent anlegen und verlinken. Beschreibungen kommen aus der Bibliothek, nicht ins PDF.</p>

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
        <table class="ref-table">
          <thead><tr><th>Talent</th><th>Stufe</th><th></th></tr></thead>
          <tbody>
            {#each refFeats as ref, i}
              {@const refDir = !saved || !ref.name.trim() ? 'none'
                : i >= savedFeatLinks.length ? 'up'
                : classifyChange($state.snapshot(savedFeatLinks[i]), $state.snapshot(ref))}
              <tr use:diffMark={refDir}>
                <td>
                  <div class="autocomplete-wrap">
                    <input
                      value={ref.name}
                      placeholder="Heiler"
                      oninput={(e) => { ref.name = (e.currentTarget as HTMLInputElement).value; ref.sourceKey = ''; onFeatNameInput(i, ref.name); }}
                      onkeydown={(e) => onFeatNameKey(e, i)}
                      onblur={() => setTimeout(() => { if (activeFeatRow === i) { featSuggestions = []; activeFeatRow = -1; } }, 150)}
                    />
                    {#if activeFeatRow === i && featSuggestions.length > 0}
                      <ul class="suggestions">
                        {#each featSuggestions as sug, si}
                          <li class:active={si === featSugIndex} onmousedown={() => selectFeatSuggestion(i, sug)}>
                            <span>{sug.nameDe ?? sug.name}</span>
                            {#if sug.sourceKey}<span class="sug-cat">{sug.sourceKey}</span>{/if}
                          </li>
                        {/each}
                      </ul>
                    {/if}
                    {#if ref.name.trim() && !ref.sourceKey}<span class="ref-unlinked" title="Nicht verlinkt">⚠ nicht verlinkt</span>{/if}
                  </div>
                </td>
                <td><input class="ref-level" type="number" min="1" max="20" value={ref.gainedAt ?? ''}
                  oninput={(e) => { const v = parseInt((e.target as HTMLInputElement).value); ref.gainedAt = Number.isNaN(v) ? undefined : v; }} /></td>
                <td class="feat-actions">
                  <button class="dict-btn" title="Als Talent in der Bibliothek anlegen & verlinken" onclick={() => saveFeatToDict(i)}>
                    {featSavedRow === i ? '✓' : '📖'}
                  </button>
                  <button class="remove-btn" onclick={() => removeRef(refFeats, i)}>✕</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        <button class="btn-add" onclick={() => addRef(refFeats)}>+ Talent</button>
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
        <label use:diffMark={dirOf(saved?.personal?.gesinnung, gesinnung)}>Gesinnung<input bind:value={gesinnung} placeholder="rechtschaffen neutral" /></label>
        <label use:diffMark={dirOf(saved?.personal?.glaube, glaube)}>Glaube<input bind:value={glaube} placeholder="Moradin" /></label>
        <label use:diffMark={dirOf(saved?.personal?.sizeCat, sizeCat)}>Größenkategorie<input bind:value={sizeCat} placeholder="Mittelgroß" /></label>
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

  <!-- ── Profizienzen (Waffen / Rüstung / Schilde) ─── -->
  <section>
    <h3>Profizienzen</h3>
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

    <!-- ── Waffenbeherrschung ─── -->
    <!-- Kein Vorschlag wie im Grant-Panel: das hier IST die Wahl. Sie wird direkt
         gespeichert und ist jederzeit änderbar (Regel: Tausch nach langer Rast). -->
    {#if mastery && mastery.allowance > 0}
      <div class="grant-panel mastery-panel" use:diffMark={dirOf(saved?.masteries, $state.snapshot(masteries))}>
        <div class="grant-head">
          <span class="grant-title">
            Waffenbeherrschung — {mastery.className}: {mastery.allowance}
            {mastery.allowance === 1 ? 'Waffe' : 'Waffen'}
          </span>
          <span class="mastery-count" class:full={masteries.length >= mastery.allowance}>
            {masteries.length} von {mastery.allowance} belegt
          </span>
        </div>
        <p class="mastery-hint">
          Nach jeder langen Rast änderbar.{#if mastery.meleeOnly} Nur Nahkampfwaffen.{/if}
        </p>

        {#if mastery.weapons.length}
          <div class="grant-options">
            {#each mastery.weapons as w (w.path)}
              {@const wName = masteryName(w)}
              {@const picked = masteries.includes(wName)}
              <button
                type="button"
                class="grant-opt mastery-opt"
                class:picked
                disabled={!picked && masteries.length >= mastery.allowance}
                title={MASTERY_INFO[w.mastery].descDe}
                onclick={() => toggleMastery(wName)}
              >{wName} <span class="mastery-prop">({masteryLabel(w.mastery)})</span></button>
            {/each}
          </div>
        {/if}

        {#if mastery.weapons.length < mastery.allowance}
          <p class="mastery-warn">
            Nur {mastery.weapons.length} wählbare {mastery.weapons.length === 1 ? 'Waffe' : 'Waffen'} in der Bibliothek —
            Waffen brauchen eine gepflegte Meisterschaftseigenschaft und eine passende Kategorie.
          </p>
        {/if}

        {#if masteryOverflow.length}
          <p class="mastery-warn">
            Nicht (mehr) wählbar — Übung abgewählt oder Waffe fehlt in der Bibliothek:
          </p>
          <div class="grant-options">
            {#each masteryOverflow as name}
              <button type="button" class="grant-opt mastery-opt overflow" title="Entfernen"
                onclick={() => toggleMastery(name)}>{name} ✕</button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
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
          <tr use:diffMark={invDir}>
            <td class="inv-name-cell">
              <div class="autocomplete-wrap">
                <input
                  value={item.name}
                  placeholder="Seil (15m)"
                  oninput={(e) => { item.name = (e.currentTarget as HTMLInputElement).value; onInventoryNameInput(i, item.name); }}
                  onkeydown={(e) => onInventoryNameKey(e, i)}
                  onblur={() => setTimeout(() => { if (activeItemRow === i) { itemSuggestions = []; activeItemRow = -1; } }, 150)}
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
            </td>
            <td><input bind:value={item.count} placeholder="1" /></td>
            <td><input bind:value={item.weight} placeholder="2" /></td>
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
    <button class="btn-add" onclick={addInventoryItem}>+ Gegenstand</button>
    <label style="display:block; margin-top:0.5rem" use:diffMark={dirOf(saved?.inventoryNotes, inventoryNotes)}>
      Notizen
      <textarea class="ta-small" bind:value={inventoryNotes}></textarea>
    </label>
  </section>

  <!-- ── Zauber ─── -->
  <section>
    <h3>Zauberwirken</h3>
    <div class="grid-3">
      <label use:diffMark={dirOf(saved?.spells?.spellcastingClass, spellClass)}>Zauberklasse<input bind:value={spellClass} placeholder="Zauberer" /></label>
      <label use:diffMark={dirOf(saved?.spells?.spellcastingAbility, spellAbility)}>Fähigkeit<input bind:value={spellAbility} placeholder="INT" /></label>
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
      <p class="auto-hint">Zauberattribut nicht erkannt – nutze ein Kürzel wie „INT“, „WEI“ oder „CHA“, damit die Berechnung greift.</p>
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
        <span class="tag" style="color:{spellColor(c) || 'inherit'}" use:diffMark={!saved ? 'none' : (saved.spells?.cantrips ?? []).includes(c) ? 'none' : 'up'}><span
          class="spell-link" class:linked={!!spellInfoMap.get(c)?.path}
          role="button" tabindex="0"
          onclick={() => openSpellPage(c)}
          onkeydown={(e) => e.key === 'Enter' && openSpellPage(c)}
          onmouseenter={(e) => showSpellTooltip(e, c)}
          onmousemove={moveSpellTooltip}
          onmouseleave={hideSpellTooltip}>{c}</span><button onclick={() => { cantrips = cantrips.filter(x => x !== c); }}>✕</button></span>
      {/each}
      <div class="autocomplete-wrap">
        <input class="tag-input" bind:value={cantripInput} placeholder="Zaubertrick…"
          onkeydown={onCantripKey}
          onblur={() => setTimeout(() => { cantripSuggestions = []; }, 150)} />
        {#if cantripSuggestions.length > 0}
          <ul class="suggestions">
            {#each cantripSuggestions as sug, i}
              <li class:active={i === cantripSugIndex} class:out-of-class={!sug.inClass}
                onmousedown={() => selectCantripSuggestion(sug.spell.name)}>
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
                onmousedown={() => selectSpellSuggestion(sug.spell.name)}>
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
                class:linked={!!spellInfoMap.get(spell.name)?.path}
                style="color:{spellColor(spell.name) || 'inherit'}"
                role="button" tabindex="0"
                onclick={() => openSpellPage(spell.name)}
                onkeydown={(e) => e.key === 'Enter' && openSpellPage(spell.name)}
                onmouseenter={(e) => showSpellTooltip(e, spell.name)}
                onmousemove={moveSpellTooltip}
                onmouseleave={hideSpellTooltip}>{spell.name}</span>
              <button class="remove-btn" onclick={() => { spellsByLevel[lvl] = spells.filter((_, j) => j !== i); }}>✕</button>
            </div>
          {/each}
        </div>
      {/if}
    {/each}
  </section>
</div>

<SpellTooltip spell={spellTooltip} x={tooltipX} y={tooltipY} />

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
  .grant-mark { color: var(--copper); font-size: 0.62rem; cursor: help; }
  .grant-panel {
    border: 1px solid color-mix(in srgb, var(--copper) 35%, var(--surface));
    border-radius: 5px; background: color-mix(in srgb, var(--copper) 6%, var(--bg-panel));
    padding: 0.45rem 0.6rem; margin-bottom: 0.5rem;
    display: flex; flex-direction: column; gap: 0.3rem;
  }
  .grant-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .grant-title {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--copper);
  }
  .grant-apply {
    background: var(--surface); border: 1px solid var(--copper); border-radius: 4px;
    color: var(--copper); cursor: pointer; font-family: inherit; font-size: 0.76rem;
    padding: 0.15rem 0.55rem;
  }
  .grant-apply:hover { background: color-mix(in srgb, var(--copper) 20%, var(--surface)); }
  .grant-line { display: grid; grid-template-columns: 9rem 1fr; gap: 0.4rem; font-size: 0.78rem; }
  .grant-label { color: var(--ink-muted); }
  .grant-value { color: var(--ink-soft); }
  .grant-choice { display: flex; flex-direction: column; gap: 0.2rem; }
  .grant-options { display: flex; flex-wrap: wrap; gap: 0.25rem; padding-left: 9.4rem; }
  .grant-opt {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 10px;
    color: var(--ink-soft); cursor: pointer; font-family: inherit; font-size: 0.74rem;
    padding: 0.05rem 0.45rem;
  }
  .grant-opt:hover:not(:disabled) { border-color: var(--copper); color: var(--copper); }
  .grant-opt.picked { background: color-mix(in srgb, var(--copper) 30%, var(--bg-panel)); color: var(--ink); border-color: var(--copper); }
  .grant-opt.already { color: var(--green); border-color: color-mix(in srgb, var(--green) 40%, var(--border)); cursor: default; }
  .grant-opt:disabled { opacity: 0.45; cursor: not-allowed; }

  /* Waffenbeherrschung: dasselbe Panel, aber ohne Label-Spalte (kein „Übernehmen" —
     die Chips SIND die Wahl), deshalb kein Einzug der Chip-Reihe. */
  .mastery-panel { margin-top: 0.6rem; }
  .mastery-panel .grant-options { padding-left: 0; }
  .mastery-count { font-size: 0.72rem; color: var(--ink-muted); }
  .mastery-count.full { color: var(--copper); }
  .mastery-hint { margin: 0; font-size: 0.72rem; color: var(--ink-muted); font-style: italic; }
  .mastery-opt { cursor: help; }
  .mastery-prop { color: var(--ink-muted); }
  .mastery-opt.picked .mastery-prop { color: var(--ink-soft); }
  .mastery-opt.overflow { border-color: var(--danger); color: var(--danger); }
  .mastery-warn { margin: 0.1rem 0 0; font-size: 0.72rem; color: var(--danger); }

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
  .legacy-banner {
    display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
    margin: 0.3rem 0 0.5rem;
    padding: 0.45rem 0.6rem;
    background: var(--surface);
    border: 1px dashed var(--border);
    border-radius: 6px;
    font-size: 0.8rem;
  }
  .legacy-banner-text { flex: 1; min-width: 12rem; color: var(--ink-muted); }
  .legacy-banner-btn {
    flex-shrink: 0; cursor: pointer; font: inherit; font-size: 0.8rem;
    padding: 0.25rem 0.7rem; border-radius: 5px;
    border: 1px solid var(--arcane);
    background: var(--arcane); color: var(--bg);
  }
  .legacy-banner-btn:hover { filter: brightness(1.08); }
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
    border-radius: 4px;
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
    min-height: 80px;
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

  .feat-actions { display: flex; align-items: center; gap: 0.1rem; white-space: nowrap; }
  .dict-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--border);
    font-size: 0.8rem;
    padding: 0.1rem 0.2rem;
  }
  .dict-btn:hover { color: var(--arcane); }

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
