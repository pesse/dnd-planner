/**
 * Deterministischer Delta-Service für den Stufenaufstieg (kein LLM).
 *
 * Berechnet — rein aus der Open5e-v2-Progression (`classProgression.ts`) — was ein
 * Charakter beim Aufstieg einer Klasse um +1 Stufe DAZU bekommt. Alle numerischen
 * Ergebnisse sind DELTAS (Differenz alt→neu), nie Absolutwerte, damit sie später
 * additiv angewandt werden können (item-gewährte Slots etc. bleiben erhalten).
 *
 * Bei fehlender Progression (Homebrew / leerer sourceKey / Netzfehler) degradiert
 * der Service graceful: `isHomebrew=true`, Deltas leer → die LLM-Schicht fragt alles ab.
 */
import type { Character } from '../schemas/characterSchema';
import { totalLevel } from '../schemas/classLevelText';
import type { ClassFeature, ClassProgression } from '../schemas/classProgression';
import {
  getProgressionByKey,
  proficiencyBonus,
  spellSlotsAt,
} from './classProgression';
import { getClasses, classDisplayName } from '$lib/classLibrary';
import { isWeaponMasteryFeature, masteryAllowanceFor } from './weaponMastery';
import { cantripCount, isSpellcastingFeature, preparedOrKnownCount } from './spellcasting';
import { isFlowOwnedDeclaration } from './declaration/optionList';

export interface SubclassOption {
  key: string;
  name: string;
}

export interface LevelUpDelta {
  classIndex: number;
  klasseName: string;
  sourceKey: string;
  subclassKey: string;
  subclassName: string;
  fromLevel: number;
  toLevel: number;
  levelsGained: number; // toLevel - fromLevel (≥1)
  newTotalLevel: number;
  profBonusFrom: number;
  profBonusTo: number;
  hitDie: number; // 0 = unbekannt
  casterType: string; // FULL/HALF/NONE/…
  casterKind: 'prepared' | 'known' | 'none'; // aus casterType + Tabellenspalte abgeleitet
  spellSlotDelta: number[]; // Länge 9, idx0 = Grad 1, negativ→0
  castingIsNew: boolean; // Zauberwirken wird in dieser Spanne ERSTMALS erlangt (nicht: schon vorher Zauberwirker)
  cantripDelta: number;
  preparedFrom: number; // Anzahl vorbereitbarer Zauber auf fromLevel
  preparedTo: number; // … auf toLevel
  preparedDelta: number; // max(0, preparedTo - preparedFrom)
  masteryFrom: number; // Waffenbeherrschung: Kontingent auf fromLevel (0 = Klasse hat sie nicht)
  masteryTo: number; // … auf toLevel; ein Anstieg erzeugt nur einen Hinweis, keine Wahl
  featuresGained: ClassFeature[];
  subclassFeaturesGained: ClassFeature[];
  triggersSubclassChoice: boolean;
  triggersASI: boolean;
  asiCount: number; // Anzahl ASI-Stufen in der Spanne (Mehrfach-Aufstieg)
  subclassOptions: SubclassOption[];
  isNewClass: boolean; // true = neue Klasse (Multiclassing ab Stufe 1)
  isHomebrew: boolean;
  atLevelCap: boolean;
}

const SUBCLASS_HINTS = [
  'subclass', 'archetype', 'circle', 'oath', 'domain', 'patron', 'college',
  'origin', 'tradition', 'path', 'conclave', 'school', 'bloodline', 'mystery',
];
const ASI_HINTS = ['ability score', 'asi', 'attributswert'];

function matches(f: ClassFeature, hints: string[]): boolean {
  const s = `${f.name} ${f.featureType ?? ''}`.toLowerCase();
  return hints.some((h) => s.includes(h));
}

