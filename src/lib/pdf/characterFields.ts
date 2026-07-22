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
  ProficiencyFlags,
  PersonalData,
  CharacterReferences,
  ReferenceEntry,
  CharacterClass,
} from '../schemas/character';

export { formatClassLevel, totalLevel, parseClassLevelText, cleanClassName } from '../schemas/character';

export type {
  Character,
  CharacterSpells,
  Attack,
  SpellEntry,
  ProficiencyFlags,
  PersonalData,
  CharacterReferences,
  ReferenceEntry,
  CharacterClass,
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

export const SKILL_DEFS = [
  { key: 'Akrobatik',         label: 'Akrobatik',          attr: 'ges', profField: 'AkrobatikProf',         expField: 'AkrobatikExp',         valField: 'AkrobatikGes' },
  { key: 'ArkaneKunde',       label: 'Arkane Kunde',       attr: 'int', profField: 'ArkaneKundeProf',        expField: 'ArkaneKundeExp',        valField: 'ArkaneKundeInt' },
  { key: 'Athletik',          label: 'Athletik',           attr: 'str', profField: 'AthletikProf',           expField: 'AthletikExp',           valField: 'AthletikStr' },
  { key: 'Auftreten',         label: 'Auftreten',          attr: 'cha', profField: 'AuftretenProf',          expField: 'AuftretenExp',          valField: 'AuftretenCha' },
  { key: 'Einschüchtern',     label: 'Einschüchtern',      attr: 'cha', profField: 'EinschüchternProf',      expField: 'EinschüchternExp',      valField: 'EinschüchternCha' },
  { key: 'Fingerfertigkeit',  label: 'Fingerfertigkeit',   attr: 'ges', profField: 'FingerfertigkeitProf',   expField: 'FingerfertigkeitExp',   valField: 'FingerfertigkeitGes' },
  { key: 'Geschichte',        label: 'Geschichte',         attr: 'int', profField: 'GeschichteProf',         expField: 'GeschichteExp',         valField: 'GeschichteInt' },
  { key: 'Heilkunde',         label: 'Heilkunde',          attr: 'wei', profField: 'HeilkundeProf',          expField: 'HeilkundeExp',          valField: 'HeilkundeWei' },
  { key: 'Heimlichkeit',      label: 'Heimlichkeit',       attr: 'ges', profField: 'HeimlichkeitProf',       expField: 'HeimlichkeitExp',       valField: 'HeimlichkeitGes' },
  { key: 'MitTierenUmgehen',  label: 'Mit Tieren umgehen', attr: 'wei', profField: 'MitTierenUmgehenProf',   expField: 'MitTierenUmgehenExp',   valField: 'MitTierenUmgehenWei' },
  { key: 'MotivErkennen',     label: 'Motiv erkennen',     attr: 'wei', profField: 'MotivErkennenProf',      expField: 'MotivErkennenExp',      valField: 'MotivErkennenWei' },
  { key: 'Nachforschungen',   label: 'Nachforschungen',    attr: 'int', profField: 'NachforschungenProf',    expField: 'NachforschungenExp',    valField: 'NachforschungenInt' },
  { key: 'Naturkunde',        label: 'Naturkunde',         attr: 'int', profField: 'NaturkundeProf',         expField: 'NaturkundeExp',         valField: 'NaturkundeInt' },
  { key: 'Religion',          label: 'Religion',           attr: 'int', profField: 'ReligionProf',           expField: 'ReligionExp',           valField: 'ReligionInt' },
  { key: 'Täuschen',          label: 'Täuschen',           attr: 'cha', profField: 'TäuschenProf',           expField: 'TäuschenExp',           valField: 'TäuschenCha' },
  { key: 'Überlebenskunst',   label: 'Überlebenskunst',    attr: 'wei', profField: 'ÜberlebenskunstProf',    expField: 'ÜberlebenskunstExp',    valField: 'ÜberlebenskunstWei' },
  { key: 'Überzeugen',        label: 'Überzeugen',         attr: 'cha', profField: 'ÜberzeugenProf',         expField: 'ÜberzeugenExp',         valField: 'ÜberzeugenCha' },
  { key: 'Wahrnehmung',       label: 'Wahrnehmung',        attr: 'wei', profField: 'WahrnehmungProf',        expField: 'WahrnehmungExp',        valField: 'WahrnehmungWei' },
];

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
    const name = f(`Angriff${i}`);
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

  const cantrips: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const name = f(`Zaubertrick${i}`);
    if (name) cantrips.push(name);
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
    background: f('Hintergrund'),
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
    // Strukturierte Referenzen sind nicht Teil des PDFs → leer starten.
    references: { class: [], race: [], feats: [] },
  };
}
