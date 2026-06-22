<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
  import { activeFile } from '../stores/campaign';
  import { SKILL_DEFS, emptyPersonal, emptyProficiencies, type CharacterData, type SpellEntry, type Attack } from '../pdf/characterFields';
  import { getSpellLibrary, searchSpells, loadSpellByPath, SCHOOL_COLORS, type SpellInfo, type SpellSuggestion } from '../spellLibrary';
  import { getItemsByDir, searchItems, displayName, CATEGORY_COLORS, DIR_TO_CATEGORY, formatDamageDice, ftToMVal, DAMAGE_TYPE_LABELS, type ItemInfo, type ItemSuggestion } from '../itemLibrary';
  import type { Item, Spell } from '../types';
  import SpellTooltip from './SpellTooltip.svelte';

  let { character, dirPath, onSave, onCancel }: {
    character: CharacterData;
    dirPath: string;
    onSave: (data: CharacterData) => void;
    onCancel: () => void;
  } = $props();

  // ─── Felder ────────────────────────────────────────────
  let name = $state(character.name ?? '');
  let classLevel = $state(character.classLevel ?? '');
  let playerName = $state(character.playerName ?? '');
  let background = $state(character.background ?? '');
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

  // ─── Zauber ──────────────────────────────────────────────
  let spellClass = $state(character.spells?.spellcastingClass ?? '');
  let spellAbility = $state(character.spells?.spellcastingAbility ?? '');
  let spellSaveDC = $state(character.spells?.saveDC ?? 0);
  let spellAttackBonus = $state(character.spells?.attackBonus ?? 0);
  let spellAutoCalc = $state(character.spells?.autoCalc ?? false);
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
      // Item nicht ladbar → leeren Angriff mit dem Namen anlegen
      attacks.push({ name: displayName(sug.item), bonus: '', damage: '', type: '', range: 'Nah' });
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

  function openSpellPage(spellName: string) {
    const info = spellInfoMap.get(spellName);
    if (!info?.path) return;
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
    attacks.push({ name: '', bonus: '', damage: '', type: '', range: '' });
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

  function handleSave() {
    onSave({
      name, classLevel, playerName, background, race, xp,
      str, ges, kon, int, wei, cha,
      strMod, gesMod, konMod, intMod, weiMod, chaMod,
      ac, initiative, speed, hpMax, hpCurrent, hpTemp,
      proficiencyBonus, passivePerception: character.passivePerception, hitDice,
      strSaveProf, gesSaveProf, konSaveProf, intSaveProf, weiSaveProf, chaSaveProf,
      skills: computedSkills,
      attacks: attacks
        .filter(a => a.name.trim() !== '')
        .map(a => a.auto ? { ...a, bonus: computeAttackBonus(a), damage: computeAttackDamage(a) } : a),
      classFeatures, traits, ideals, bonds, flaws,
      languages, tools, alleskoenner,
      currency,
      inventory: inventory.filter(i => i.name.trim() !== ''),
      inventoryNotes,
      totalWeight: character.totalWeight,
      spells: {
        spellcastingClass: spellClass,
        spellcastingAbility: spellAbility,
        saveDC: spellAutoActive ? computedSpellSaveDC! : spellSaveDC,
        attackBonus: spellAutoActive ? computedSpellAttack! : spellAttackBonus,
        autoCalc: spellAutoCalc,
        slots: slotTotals.map((total, i) => ({ total, used: character.spells?.slots[i]?.used ?? 0 })),
        cantrips,
        byLevel: Object.fromEntries(Object.entries(spellsByLevel).filter(([, v]) => v.length > 0)),
      },
      personal: {
        rassenmerkmale, alter, geschlecht, sizeCat, gesinnung, glaube,
        lebensstil, taeglicheKosten, augenfarbe, haarfarbe, hautfarbe,
        gewicht, koerpergroesse, aussehen,
      },
      proficiencies: {
        simpleWeapons: profSimpleWeapons,
        martialWeapons: profMartialWeapons,
        otherWeapons: profOtherWeapons,
        lightArmor: profLightArmor,
        mediumArmor: profMediumArmor,
        heavyArmor: profHeavyArmor,
        shields: profShields,
      },
      portraitFile: portraitFile || undefined,
    });
  }

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
  <!-- ── Toolbar ─── -->
  <div class="toolbar">
    <button class="btn-save" onclick={handleSave}>Speichern</button>
    <button class="btn-cancel" onclick={onCancel}>Abbrechen</button>
  </div>

  <!-- ── Kopf ─── -->
  <section>
    <h3>Allgemein</h3>
    <div class="grid-2">
      <label>Name<input bind:value={name} placeholder="Charaktername" /></label>
      <label>Klasse & Stufe<input bind:value={classLevel} placeholder="z.B. Waldläufer 5" /></label>
      <label>Spieler<input bind:value={playerName} placeholder="Spielername" /></label>
      <label>Volk<input bind:value={race} placeholder="Volk/Rasse" /></label>
      <label>Hintergrund<input bind:value={background} placeholder="Hintergrund" /></label>
      <label>EP<input bind:value={xp} placeholder="0" /></label>
    </div>
  </section>

  <!-- ── Attribute ─── -->
  <section>
    <h3>Attribute</h3>
    <div class="attr-row">
      {#each ATTRS as attr}
        {@const score = attr.key === 'str' ? str : attr.key === 'ges' ? ges : attr.key === 'kon' ? kon : attr.key === 'int' ? int : attr.key === 'wei' ? wei : cha}
        {@const mod = modFor(score)}
        <div class="attr-box">
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
      <label>RK<input bind:value={ac} placeholder="15" /></label>
      <label>Initiative<input bind:value={initiative} placeholder="+2" /></label>
      <label>Bewegung (m)<input bind:value={speed} placeholder="9" /></label>
      <label>Trefferwürfel<input bind:value={hitDice} placeholder="5W10" /></label>
      <label>TP Maximum<input bind:value={hpMax} placeholder="45" /></label>
      <label>TP Aktuell<input bind:value={hpCurrent} placeholder="45" /></label>
      <label>Temp. TP<input bind:value={hpTemp} placeholder="0" /></label>
      <label>Übungsbonus
        <input type="number" bind:value={proficiencyBonus} min="2" max="6" />
      </label>
    </div>
  </section>

  <!-- ── Rettungswürfe ─── -->
  <section>
    <h3>Rettungswürfe (Profizienzen)</h3>
    <div class="save-checks">
      {#each [['STR', strSaveProf, (v: boolean) => (strSaveProf = v), strMod],
              ['GES', gesSaveProf, (v: boolean) => (gesSaveProf = v), gesMod],
              ['KON', konSaveProf, (v: boolean) => (konSaveProf = v), konMod],
              ['INT', intSaveProf, (v: boolean) => (intSaveProf = v), intMod],
              ['WEI', weiSaveProf, (v: boolean) => (weiSaveProf = v), weiMod],
              ['CHA', chaSaveProf, (v: boolean) => (chaSaveProf = v), chaMod]] as [label, checked, setter, mod]}
        <label class="check-row">
          <input type="checkbox" checked={checked as boolean} onchange={(e) => (setter as (v: boolean) => void)((e.target as HTMLInputElement).checked)} />
          <span class="check-label">{label}</span>
          <span class="check-val">{sign((mod as number) + ((checked as boolean) ? proficiencyBonus : 0))}</span>
        </label>
      {/each}
    </div>
  </section>

  <!-- ── Fertigkeiten ─── -->
  <section>
    <h3>Fertigkeiten</h3>
    <label class="check-row alleskoenner">
      <input type="checkbox" bind:checked={alleskoenner} />
      <span>Alleskönner</span>
    </label>
    <div class="skill-grid">
      {#each SKILL_DEFS as def}
        {@const flags = skillFlags[def.key]}
        {@const computed = computedSkills[def.key]}
        <div class="skill-edit-row">
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
          <tr>
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

  <!-- ── Klassenmerkmale ─── -->
  <section>
    <h3>Klassenmerkmale & Eigenschaften</h3>
    <textarea class="ta-large" bind:value={classFeatures} placeholder="Klassenmerkmale, Rasseneigenschaften…"></textarea>
  </section>

  <!-- ── Persönlichkeit ─── -->
  <section>
    <h3>Persönlichkeit</h3>
    <div class="grid-2">
      <label>Persönlichkeitsmerkmale<textarea bind:value={traits}></textarea></label>
      <label>Ideale<textarea bind:value={ideals}></textarea></label>
      <label>Bindungen<textarea bind:value={bonds}></textarea></label>
      <label>Makel<textarea bind:value={flaws}></textarea></label>
    </div>
  </section>

  <!-- ── Persönliches & Portrait ─── -->
  <section>
    <h3>Persönliches</h3>
    <div class="personal-grid">
      <div class="portrait-block">
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
        <label>Alter<input bind:value={alter} placeholder="32" /></label>
        <label>Geschlecht<input bind:value={geschlecht} placeholder="männlich" /></label>
        <label>Gesinnung<input bind:value={gesinnung} placeholder="rechtschaffen neutral" /></label>
        <label>Glaube<input bind:value={glaube} placeholder="Moradin" /></label>
        <label>Größenkategorie<input bind:value={sizeCat} placeholder="Mittelgroß" /></label>
        <label>Körpergröße<input bind:value={koerpergroesse} placeholder="1,30 m" /></label>
        <label>Gewicht<input bind:value={gewicht} placeholder="65 kg" /></label>
        <label>Augenfarbe<input bind:value={augenfarbe} placeholder="braun" /></label>
        <label>Haarfarbe<input bind:value={haarfarbe} placeholder="schwarz" /></label>
        <label>Hautfarbe<input bind:value={hautfarbe} placeholder="hell" /></label>
        <label>Lebensstil<input bind:value={lebensstil} placeholder="bescheiden" /></label>
        <label>Tägliche Kosten<input bind:value={taeglicheKosten} placeholder="1 GM" /></label>
      </div>
    </div>
    <label class="block-label">
      Volksmerkmale
      <textarea class="ta-small" bind:value={rassenmerkmale} placeholder="Dunkelsicht, Zwergenresistenz, …"></textarea>
    </label>
    <label class="block-label">
      Aussehen
      <textarea class="ta-small" bind:value={aussehen} placeholder="Auffällige Merkmale, Kleidung, Statur…"></textarea>
    </label>
  </section>

  <!-- ── Sprachen & Werkzeuge ─── -->
  <section>
    <h3>Sprachen</h3>
    <div class="tag-editor">
      {#each languages as lang}
        <span class="tag">{lang}<button onclick={() => removeLang(lang)}>✕</button></span>
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
        <span class="tag">{tool}<button onclick={() => removeTool(tool)}>✕</button></span>
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
    <div class="prof-grid">
      <label class="check-row"><input type="checkbox" bind:checked={profSimpleWeapons} /><span class="check-label">Einfache Waffen</span></label>
      <label class="check-row"><input type="checkbox" bind:checked={profMartialWeapons} /><span class="check-label">Kriegswaffen</span></label>
      <label class="check-row"><input type="checkbox" bind:checked={profLightArmor} /><span class="check-label">Leichte Rüstung</span></label>
      <label class="check-row"><input type="checkbox" bind:checked={profMediumArmor} /><span class="check-label">Mittlere Rüstung</span></label>
      <label class="check-row"><input type="checkbox" bind:checked={profHeavyArmor} /><span class="check-label">Schwere Rüstung</span></label>
      <label class="check-row"><input type="checkbox" bind:checked={profShields} /><span class="check-label">Schilde</span></label>
    </div>
    <label class="block-label">
      Weitere Waffen
      <input bind:value={profOtherWeapons} placeholder="z.B. Steinhammer, Wurfdolch" />
    </label>
  </section>

  <!-- ── Währung ─── -->
  <section>
    <h3>Währung</h3>
    <div class="currency-row">
      {#each [['km','Kupfer'],['sm','Silber'],['em','Elektrum'],['gm','Gold'],['pm','Platin']] as [key, label]}
        <label class="coin-label">
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
      <thead><tr><th>Gegenstand</th><th>Anz.</th><th>Gew. (kg)</th><th></th></tr></thead>
      <tbody>
        {#each inventory as item, i}
          <tr>
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
            <td><button class="remove-btn" onclick={() => removeInventoryItem(i)}>✕</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
    <button class="btn-add" onclick={addInventoryItem}>+ Gegenstand</button>
    <label style="display:block; margin-top:0.5rem">
      Notizen
      <textarea class="ta-small" bind:value={inventoryNotes}></textarea>
    </label>
  </section>

  <!-- ── Zauber ─── -->
  <section>
    <h3>Zauberwirken</h3>
    <div class="grid-3">
      <label>Zauberklasse<input bind:value={spellClass} placeholder="Zauberer" /></label>
      <label>Fähigkeit<input bind:value={spellAbility} placeholder="INT" /></label>
      {#if spellAutoActive}
        <label title="8 + Übungsbonus + Zauberattribut-Mod">Zauber-SG
          <span class="computed-cell computed-block">{computedSpellSaveDC}</span>
        </label>
        <label title="Übungsbonus + Zauberattribut-Mod">Angriffsbonus
          <span class="computed-cell computed-block">{sign(computedSpellAttack ?? 0)}</span>
        </label>
      {:else}
        <label>Zauber-SG<input type="number" min="0" bind:value={spellSaveDC} /></label>
        <label>Angriffsbonus<input type="number" bind:value={spellAttackBonus} /></label>
      {/if}
    </div>
    <label class="check-row spell-auto-toggle">
      <input type="checkbox" bind:checked={spellAutoCalc} />
      <span>Zauber-SG &amp; Angriffsbonus automatisch berechnen</span>
    </label>
    {#if spellAutoCalc && spellAbilityMod === null}
      <p class="auto-hint">Zauberattribut nicht erkannt – nutze ein Kürzel wie „INT“, „WEI“ oder „CHA“, damit die Berechnung greift.</p>
    {/if}

    <h3 style="margin-top:0.75rem">Slots je Stufe</h3>
    <div class="slot-edit-row">
      {#each slotTotals as _, i}
        <label class="slot-label">S{i + 1}<input type="number" min="0" max="9" bind:value={slotTotals[i]} /></label>
      {/each}
    </div>

    <h3 style="margin-top:0.75rem">Zaubertricks</h3>
    <div class="tag-editor">
      {#each cantrips as c}
        <span class="tag" style="color:{spellColor(c) || 'inherit'}"><span
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
            <div class="spell-edit-row">
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

  <!-- ── Toolbar (unten) ─── -->
  <div class="toolbar toolbar-bottom">
    <button class="btn-save" onclick={handleSave}>Speichern</button>
    <button class="btn-cancel" onclick={onCancel}>Abbrechen</button>
  </div>
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

  .toolbar {
    display: flex;
    gap: 0.5rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--surface);
    margin-bottom: 0.75rem;
    position: sticky;
    top: 0;
    background: var(--bg);
    z-index: 10;
    padding-top: 0.25rem;
  }
  .toolbar-bottom {
    position: static;
    border-top: 1px solid var(--surface);
    border-bottom: none;
    margin-top: 1rem;
    padding-top: 0.75rem;
    padding-bottom: 0;
    margin-bottom: 0;
  }

  .btn-save {
    background: var(--green);
    color: var(--bg);
    border: none;
    border-radius: 4px;
    padding: 0.3rem 0.9rem;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-cancel {
    background: none;
    border: none;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.82rem;
    padding: 0.3rem 0.5rem;
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
  .skill-val { font-weight: 600; }

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
