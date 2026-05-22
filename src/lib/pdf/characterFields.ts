// Mapping der PDF-Feldnamen (Taendler v2.8.x) auf unser Datenmodell
// Formeln aus dem extrahierten PDF-JavaScript

export interface SpellEntry {
  name: string;
  prepared: boolean;
}

export interface CharacterSpells {
  spellcastingClass: string;
  spellcastingAbility: string;
  saveDC: number;
  attackBonus: number;
  /** Index 0 = Stufe 1, Index 8 = Stufe 9 */
  slots: Array<{ total: number; used: number }>;
  cantrips: string[];
  byLevel: Record<string, SpellEntry[]>;
}

export interface ProficiencyFlags {
  simpleWeapons: boolean;
  martialWeapons: boolean;
  /** Freitext: weitere Waffen, in denen der Charakter geübt ist (z.B. „Steinhammer") */
  otherWeapons: string;
  lightArmor: boolean;
  mediumArmor: boolean;
  heavyArmor: boolean;
  shields: boolean;
}

export function emptyProficiencies(): ProficiencyFlags {
  return {
    simpleWeapons: false, martialWeapons: false, otherWeapons: '',
    lightArmor: false, mediumArmor: false, heavyArmor: false, shields: false,
  };
}

export interface PersonalData {
  rassenmerkmale: string;
  alter: string;
  geschlecht: string;
  sizeCat: string;
  gesinnung: string;
  glaube: string;
  lebensstil: string;
  taeglicheKosten: string;
  augenfarbe: string;
  haarfarbe: string;
  hautfarbe: string;
  gewicht: string;
  koerpergroesse: string;
  aussehen: string;
}

export function emptyPersonal(): PersonalData {
  return {
    rassenmerkmale: '', alter: '', geschlecht: '', sizeCat: '',
    gesinnung: '', glaube: '', lebensstil: '', taeglicheKosten: '',
    augenfarbe: '', haarfarbe: '', hautfarbe: '', gewicht: '',
    koerpergroesse: '', aussehen: '',
  };
}

export interface CharacterData {
  // Kopf
  name: string;
  classLevel: string;
  playerName: string;
  background: string;
  race: string;
  xp: string;
  // Attribute (Basiswerte)
  str: number; ges: number; kon: number;
  int: number; wei: number; cha: number;
  // Modifikatoren (berechnet)
  strMod: number; gesMod: number; konMod: number;
  intMod: number; weiMod: number; chaMod: number;
  // Kampf
  ac: string;
  initiative: string;
  speed: string;
  hpMax: string;
  hpCurrent: string;
  hpTemp: string;
  proficiencyBonus: number;
  passivePerception: string;
  hitDice: string;
  // Rettungswürfe (Profizienzen)
  strSaveProf: boolean; gesSaveProf: boolean; konSaveProf: boolean;
  intSaveProf: boolean; weiSaveProf: boolean; chaSaveProf: boolean;
  // Fertigkeiten (Profizienzen + Expertise)
  skills: Record<string, { value: number; prof: boolean; exp: boolean }>;
  // Angriffe
  attacks: { name: string; bonus: string; damage: string; type: string; range: string }[];
  // Klassenmerkmale
  classFeatures: string;
  // Persönlichkeit
  traits: string; ideals: string; bonds: string; flaws: string;
  // Sprachen & Werkzeuge
  languages: string[];
  tools: string[];
  alleskoenner: boolean;
  // Währung
  currency: { km: string; sm: string; em: string; gm: string; pm: string };
  // Inventar
  inventory: { name: string; count: string; weight: string }[];
  inventoryNotes: string;
  totalWeight: string;
  // Zauber
  spells: CharacterSpells;
  // Persönliches (optional — Migration-friendly)
  personal?: PersonalData;
  // Waffen- & Rüstungsprofizienzen (optional)
  proficiencies?: ProficiencyFlags;
  // Portrait (Datei im Charakter-Ordner)
  portraitFile?: string;
}

