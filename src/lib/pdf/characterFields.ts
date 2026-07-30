// Mapping der PDF-Feldnamen (Taendler v2.8.x) auf unser Datenmodell
// Formeln aus dem extrahierten PDF-JavaScript
//
// Die Datentypen (Character/CharacterData, Attack, CharacterSpells, …) leben jetzt
// als Single Source of Truth im Zod-Schema (schemas/character.ts) und werden hier
// nur re-exportiert. Helper, Label-Maps und der PDF-Parser bleiben in dieser Datei.

import type {
  Character,
  CharacterSpells,
  Attack,
  SpellEntry,
  SpellRef,
  ProficiencyFlags,
  PersonalData,
  CharacterFeatureEntry,
  CharacterClass,
  CharacterSpecies,
  CharacterBackground,
} from '../schemas/character';
import type { SkillName } from '../schemas/shared';
import { MASTERY_BY_LABEL } from '../itemLibrary';

export { formatClassLevel, totalLevel, parseClassLevelText, cleanClassName, formatSpecies } from '../schemas/character';

export type {
  Character,
  CharacterSpells,
  Attack,
  SpellEntry,
  SpellRef,
  ProficiencyFlags,
  PersonalData,
  CharacterFeatureEntry,
  CharacterClass,
  CharacterSpecies,
  CharacterBackground,
};

/** Bisheriger Name des Charakter-Datentyps — Alias auf das Zod-Schema. */
export type CharacterData = Character;
/** JSON-Speicherformat (Metadaten sind Teil von Character). */
export type CharacterJSON = Character;

export function emptyProficiencies(): ProficiencyFlags {
  return {
    simpleWeapons: false, martialWeapons: false, otherWeapons: '',
    lightArmor: false, mediumArmor: false, heavyArmor: false, shields: false,
  };
}

export function emptyPersonal(): PersonalData {
  return {
    rassenmerkmale: '', alter: '', geschlecht: '', sizeCat: '',
    gesinnung: '', glaube: '', lebensstil: '', taeglicheKosten: '',
    augenfarbe: '', haarfarbe: '', hautfarbe: '', gewicht: '',
    koerpergroesse: '', aussehen: '',
  };
}

export function emptySpells(): CharacterSpells {
  return {
    spellcastingClass: '',
    spellcastingAbility: '',
    saveDC: 0,
    attackBonus: 0,
    autoCalc: false,
    slots: Array.from({ length: 9 }, () => ({ total: 0, used: 0 })),
    cantrips: [],
    byLevel: {},
  };
}

/**
 * Eine Fertigkeitszeile des Bogens. `key` ist der DEUTSCHE Bogen-Schlüssel
 * (`character.skills[key]`, vom PDF-Formular diktiert), `en` der englische
 * SRD-Name — die eine Übersetzungstabelle zwischen Bibliothek (englisch) und
 * Charakter (deutsch). Siehe „Geschlossene Regel-Vokabulare" in schemas/shared.ts.
 */
export interface SkillDef {
  key: string;
  en: SkillName;
  label: string;
  attr: 'str' | 'ges' | 'kon' | 'int' | 'wei' | 'cha';
  profField: string;
  expField: string;
  valField: string;
}