/**
 * Reine „Wahl-Zeiger" unter den Klassenmerkmalen: Merkmale, deren einziger Inhalt eine
 * Entscheidung ist, die der Aufstiegs-Flow selbst deterministisch trifft — die Subklassen-
 * Wahl („Rogue Subclass", „Cleric Subclasses") am eigenen Checkpoint, die Attributs-
 * verbesserung (Fragebogen `asi_or_feat_*` → ggf. Talent-Schritte) und jede über
 * `grantsChoice` DEKLARIERTE Wahl (Waffenbeherrschung, Kampfstil, Zauberwirken — Optionen
 * aus der Bibliothek). Eigene Mechanik tragen sie nicht; in der Merkmals-Analyse würden sie
 * die KI nur dazu verleiten, eine längst getroffene Entscheidung erneut zu erzwingen — bei
 * Waffenbeherrschung/Kampfstil/Zauberwirken käme sogar eine LLM-ERFUNDENE Options-Liste
 * heraus statt der aus dem Vault abgeleiteten.
 *
 * Zwei Hälften, und nur eine ist allgemein: `isFlowOwnedDeclaration` gilt für jede Herkunft,
 * die Namensheuristiken darunter sind KLASSEN-Vokabular („subclass", „ability score",
 * „Spellcasting", „Weapon Mastery"). Auf Traits oder Talente angewandt würden sie fehlzünden —
 * und sie werden dort nicht gebraucht, weil ein nicht-redigiertes Merkmal von ihnen ohnehin nie
 * gefiltert wurde. Bewusst ENG gebunden: „subclass" statt `SUBCLASS_HINTS` (dessen weiche
 * Begriffe patron, circle, path … treffen sonst echte Merkmale wie „Contact Patron").
 */
export function isFlowOwnedChoiceFeature(f: ClassFeature): boolean {
  return (
    isFlowOwnedDeclaration(f) ||
    /\bsubclass(es)?\b/i.test(f.name) ||
    matches(f, ASI_HINTS) ||
    isWeaponMasteryFeature(f) ||
    isSpellcastingFeature(f)
  );
}

/** Merkmale, die eine Klasse in der Spanne (fromLevel, toLevel] erlangt (Mehrfach-Aufstieg). */
function featuresBetween(prog: ClassProgression, fromLevel: number, toLevel: number): ClassFeature[] {
  return prog.features
    .filter((f) => f.gainedAt.some((l) => l > fromLevel && l <= toLevel))
    .sort((a, b) => Math.min(...a.gainedAt) - Math.min(...b.gainedAt));
}

/** Die Spanne, über die gerechnet wird — aus Charakter + Ziel abgeleitet, ohne Progression. */
interface LevelSpan {
  classIndex: number;
  isNewClass: boolean;
  sourceKey: string;
  klasseName: string;
  subclassKey: string;
  subclassName: string;
  fromLevel: number;
  toLevel: number;
  /** Gesamtstufe vor bzw. nach dem Aufstieg — der Übungsbonus hängt an ihr, nicht an der Klasse. */
  oldTotal: number;
  newTotalLevel: number;
  atLevelCap: boolean;
}

function levelSpan(
  character: Character,
  classIndex: number,
  targetLevel?: number,
  newClass?: { sourceKey: string; name: string },
): LevelSpan {
  const classes = character.classes ?? [];
  const existing = classes[classIndex];
  const isNewClass = !!newClass;
  const fromLevel = isNewClass ? 0 : (existing?.level ?? 1);
  const toLevel = Math.min(20, Math.max(fromLevel + 1, targetLevel ?? fromLevel + 1));
  const oldTotal = totalLevel(classes);
  return {
    classIndex,
    isNewClass,
    sourceKey: isNewClass ? newClass!.sourceKey : (existing?.sourceKey ?? ''),
    klasseName: isNewClass ? newClass!.name : (existing?.name ?? ''),
    subclassKey: isNewClass ? '' : (existing?.subclassKey ?? ''),
    subclassName: isNewClass ? '' : (existing?.subclassName ?? ''),
    fromLevel,
    toLevel,
    oldTotal,
    newTotalLevel: oldTotal - fromLevel + toLevel,
    atLevelCap: fromLevel >= 20,
  };
}

