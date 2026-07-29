/**
 * Setzt aus dem Wizard-Zustand einen vollständigen `Character` zusammen — die
 * deterministischen Schritte (Point-Buy, Hintergrund-ASI, Übungen, HP) UND die
 * fertigen KI-Ergebnisse (Merkmalswahlen/-zauber, Merkmals-Text, Ausrüstung).
 *
 * Bewusst OHNE Tauri/Dateizugriff: liefert nur das Objekt. Das Schreiben der
 * `character.json` + `gm-notes.md` bleibt am Aufrufer (Sidebar), der dafür schon
 * `write_file_content` nutzt — so bleibt diese Funktion rein und testbar.
 *
 * Reihenfolge der Attributsrechnung ist tragend: Point-Buy → Hintergrund-ASI →
 * Talent-/Merkmals-Erhöhungen → ERST DANN Modifikatoren und HP (Stufe 1 =
 * Trefferwürfel-Max + KON-Mod), sonst wäre der KON-Mod veraltet.
 */
import {
  CHARACTER_VERSION,
  formatClassLevel,
  formatSpecies,
  type Character,
} from '$lib/schemas/character';
import {
  SKILL_DEFS,
  skillSheetKey,
  mod,
  emptyProficiencies,
  emptyPersonal,
  emptySpells,
} from '$lib/pdf/characterFields';
import { ABILITY_TO_EN, type AbilityKey } from '$lib/schemas/classProgression';
import { readAbilityName, type AbilityName, type SkillName } from '$lib/schemas/shared';
import { collectGrants } from '../proficiencyGrants';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import { getProgressionByKey, spellSlotsAt } from '../classProgression';
import { getSpellLibrary } from '$lib/spellLibrary';
import { validateRiderSpells } from '../levelUpMachine';
import { getItemsByDir, displayName as itemDisplayName } from '$lib/itemLibrary';
import { applyAsi } from './backgroundAsi';
import { ABILITY_KEYS, type AbilityScores } from './pointBuy';
import type { CharacterWizard } from './characterWizard.svelte';

/** Englischer SRD-Attributsname → deutscher App-Schlüssel (Umkehrung von ABILITY_TO_EN). */
const KEY_BY_EN = new Map<AbilityName, AbilityKey>(
  (Object.entries(ABILITY_TO_EN) as [AbilityKey, AbilityName][]).map(([key, en]) => [en, key]),
);

/** Zauberattribut je Grundklasse (App-Schlüssel) — für den deterministischen Zauber-Block. */
const CASTER_ABILITY_KEY: Record<string, AbilityKey> = {
  bard: 'cha', cleric: 'wei', druid: 'wei', paladin: 'cha',
  ranger: 'wei', sorcerer: 'cha', warlock: 'cha', wizard: 'int',
};
const CASTER_ABILITY_DE: Record<AbilityKey, string> = {
  str: 'Stärke', ges: 'Geschicklichkeit', kon: 'Konstitution',
  int: 'Intelligenz', wei: 'Weisheit', cha: 'Charisma',
};

const EQUIPMENT_CANDIDATE_DIRS = ['weapon', 'armor', 'shield', 'ammunition', 'adventuring-gear', 'equipment-pack', 'tools'];

/** Leerer Charakter im aktuellen Schemaformat (wie `Sidebar.createCharacter`). */
function blankCharacter(name: string): Character {
  return {
    _version: CHARACTER_VERSION,
    name,
    classes: [], classLevel: '', playerName: '',
    backgroundRef: { sourceKey: '', name: '' }, background: '',
    species: { sourceKey: '', name: '' }, race: '', xp: '',
    str: 10, ges: 10, kon: 10, int: 10, wei: 10, cha: 10,
    strMod: 0, gesMod: 0, konMod: 0, intMod: 0, weiMod: 0, chaMod: 0,
    ac: '', initiative: '', speed: '', hpMax: '', hpCurrent: '', hpTemp: '',
    proficiencyBonus: 2, passivePerception: '', hitDice: '',
    strSaveProf: false, gesSaveProf: false, konSaveProf: false,
    intSaveProf: false, weiSaveProf: false, chaSaveProf: false,
    skills: {},
    attacks: [],
    classFeatures: '', traits: '', ideals: '', bonds: '', flaws: '',
    languages: [], tools: [], alleskoenner: false,
    currency: { km: '', sm: '', em: '', gm: '', pm: '' },
    inventory: [], inventoryNotes: '', totalWeight: '',
    spells: emptySpells(),
    personal: emptyPersonal(),
    proficiencies: emptyProficiencies(),
    masteries: [],
    features: [],
  };
}

/** Setzt das Übungs-Flag für einen englischen Rettungswurf-Namen (tolerant). */
function applySave(c: Character, en: string): void {
  const ability = readAbilityName(en);
  const key = ability ? KEY_BY_EN.get(ability) : undefined;
  if (key) c[`${key}SaveProf` as const] = true;
}

