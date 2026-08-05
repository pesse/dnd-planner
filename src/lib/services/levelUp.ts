/**
 * Deterministischer Delta-Service für den Stufenaufstieg (kein LLM). Alle Zahlen sind DELTAS,
 * nie Absolutwerte — nur additiv angewandt bleiben item-gewährte Slots erhalten. Ohne
 * Progression (Homebrew, Netzfehler) degradiert er auf `isHomebrew`, und die KI fragt alles ab.
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
import { isSpellcastingFeature } from './spellcasting';
import { classCastingOffer, emptyClassCastingOffer, type ClassCastingOffer } from './spellcasting/classOffer';
import { isFlowOwnedDeclaration } from './declaration/optionList';

export interface SubclassOption {
  key: string;
  name: string;
}

/** Wohin ein Change-Ziel im Zauber-Block routet — `spellcasting/write.ts`s `(sourceId, quotaId)`. */
export interface QuotaTarget {
  sourceId: string;
  quotaId: string;
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
  castingIsNew: boolean; // ERSTMALS erlangt, nicht: ist Zauberwirker
  cantripDelta: number;
  preparedFrom: number;
  preparedTo: number;
  preparedDelta: number;
  spellbook: boolean; // true = Zauberbuch-Regime (Vorbereitung zieht aus einem Buch-Kontingent)
  /** Ziel-Quotas auf `toLevel` — `null` ohne Zauberwirken. Für `decisionChanges` (Aufstiegs-Picker). */
  cantripTarget: QuotaTarget | null;
  spellTarget: QuotaTarget | null;
  masteryFrom: number; // Waffenbeherrschungs-Kontingent; 0 = Klasse hat sie nicht
  masteryTo: number; // ein Anstieg erzeugt nur einen Hinweis, keine Wahl
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
 * Merkmale, deren einziger Inhalt eine Wahl ist, die der Flow selbst trifft. Sie fliegen aus
 * der Merkmals-Analyse: die KI erzwänge sonst eine längst getroffene Entscheidung erneut und
 * böte bei Waffenbeherrschung/Kampfstil/Zauberwirken eine ERFUNDENE Options-Liste an.
 *
 * Nur `isFlowOwnedDeclaration` gilt für jede Herkunft — die Namensheuristiken darunter sind
 * KLASSEN-Vokabular und würden auf Traits oder Talenten fehlzünden. „subclass" ist bewusst ENG
 * gebunden statt an `SUBCLASS_HINTS`, dessen weiche Begriffe „Contact Patron" mit treffen.
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

function featuresBetween(prog: ClassProgression, fromLevel: number, toLevel: number): ClassFeature[] {
  return prog.features
    .filter((f) => f.gainedAt.some((l) => l > fromLevel && l <= toLevel))
    .sort((a, b) => Math.min(...a.gainedAt) - Math.min(...b.gainedAt));
}

/** Aus Charakter + Ziel abgeleitet, ohne Progression. */
interface LevelSpan {
  classIndex: number;
  isNewClass: boolean;
  sourceKey: string;
  klasseName: string;
  subclassKey: string;
  subclassName: string;
  fromLevel: number;
  toLevel: number;
  /** Der Übungsbonus hängt an der GESAMTstufe, nicht an der Klassenstufe. */
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

/** Ohne Progression bleibt nur der Übungsbonus — er zählt über die Gesamtstufe. */
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
    preparedFrom: 0, preparedTo: 0, preparedDelta: 0, spellbook: false,
    cantripTarget: null, spellTarget: null,
    masteryFrom: 0, masteryTo: 0,
    featuresGained: [], subclassFeaturesGained: [], subclassOptions: [],
    triggersSubclassChoice: false, triggersASI: false, asiCount: 0,
    isNewClass: span.isNewClass,
    isHomebrew: true,
    atLevelCap: span.atLevelCap,
  };
}

type SpellcastingDelta = Pick<LevelUpDelta, 'casterType' | 'casterKind' | 'spellSlotDelta' | 'castingIsNew' | 'cantripDelta' | 'preparedFrom' | 'preparedTo' | 'preparedDelta' | 'spellbook' | 'cantripTarget' | 'spellTarget'>;

/**
 * Zwei Angebote (vor/nach) statt einer Absolutzahl je Grad: dasselbe `classCastingOffer`, das
 * der Wizard-Schritt „Zauber" nutzt, macht die Klassentabellen-Sonderfälle (Zauberbuch-Wachstum,
 * Spaltenname je Klasse) zur Quota-Struktur statt zu `cantripCount`/`preparedOrKnownCount`. Nur
 * die Plätze bleiben Tabellenspalten — kein Quota trägt sie, sie sind kein Kontingent.
 */