/**
 * Das Delta ohne Progression: `isHomebrew`, alle Zahlen neutral. Übungsbonus zählt über die
 * GESAMTstufe (Multiclass-Regel) und steht deshalb auch ohne Klassentabelle fest.
 */
function homebrewDelta(span: LevelSpan): LevelUpDelta {
  return {
    classIndex: span.classIndex,
    klasseName: span.klasseName,
    sourceKey: span.sourceKey,
    subclassKey: span.subclassKey,
    subclassName: span.subclassName,
    fromLevel: span.fromLevel,
    toLevel: span.toLevel,
    levelsGained: Math.max(1, span.toLevel - span.fromLevel),
    newTotalLevel: span.newTotalLevel,
    profBonusFrom: proficiencyBonus(span.oldTotal),
    profBonusTo: proficiencyBonus(span.newTotalLevel),
    hitDie: 0, casterType: 'NONE', casterKind: 'none',
    spellSlotDelta: Array(9).fill(0), castingIsNew: false, cantripDelta: 0,
    preparedFrom: 0, preparedTo: 0, preparedDelta: 0,
    masteryFrom: 0, masteryTo: 0,
    featuresGained: [], subclassFeaturesGained: [], subclassOptions: [],
    triggersSubclassChoice: false, triggersASI: false, asiCount: 0,
    isNewClass: span.isNewClass,
    isHomebrew: true,
    atLevelCap: span.atLevelCap,
  };
}

type SpellcastingDelta = Pick<LevelUpDelta, 'casterType' | 'casterKind' | 'spellSlotDelta' | 'castingIsNew' | 'cantripDelta' | 'preparedFrom' | 'preparedTo' | 'preparedDelta'>;

function spellcastingDelta(prog: ClassProgression, span: LevelSpan): SpellcastingDelta {
  const { fromLevel, toLevel } = span;
  const slotsFrom = fromLevel <= 0 ? Array<number>(9).fill(0) : spellSlotsAt(prog, fromLevel);
  const slotsTo = spellSlotsAt(prog, toLevel);
  const cantripFrom = fromLevel <= 0 ? 0 : cantripCount(prog, fromLevel);
  const prepTo = preparedOrKnownCount(prog, toLevel);
  const prepFrom = fromLevel <= 0 ? { count: 0, kind: prepTo.kind } : preparedOrKnownCount(prog, fromLevel);
  // Zauberwirken ist NUR dann neu, wenn der Charakter auf fromLevel noch keinerlei
  // Zauberwirken hatte (keine Plätze, Tricks oder vorbereitbaren/bekannten Zauber).
  // Sonst (z.B. Druide 2→3) ist die Klasse längst Zauberwirker → kein neuer Eintrag.
  const hadCasting = fromLevel > 0 && (slotsFrom.some((n) => n > 0) || cantripFrom > 0 || prepFrom.count > 0);
  return {
    casterType: prog.casterType,
    casterKind: prepTo.kind,
    spellSlotDelta: slotsTo.map((n, i) => Math.max(0, n - (slotsFrom[i] ?? 0))),
    castingIsNew: prepTo.kind !== 'none' && !hadCasting,
    cantripDelta: Math.max(0, cantripCount(prog, toLevel) - cantripFrom),
    preparedFrom: prepFrom.count,
    preparedTo: prepTo.count,
    preparedDelta: Math.max(0, prepTo.count - prepFrom.count),
  };
}

/**
 * Waffenbeherrschung wird bei Klassenkombination NICHT erneut gewährt: nur die Startklasse
 * (classIndex 0) stellt das Kontingent. Bei jeder weiteren Klasse bleibt es 0/0 → kein Hinweis.
 */