/** Setzt Waffen-/Rüstungs-Flags additiv. */
function applyWeapon(c: Character, cat: 'Simple' | 'Martial'): void {
  if (cat === 'Simple') c.proficiencies.simpleWeapons = true;
  else c.proficiencies.martialWeapons = true;
}
function applyArmor(c: Character, training: 'Light' | 'Medium' | 'Heavy' | 'Shields'): void {
  if (training === 'Light') c.proficiencies.lightArmor = true;
  else if (training === 'Medium') c.proficiencies.mediumArmor = true;
  else if (training === 'Heavy') c.proficiencies.heavyArmor = true;
  else c.proficiencies.shields = true;
}

/** Markiert eine Fertigkeit als geübt bzw. mit Expertise (englischer Name → Bogen-Schlüssel). */
function markSkill(profSkills: Set<string>, expSkills: Set<string>, en: string, exp = false): void {
  const key = skillSheetKey(en as SkillName);
  profSkills.add(key);
  if (exp) expSkills.add(key);
}

/** Baut aus einem Namen die Gewichts-Lookup-Map (deutscher Name → Gewicht in kg). */
async function loadWeightMap(): Promise<Map<string, number>> {
  const lists = await Promise.all(EQUIPMENT_CANDIDATE_DIRS.map((d) => getItemsByDir(d).catch(() => [])));
  const map = new Map<string, number>();
  for (const item of lists.flat()) if (typeof item.weight === 'number') map.set(itemDisplayName(item).toLowerCase(), item.weight);
  return map;
}