export const SKILL_DEFS = [
  { key: 'Akrobatik',         en: 'Acrobatics',      label: 'Akrobatik',          attr: 'ges', profField: 'AkrobatikProf',         expField: 'AkrobatikExp',         valField: 'AkrobatikGes' },
  { key: 'ArkaneKunde',       en: 'Arcana',          label: 'Arkane Kunde',       attr: 'int', profField: 'ArkaneKundeProf',        expField: 'ArkaneKundeExp',        valField: 'ArkaneKundeInt' },
  { key: 'Athletik',          en: 'Athletics',       label: 'Athletik',           attr: 'str', profField: 'AthletikProf',           expField: 'AthletikExp',           valField: 'AthletikStr' },
  { key: 'Auftreten',         en: 'Performance',     label: 'Auftreten',          attr: 'cha', profField: 'AuftretenProf',          expField: 'AuftretenExp',          valField: 'AuftretenCha' },
  { key: 'Einschüchtern',     en: 'Intimidation',    label: 'Einschüchtern',      attr: 'cha', profField: 'EinschüchternProf',      expField: 'EinschüchternExp',      valField: 'EinschüchternCha' },
  { key: 'Fingerfertigkeit',  en: 'Sleight of Hand', label: 'Fingerfertigkeit',   attr: 'ges', profField: 'FingerfertigkeitProf',   expField: 'FingerfertigkeitExp',   valField: 'FingerfertigkeitGes' },
  { key: 'Geschichte',        en: 'History',         label: 'Geschichte',         attr: 'int', profField: 'GeschichteProf',         expField: 'GeschichteExp',         valField: 'GeschichteInt' },
  { key: 'Heilkunde',         en: 'Medicine',        label: 'Heilkunde',          attr: 'wei', profField: 'HeilkundeProf',          expField: 'HeilkundeExp',          valField: 'HeilkundeWei' },
  { key: 'Heimlichkeit',      en: 'Stealth',         label: 'Heimlichkeit',       attr: 'ges', profField: 'HeimlichkeitProf',       expField: 'HeimlichkeitExp',       valField: 'HeimlichkeitGes' },
  { key: 'MitTierenUmgehen',  en: 'Animal Handling', label: 'Mit Tieren umgehen', attr: 'wei', profField: 'MitTierenUmgehenProf',   expField: 'MitTierenUmgehenExp',   valField: 'MitTierenUmgehenWei' },
  { key: 'MotivErkennen',     en: 'Insight',         label: 'Motiv erkennen',     attr: 'wei', profField: 'MotivErkennenProf',      expField: 'MotivErkennenExp',      valField: 'MotivErkennenWei' },
  { key: 'Nachforschungen',   en: 'Investigation',   label: 'Nachforschungen',    attr: 'int', profField: 'NachforschungenProf',    expField: 'NachforschungenExp',    valField: 'NachforschungenInt' },
  { key: 'Naturkunde',        en: 'Nature',          label: 'Naturkunde',         attr: 'int', profField: 'NaturkundeProf',         expField: 'NaturkundeExp',         valField: 'NaturkundeInt' },
  { key: 'Religion',          en: 'Religion',        label: 'Religion',           attr: 'int', profField: 'ReligionProf',           expField: 'ReligionExp',           valField: 'ReligionInt' },
  { key: 'Täuschen',          en: 'Deception',       label: 'Täuschen',           attr: 'cha', profField: 'TäuschenProf',           expField: 'TäuschenExp',           valField: 'TäuschenCha' },
  { key: 'Überlebenskunst',   en: 'Survival',        label: 'Überlebenskunst',    attr: 'wei', profField: 'ÜberlebenskunstProf',    expField: 'ÜberlebenskunstExp',    valField: 'ÜberlebenskunstWei' },
  { key: 'Überzeugen',        en: 'Persuasion',      label: 'Überzeugen',         attr: 'cha', profField: 'ÜberzeugenProf',         expField: 'ÜberzeugenExp',         valField: 'ÜberzeugenCha' },
  { key: 'Wahrnehmung',       en: 'Perception',      label: 'Wahrnehmung',        attr: 'wei', profField: 'WahrnehmungProf',        expField: 'WahrnehmungExp',        valField: 'WahrnehmungWei' },
] as const satisfies readonly SkillDef[];

// Vollständigkeit ist compilergeprüft: fehlt eine der 18 Fertigkeiten (oder ist eine
// falsch geschrieben), ist `MissingSkill` nicht `never` und die Zuweisung schlägt fehl.
type MissingSkill = Exclude<SkillName, (typeof SKILL_DEFS)[number]['en']>;
const _skillDefsComplete: MissingSkill extends never ? true : MissingSkill = true;
void _skillDefsComplete;

const SHEET_KEY_BY_EN = new Map<SkillName, string>(SKILL_DEFS.map((d) => [d.en, d.key]));
const EN_BY_SHEET_KEY = new Map<string, SkillName>(SKILL_DEFS.map((d) => [d.key, d.en]));

/**
 * Englischer SRD-Fertigkeitsname → deutscher Bogen-Schlüssel
 * (`character.skills[…]`, `Acrobatics` → `Akrobatik`). Die EINE Richtung, in der
 * Bibliotheks-Mechanik auf dem Bogen landet.
 */
export const skillSheetKey = (en: SkillName): string => SHEET_KEY_BY_EN.get(en) ?? en;

/** Umkehrung: deutscher Bogen-Schlüssel → englischer SRD-Name (undefined bei Fremdschlüssel). */
export const skillEnName = (sheetKey: string): SkillName | undefined => EN_BY_SHEET_KEY.get(sheetKey);