async function spellcastingDelta(prog: ClassProgression, span: LevelSpan): Promise<SpellcastingDelta> {
  const { fromLevel, toLevel } = span;
  const slotsFrom = fromLevel <= 0 ? Array<number>(9).fill(0) : spellSlotsAt(prog, fromLevel);
  const slotsTo = spellSlotsAt(prog, toLevel);

  const at = (level: number): Promise<ClassCastingOffer> =>
    level <= 0
      ? Promise.resolve(emptyClassCastingOffer(span.klasseName))
      : classCastingOffer({
          classKey: span.sourceKey, klasseName: span.klasseName, level,
          ...(span.subclassKey ? { subclassKey: span.subclassKey, subclassName: span.subclassName } : {}),
        });
  const [from, to] = await Promise.all([at(fromLevel), at(toLevel)]);

  // „known" heißt hier: die Auswahl bleibt zwischen Ruhen bestehen (Zauberbuch, feste Liste),
  // nicht die Klassentabellen-Spaltenüberschrift — `long-rest-all` (Kleriker/Druide) ist die
  // einzige Regel-Familie ohne einen zu lernenden Bestand.
  const known = !!(to.spells && to.spells.swap.spells !== 'long-rest-all');
  // Neu ist Zauberwirken nur ohne JEDE Spur davon auf fromLevel — sonst bekäme ein längst
  // zaubernder Charakter (Druide 2→3) bei jedem Aufstieg einen neuen Eintrag.
  const hadCasting = fromLevel > 0 && (slotsFrom.some((n) => n > 0) || from.isCaster);
  return {
    casterType: prog.casterType,
    casterKind: to.isCaster ? (known ? 'known' : 'prepared') : 'none',
    spellSlotDelta: slotsTo.map((n, i) => Math.max(0, n - (slotsFrom[i] ?? 0))),
    castingIsNew: to.isCaster && !hadCasting,
    cantripDelta: Math.max(0, (to.cantrips?.count ?? 0) - (from.cantrips?.count ?? 0)),
    preparedFrom: from.spells?.count ?? 0,
    preparedTo: to.spells?.count ?? 0,
    preparedDelta: Math.max(0, (to.spells?.count ?? 0) - (from.spells?.count ?? 0)),
    spellbook: !!to.prepared,
    cantripTarget: to.cantrips ? { sourceId: to.cantrips.sourceId, quotaId: to.cantrips.quotaId } : null,
    spellTarget: to.spells ? { sourceId: to.spells.sourceId, quotaId: to.spells.quotaId } : null,
  };
}

/** Nur die Startklasse stellt das Kontingent — Klassenkombination gewährt es nicht erneut. */
function masteryDelta(prog: ClassProgression, span: LevelSpan): Pick<LevelUpDelta, 'masteryFrom' | 'masteryTo'> {
  if (span.classIndex !== 0 || span.isNewClass) return { masteryFrom: 0, masteryTo: 0 };
  return {
    masteryFrom: span.fromLevel > 0 ? masteryAllowanceFor(prog, span.fromLevel) : 0,
    masteryTo: masteryAllowanceFor(prog, span.toLevel),
  };
}

function featureDelta(prog: ClassProgression, span: LevelSpan): Pick<LevelUpDelta, 'featuresGained' | 'triggersASI' | 'asiCount'> {
  const featuresGained = featuresBetween(prog, span.fromLevel, span.toLevel);
  const asiCount = prog.features
    .filter((f) => matches(f, ASI_HINTS))
    .reduce((n, f) => n + f.gainedAt.filter((l) => l > span.fromLevel && l <= span.toLevel).length, 0);
  return { featuresGained, triggersASI: featuresGained.some((f) => matches(f, ASI_HINTS)), asiCount };
}

type SubclassDelta = Pick<LevelUpDelta, 'subclassFeaturesGained' | 'subclassOptions' | 'triggersSubclassChoice'>;

/**
 * Die Optionen kommen NUR aus der lokalen Bibliothek (kein Open5e-Zugriff zur Laufzeit) —
 * eine fehlende Subklasse muss zuvor lokal angelegt werden.
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

/** Kumulativ bis `targetLevel` (Default: +1) — auch über übersprungene Stufen hinweg. */
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
    ...(await spellcastingDelta(prog, span)),
    ...masteryDelta(prog, span),
    ...features,
    ...(await subclassDelta(span, features.featuresGained)),
  };
}