/** Baut den vollständigen Charakter aus dem Wizard-Zustand. */
export async function buildWizardCharacter(w: CharacterWizard): Promise<Character> {
  const c = blankCharacter(w.name.trim() || 'Neuer Charakter');
  const [prog, spec] = await Promise.all([
    getProgressionByKey(w.klass.sourceKey),
    w.species.sourceKey ? getSpeciesByKey(w.species.sourceKey) : Promise.resolve(null),
  ]);

  // ── Links + Anzeige-Strings ──
  c.classes = [{
    sourceKey: w.klass.sourceKey,
    name: w.klass.name,
    ...(w.klass.subclassKey ? { subclassKey: w.klass.subclassKey, subclassName: w.klass.subclassName } : {}),
    level: 1,
  }];
  c.species = {
    sourceKey: w.species.sourceKey,
    name: w.species.name,
    ...(w.species.subspeciesKey ? { subspeciesKey: w.species.subspeciesKey, subspeciesName: w.species.subspeciesName } : {}),
  };
  c.backgroundRef = { sourceKey: w.background.sourceKey, name: w.background.name };
  c.classLevel = formatClassLevel(c.classes);
  c.race = formatSpecies(c.species);
  c.background = w.background.name;

  // ── Bewegungsrate (deutsch aus dem „Speed"-Merkmal der Spezies; Feld selbst ist leer) ──
  const speedTrait = spec?.traits.find((t) => /(_speed$|^speed$)/i.test(t.key) || t.name.toLowerCase() === 'speed');
  c.speed = (speedTrait?.descDe || speedTrait?.desc || spec?.speed || '').trim();

  // ── Attribute: Point-Buy → Hintergrund-ASI → (Rider-Erhöhungen weiter unten) ──
  let scores: AbilityScores = applyAsi(w.scores, w.asi);
  const inc = w.effects.result?.riders?.reduce<Record<AbilityKey, number>>(
    (acc, r) => { for (const k of ABILITY_KEYS) acc[k] += r.abilityScoreIncrease[k] ?? 0; return acc; },
    { str: 0, ges: 0, kon: 0, int: 0, wei: 0, cha: 0 },
  );
  if (inc) scores = ABILITY_KEYS.reduce((s, k) => ({ ...s, [k]: s[k] + inc[k] }), scores);

  for (const k of ABILITY_KEYS) {
    c[k] = scores[k];
    c[`${k}Mod` as const] = mod(scores[k]);
  }

  // ── HP Stufe 1 + Trefferwürfel (deterministisch + fortlaufende Merkmals-Effekte) ──
  // Trefferwürfel-Max + KON-Mod + pro-Stufe-Boni (Zäh, Zwergische Zähigkeit) einmal für Stufe 1.
  const hitDie = prog?.hitDie ?? 0;
  if (hitDie > 0) {
    c.hitDice = `1W${hitDie}`;
    c.hpMax = String(Math.max(1, hitDie + mod(scores.kon) + w.hpPerLevelBonus()));
    c.hpCurrent = c.hpMax;
  }

  // ── Übungen: collectGrants (fest) + offene Fertigkeitswahlen + Rider ──
  const profSkills = new Set<string>();
  const expSkills = new Set<string>();

  const grants = await collectGrants({
    classes: c.classes,
    species: { sourceKey: w.species.sourceKey, subspeciesKey: w.species.subspeciesKey },
    backgroundRef: { sourceKey: w.background.sourceKey },
  });
  for (const g of grants.skills) markSkill(profSkills, expSkills, g.value);
  for (const en of w.chosenSkills) markSkill(profSkills, expSkills, en);
  for (const s of grants.savingThrows) applySave(c, s.value);
  for (const wp of grants.weapons) applyWeapon(c, wp.value);
  for (const a of grants.armor) applyArmor(c, a.value);
  if (grants.weaponsOther.length)
    c.proficiencies.otherWeapons = grants.weaponsOther.map((x) => x.value).join(', ');

  // ── Merkmals-Effekte (Rider) anwenden ──
  const riders = w.effects.result?.riders ?? [];
  for (const r of riders) {
    for (const s of r.proficiencies.skills) markSkill(profSkills, expSkills, s);
    for (const s of r.expertiseSkills) markSkill(profSkills, expSkills, s, true);
    for (const wp of r.proficiencies.weapons) applyWeapon(c, wp);
    for (const a of r.proficiencies.armor) applyArmor(c, a);
    for (const s of r.proficiencies.savingThrows) applySave(c, s);
    for (const t of r.proficiencies.tools) if (t.trim() && !c.tools.includes(t)) c.tools.push(t);
    for (const l of r.proficiencies.languages) if (l.trim() && !c.languages.includes(l)) c.languages.push(l);
  }

  // ── Fertigkeitszeilen berechnen (Wert = Attribut-Mod + Übungsbonus, Expertise verdoppelt) ──
  const profBonus = c.proficiencyBonus;
  for (const def of SKILL_DEFS) {
    const prof = profSkills.has(def.key);
    const exp = expSkills.has(def.key);
    const attrMod = mod(scores[def.attr]);
    const value = prof ? attrMod + profBonus * (exp ? 2 : 1) : attrMod;
    c.skills[def.key] = { value, prof, exp };
  }

  // ── Merkmals-Ledger: getroffene Aufbau-Entscheidungen (analysis + resolvedChoices) ──
  const keyById = new Map(w.analysis.result?.choices.map((ch) => [ch.id, ch]) ?? []);
  for (const rc of w.resolvedChoices) {
    const ch = keyById.get(rc.id);
    if (ch?.isBuildDecision && ch.featureKey)
      c.features.push({ sourceKey: ch.featureKey, name: '', choice: rc.choice, gainedAt: 1, desc: '' });
  }

  // ── Zauber-Block (deterministisch) + gewährte Zauber aus Merkmalen ──
  const slug = w.klass.sourceKey.split('_').pop() ?? '';
  const abilityKey = CASTER_ABILITY_KEY[slug];
  if (prog && prog.casterType !== 'NONE' && abilityKey) {
    const abilityMod = mod(scores[abilityKey]);
    c.spells.spellcastingClass = w.klass.name;
    c.spells.spellcastingAbility = CASTER_ABILITY_DE[abilityKey];
    c.spells.autoCalc = true;
    c.spells.saveDC = 8 + profBonus + abilityMod;
    c.spells.attackBonus = profBonus + abilityMod;
    c.spells.slots = spellSlotsAt(prog, 1).map((total) => ({ total, used: 0 }));
  }
  if (riders.length) {
    const library = await getSpellLibrary();
    const validated = validateRiderSpells(riders, library, w.klass.name);
    for (const name of validated.grantedCantrips) if (!c.spells.cantrips.includes(name)) c.spells.cantrips.push(name);
    for (const { level, name } of validated.grantedPrepared) {
      const lvl = String(level);
      const arr = c.spells.byLevel[lvl] ?? [];
      if (!arr.some((e) => e.name === name)) arr.push({ name, prepared: true });
      c.spells.byLevel[lvl] = arr;
    }
  }

  // ── Waffenmeisterschaft (deterministisch, im Wizard gewählt) ──
  c.masteries = [...w.masteries];

  // ── Merkmals-Text (KI) ──
  c.classFeatures = w.classText.result?.text?.trim() ?? '';
  c.personal.rassenmerkmale = w.speciesText.result?.text?.trim() ?? '';

  // ── Ausrüstung (gewählte Optionen der KI-Aufbereitung) ──
  const eq = w.selectedEquipment();
  if (eq.items.length || eq.goldPieces > 0) {
    const weights = await loadWeightMap();
    c.inventory = eq.items.map((i) => ({
      name: i.name,
      count: i.count > 1 ? String(i.count) : '',
      weight: weights.has(i.name.toLowerCase()) ? String(weights.get(i.name.toLowerCase())) : '',
    }));
    if (eq.goldPieces > 0) c.currency.gm = String(eq.goldPieces);
  }

  return c;
}