/**
 * Schneidet ein „ (Auslaugen)"-Suffix vom Waffennamen ab, das der PDF-Export an
 * beherrschte Waffen hängt (`withMasterySuffix`, characterExport.ts) — ohne das
 * wüchse der Name bei jedem Export/Import-Zyklus weiter an.
 *
 * Entfernt wird NUR eine bekannte Meisterschaftseigenschaft; „Langschwert (+1)" oder
 * „Dolch (geweiht)" bleiben unangetastet. `MASTERY_BY_LABEL` ist dabei dieselbe
 * Tabelle wie für die Anzeige, nur rückwärts gelesen — keine zweite Wahrheit.
 */
export function stripMasterySuffix(name: string): string {
  const m = name.match(/^(.*\S)\s*\(([^()]+)\)\s*$/);
  return m && MASTERY_BY_LABEL[m[2].trim().toLowerCase()] ? m[1] : name;
}

export function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function sign(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function parseCharacterData(fields: Record<string, string>): CharacterData {
  const f = (key: string) => fields[key] ?? '';
  const num = (key: string) => parseInt(f(key)) || 0;
  const prof = (key: string) => f(key) !== 'Off' && f(key) !== '';

  const str = num('Str'); const ges = num('Ges'); const kon = num('Kon');
  const int = num('Int'); const wei = num('Wei'); const cha = num('Cha');
  const profBonus = num('Übungsbonus');
  const alleskoenner = prof('Alleskoenner');

  // Fertigkeiten berechnen (aus FertigkeitBerechnung JS)
  const attrMods: Record<string, number> = {
    str: mod(str), ges: mod(ges), kon: mod(kon),
    int: mod(int), wei: mod(wei), cha: mod(cha),
  };

  const skills: CharacterData['skills'] = {};
  for (const skill of SKILL_DEFS) {
    const isProficient = prof(skill.profField);
    const isExpertise = prof(skill.expField);
    const attrMod = attrMods[skill.attr];
    let value: number;
    if (isProficient) {
      value = isExpertise ? attrMod + profBonus * 2 : attrMod + profBonus;
    } else {
      value = alleskoenner ? Math.floor(attrMod + profBonus / 2) : attrMod;
    }
    skills[skill.key] = { value, prof: isProficient, exp: isExpertise };
  }

  // Angriffe
  const attacks = [];
  for (let i = 1; i <= 5; i++) {
    const name = stripMasterySuffix(f(`Angriff${i}`));
    if (name) {
      attacks.push({
        name,
        bonus: f(`Bonus${i}`),
        damage: f(`Schaden${i}`),
        type: f(`Schadentyp${i}`),
        range: f(`Reichweite${i}`),
      });
    }
  }

  // Sprachen & Werkzeuge
  const languages = [1,2,3,4,5,6].map(i => f(`Sprache${i}`)).filter(Boolean);
  const tools = [1,2,3,4,5,6].map(i => f(`WerkzeugUndAndere${i}`)).filter(Boolean);

  // Inventar (55 Slots)
  const inventory = [];
  for (let i = 1; i <= 55; i++) {
    const name = f(`Inventar${i}`);
    if (name) {
      inventory.push({
        name,
        count: f(`InventarAnz${i}`),
        weight: f(`InventarGew${i}`),
      });
    }
  }

  // Zauber (Taendler v2.8.x — echte Feldnamen aus PDF-Dump)
  const spellClass = f('Zauberklasse');
  const spellAbility = f('AttributZauberwirken');
  const spellSaveDC = num('ZauberRettungswurfSG');
  const spellAttackBonus = num('ZauberAngriffsbonus');

  const spellSlots: CharacterSpells['slots'] = [];
  for (let lvl = 1; lvl <= 9; lvl++) {
    const total = num(`ZauberplätzeGesamt${lvl}`);
    const used = num(`ZauberplätzeVerbraucht${lvl}`);
    spellSlots.push({ total, used });
  }

  const cantrips: CharacterSpells['cantrips'] = [];
  for (let i = 1; i <= 8; i++) {
    const name = f(`Zaubertrick${i}`);
    if (name) cantrips.push({ name });
  }

  // Spell count per level in Taendler v2.8.x: 1-4 → 13, 5-7 → 9, 8-9 → 7
  const spellCountPerLevel: Record<number, number> = { 1:13, 2:13, 3:13, 4:13, 5:9, 6:9, 7:9, 8:7, 9:7 };
  const spellsByLevel: CharacterSpells['byLevel'] = {};
  for (let lvl = 1; lvl <= 9; lvl++) {
    const lvlSpells: SpellEntry[] = [];
    const count = spellCountPerLevel[lvl];
    for (let i = 1; i <= count; i++) {
      const name = f(`Zauber${lvl}_${i}`);
      if (name) {
        const prepared = prof(`ZauberActive${lvl}_${i}`);
        lvlSpells.push({ name, prepared });
      }
    }
    if (lvlSpells.length) spellsByLevel[String(lvl)] = lvlSpells;
  }

  return {
    name: f('Charaktername_page1'),
    classes: [], // strukturierte Klassen: aus classLevel beim Laden migriert (best-effort)
    classLevel: f('KlasseUndStufe'),
    playerName: f('Spielername'),
    // background-Link wie der species-Link: sourceKey leer (Bibliotheks-Verknüpfung
    // erfolgt im Editor), Name = Freitext aus dem Formularfeld.
    backgroundRef: { sourceKey: '', name: f('Hintergrund') },
    background: f('Hintergrund'),
    // species-Link: sourceKey leer (Bibliotheks-Verknüpfung erfolgt im Editor), Name = Freitext.
    species: { sourceKey: '', name: f('Volk') },
    race: f('Volk'),
    xp: f('Erfahrungspunkte'),
    str, ges, kon, int, wei, cha,
    strMod: mod(str), gesMod: mod(ges), konMod: mod(kon),
    intMod: mod(int), weiMod: mod(wei), chaMod: mod(cha),
    ac: f('Rüstungsklasse'),
    initiative: f('Initiative'),
    speed: f('Bewegungsrate'),
    hpMax: f('TrefferpunkteMaximum'),
    hpCurrent: f('AktTrefferpunkte'),
    hpTemp: f('TempTrefferpunkte'),
    proficiencyBonus: profBonus,
    passivePerception: f('PassiveWeisheit'),
    hitDice: f('Trefferwürfel'),
    strSaveProf: prof('StrProf'), gesSaveProf: prof('GesProf'), konSaveProf: prof('KonProf'),
    intSaveProf: prof('IntProf'), weiSaveProf: prof('WeiProf'), chaSaveProf: prof('ChaProf'),
    skills,
    attacks,
    classFeatures: [f('Klassenmerkmale1'), f('Klassenmerkmale2')].filter(Boolean).join('\n\n'),
    traits: f('Persönlichkeitsmerkmale'),
    ideals: f('Ideale'),
    bonds: f('Bindungen'),
    flaws: f('Makel'),
    languages,
    tools,
    alleskoenner,
    currency: { km: f('KM'), sm: f('SM'), em: f('EM'), gm: f('GM'), pm: f('PM') },
    inventory,
    inventoryNotes: '',
    totalWeight: f('Gesamtlast'),
    spells: {
      spellcastingClass: spellClass,
      spellcastingAbility: spellAbility,
      saveDC: spellSaveDC,
      attackBonus: spellAttackBonus,
      autoCalc: false,
      slots: spellSlots,
      cantrips,
      byLevel: spellsByLevel,
    },
    proficiencies: {
      simpleWeapons: prof('EinfachWaffenProf'),
      martialWeapons: prof('KriegswaffenProf'),
      otherWeapons: f('SonstigeWaffen'),
      lightArmor: prof('LeichteRüstungProf'),
      mediumArmor: prof('MittlereRüstungProf'),
      heavyArmor: prof('SchwereRüstungProf'),
      shields: prof('SchildeProf'),
    },
    personal: {
      rassenmerkmale: f('Rassenmerkmale'),
      alter: f('Alter'),
      geschlecht: f('Geschlecht'),
      sizeCat: f('SizeCat'),
      gesinnung: f('Gesinnung'),
      glaube: f('Glaube'),
      lebensstil: f('Lebensstil'),
      taeglicheKosten: f('TäglicheKosten'),
      augenfarbe: f('Augenfarbe'),
      haarfarbe: f('Haarfarbe'),
      hautfarbe: f('Hautfarbe'),
      gewicht: f('Gewicht'),
      koerpergroesse: f('Körpergrösse'),
      aussehen: f('Aussehen'),
    },
    // Das PDF führt die Waffenbeherrschung nur als Namenssuffix am Angriff (oben
    // abgeschnitten) — welche Waffen gewählt sind, entscheidet der Editor.
    masteries: [],
    // Talent-Links und Merkmals-Entscheidungen sind nicht Teil des PDFs → leer starten.
    features: [],
  };
}