/** JSON-Speicherformat für Charaktere (primäres Format, ersetzt PDF als Datenquelle) */
export interface CharacterJSON extends CharacterData {
  _version: 1;
  _importedFrom?: string;
  _importedAt?: string;
}

export function emptySpells(): CharacterSpells {
  return {
    spellcastingClass: '',
    spellcastingAbility: '',
    saveDC: 0,
    attackBonus: 0,
    slots: Array.from({ length: 9 }, () => ({ total: 0, used: 0 })),
    cantrips: [],
    byLevel: {},
  };
}

export const SKILL_DEFS = [
  { key: 'Akrobatik',         attr: 'ges', profField: 'AkrobatikProf',         expField: 'AkrobatikExp',         valField: 'AkrobatikGes' },
  { key: 'ArkaneKunde',       attr: 'int', profField: 'ArkaneKundeProf',        expField: 'ArkaneKundeExp',        valField: 'ArkaneKundeInt' },
  { key: 'Athletik',          attr: 'str', profField: 'AthletikProf',           expField: 'AthletikExp',           valField: 'AthletikStr' },
  { key: 'Auftreten',         attr: 'cha', profField: 'AuftretenProf',          expField: 'AuftretenExp',          valField: 'AuftretenCha' },
  { key: 'Einschüchtern',     attr: 'cha', profField: 'EinschüchternProf',      expField: 'EinschüchternExp',      valField: 'EinschüchternCha' },
  { key: 'Fingerfertigkeit',  attr: 'ges', profField: 'FingerfertigkeitProf',   expField: 'FingerfertigkeitExp',   valField: 'FingerfertigkeitGes' },
  { key: 'Geschichte',        attr: 'int', profField: 'GeschichteProf',         expField: 'GeschichteExp',         valField: 'GeschichteInt' },
  { key: 'Heilkunde',         attr: 'wei', profField: 'HeilkundeProf',          expField: 'HeilkundeExp',          valField: 'HeilkundeWei' },
  { key: 'Heimlichkeit',      attr: 'ges', profField: 'HeimlichkeitProf',       expField: 'HeimlichkeitExp',       valField: 'HeimlichkeitGes' },
  { key: 'MitTierenUmgehen',  attr: 'wei', profField: 'MitTierenUmgehenProf',   expField: 'MitTierenUmgehenExp',   valField: 'MitTierenUmgehenWei' },
  { key: 'MotivErkennen',     attr: 'wei', profField: 'MotivErkennenProf',      expField: 'MotivErkennenExp',      valField: 'MotivErkennenWei' },
  { key: 'Nachforschungen',   attr: 'int', profField: 'NachforschungenProf',    expField: 'NachforschungenExp',    valField: 'NachforschungenInt' },
  { key: 'Naturkunde',        attr: 'int', profField: 'NaturkundeProf',         expField: 'NaturkundeExp',         valField: 'NaturkundeInt' },
  { key: 'Religion',          attr: 'int', profField: 'ReligionProf',           expField: 'ReligionExp',           valField: 'ReligionInt' },
  { key: 'Täuschen',          attr: 'cha', profField: 'TäuschenProf',           expField: 'TäuschenExp',           valField: 'TäuschenCha' },
  { key: 'Überlebenskunst',   attr: 'wei', profField: 'ÜberlebenskunstProf',    expField: 'ÜberlebenskunstExp',    valField: 'ÜberlebenskunstWei' },
  { key: 'Überzeugen',        attr: 'cha', profField: 'ÜberzeugenProf',         expField: 'ÜberzeugenExp',         valField: 'ÜberzeugenCha' },
  { key: 'Wahrnehmung',       attr: 'wei', profField: 'WahrnehmungProf',        expField: 'WahrnehmungExp',        valField: 'WahrnehmungWei' },
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
  };
}