function masteryDelta(prog: ClassProgression, span: LevelSpan): Pick<LevelUpDelta, 'masteryFrom' | 'masteryTo'> {
  if (span.classIndex !== 0 || span.isNewClass) return { masteryFrom: 0, masteryTo: 0 };
  return {
    masteryFrom: span.fromLevel > 0 ? masteryAllowanceFor(prog, span.fromLevel) : 0,
    masteryTo: masteryAllowanceFor(prog, span.toLevel),
  };
}

/** Merkmale der Spanne plus die Anzahl der ASI-Stufen darin (jede ist eine Entscheidung). */
function featureDelta(prog: ClassProgression, span: LevelSpan): Pick<LevelUpDelta, 'featuresGained' | 'triggersASI' | 'asiCount'> {
  const featuresGained = featuresBetween(prog, span.fromLevel, span.toLevel);
  const asiCount = prog.features
    .filter((f) => matches(f, ASI_HINTS))
    .reduce((n, f) => n + f.gainedAt.filter((l) => l > span.fromLevel && l <= span.toLevel).length, 0);
  return { featuresGained, triggersASI: featuresGained.some((f) => matches(f, ASI_HINTS)), asiCount };
}

type SubclassDelta = Pick<LevelUpDelta, 'subclassFeaturesGained' | 'subclassOptions' | 'triggersSubclassChoice'>;

/**
 * Steht die Subklasse schon, kommen ihre Merkmale dazu; sonst werden Optionen angeboten —
 * NUR aus der lokalen Bibliothek (kein Open5e-Zugriff zur Laufzeit). Sie enthält eigene und
 * Homebrew-Subklassen wie „Circle of the Moon"; fehlende müssen zuvor lokal angelegt werden.
 */
async function subclassDelta(span: LevelSpan, featuresGained: ClassFeature[]): Promise<SubclassDelta> {
  const empty = { subclassFeaturesGained: [], subclassOptions: [], triggersSubclassChoice: false };
  if (span.subclassKey) {
    const subProg = await getProgressionByKey(span.subclassKey);
    if (!subProg) return empty;
    return { ...empty, subclassFeaturesGained: featuresBetween(subProg, span.fromLevel, span.toLevel) };
  }

  const options = new Map<string, SubclassOption>();
  try {
    for (const c of await getClasses()) {
      if (c.subclassOf === span.sourceKey && c.key) options.set(c.key, { key: c.key, name: classDisplayName(c) });
    }
  } catch {
    /* lokale Bibliothek nicht lesbar → keine Optionen, kein Blocker */
  }
  const subclassOptions = [...options.values()];
  const gainsSubclassFeature = featuresGained.some((f) => matches(f, SUBCLASS_HINTS));
  return {
    ...empty,
    subclassOptions,
    triggersSubclassChoice: subclassOptions.length > 0 && (gainsSubclassFeature || span.fromLevel >= 2),
  };
}

/**
 * Berechnet das Aufstiegs-Delta für die Klasse `classIndex` des Charakters von ihrer
 * aktuellen Stufe bis `targetLevel` (Default: +1). Kumulativ über alle übersprungenen
 * Stufen; Features/Slots/Trefferwürfel kommen aus der gewählten Klasse (+ ggf. Subklasse).
 */
export async function computeLevelUpDelta(
  character: Character,
  classIndex: number,
  targetLevel?: number,
  newClass?: { sourceKey: string; name: string },
): Promise<LevelUpDelta> {
  const span = levelSpan(character, classIndex, targetLevel, newClass);
  const prog = await getProgressionByKey(span.sourceKey);
  const delta = homebrewDelta(span);
  if (!prog) return delta;

  const features = featureDelta(prog, span);
  return {
    ...delta,
    isHomebrew: false,
    hitDie: prog.hitDie,
    ...spellcastingDelta(prog, span),
    ...masteryDelta(prog, span),
    ...features,
    ...(await subclassDelta(span, features.featuresGained)),
  };
}
