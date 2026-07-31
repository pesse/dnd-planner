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

/**
 * Berechnet das Aufstiegs-Delta für die Klasse `classIndex` des Charakters von ihrer
 * aktuellen Stufe bis `targetLevel` (Default: +1). Kumulativ über alle übersprungenen
 * Stufen. Übungsbonus zählt über die GESAMTstufe (Multiclass-Regel); Features/Slots/
 * Trefferwürfel kommen aus der gewählten Klasse (+ ggf. Subklasse).
 */
export async function computeLevelUpDelta(
  character: Character,
  classIndex: number,
  targetLevel?: number,
  newClass?: { sourceKey: string; name: string },
): Promise<LevelUpDelta> {
  const classes = character.classes ?? [];
  const existing = classes[classIndex];
  const isNewClass = !!newClass;
  const fromLevel = isNewClass ? 0 : (existing?.level ?? 1);
  const sourceKey = isNewClass ? newClass!.sourceKey : (existing?.sourceKey ?? '');
  const klasseName = isNewClass ? newClass!.name : (existing?.name ?? '');
  const atLevelCap = fromLevel >= 20;
  const toLevel = Math.min(20, Math.max(fromLevel + 1, targetLevel ?? fromLevel + 1));
  const oldTotal = totalLevel(classes);
  const newTotalLevel = oldTotal - fromLevel + toLevel;

  const delta: LevelUpDelta = {
    classIndex,
    klasseName,
    sourceKey,
    subclassKey: isNewClass ? '' : (existing?.subclassKey ?? ''),
    subclassName: isNewClass ? '' : (existing?.subclassName ?? ''),
    fromLevel,
    toLevel,
    levelsGained: Math.max(1, toLevel - fromLevel),
    newTotalLevel,
    profBonusFrom: proficiencyBonus(oldTotal),
    profBonusTo: proficiencyBonus(newTotalLevel),
    hitDie: 0,
    casterType: 'NONE',
    casterKind: 'none',
    spellSlotDelta: Array(9).fill(0),
    castingIsNew: false,
    cantripDelta: 0,
    preparedFrom: 0,
    preparedTo: 0,
    preparedDelta: 0,
    masteryFrom: 0,
    masteryTo: 0,
    featuresGained: [],
    subclassFeaturesGained: [],
    triggersSubclassChoice: false,
    triggersASI: false,
    asiCount: 0,
    subclassOptions: [],
    isNewClass,
    isHomebrew: true,
    atLevelCap,
  };

  const prog = await getProgressionByKey(sourceKey);
  delta.isHomebrew = !prog;

  if (prog) {
    delta.hitDie = prog.hitDie;
    delta.casterType = prog.casterType;
    const slotsFrom = fromLevel <= 0 ? Array<number>(9).fill(0) : spellSlotsAt(prog, fromLevel);
    const slotsTo = spellSlotsAt(prog, toLevel);
    delta.spellSlotDelta = slotsTo.map((n, i) => Math.max(0, n - (slotsFrom[i] ?? 0)));
    const cantripFrom = fromLevel <= 0 ? 0 : cantripCount(prog, fromLevel);
    delta.cantripDelta = Math.max(0, cantripCount(prog, toLevel) - cantripFrom);
    const prepTo = preparedOrKnownCount(prog, toLevel);
    const prepFrom = fromLevel <= 0 ? { count: 0, kind: prepTo.kind } : preparedOrKnownCount(prog, fromLevel);
    delta.casterKind = prepTo.kind;
    // Zauberwirken ist NUR dann neu, wenn der Charakter auf fromLevel noch keinerlei
    // Zauberwirken hatte (keine Plätze, Tricks oder vorbereitbaren/bekannten Zauber).
    // Sonst (z.B. Druide 2→3) ist die Klasse längst Zauberwirker → kein neuer Eintrag.
    const hadCasting = fromLevel > 0 && (slotsFrom.some((n) => n > 0) || cantripFrom > 0 || prepFrom.count > 0);
    delta.castingIsNew = prepTo.kind !== 'none' && !hadCasting;
    delta.preparedFrom = prepFrom.count;
    delta.preparedTo = prepTo.count;
    delta.preparedDelta = Math.max(0, prepTo.count - prepFrom.count);
    // Waffenbeherrschung wird bei Klassenkombination NICHT erneut gewährt: nur die
    // Startklasse (classIndex 0) stellt das Kontingent. Bei jeder weiteren Klasse
    // bleibt es 0/0 → kein Hinweis.
    if (classIndex === 0 && !isNewClass) {
      delta.masteryFrom = fromLevel > 0 ? masteryAllowanceFor(prog, fromLevel) : 0;
      delta.masteryTo = masteryAllowanceFor(prog, toLevel);
    }
    delta.featuresGained = featuresBetween(prog, fromLevel, toLevel);
    delta.triggersASI = delta.featuresGained.some((f) => matches(f, ASI_HINTS));
    // Anzahl ASI-Stufen in der Spanne (jede ASI-Stufe = eine Entscheidung).
    for (const f of prog.features) {
      if (matches(f, ASI_HINTS)) delta.asiCount += f.gainedAt.filter((l) => l > fromLevel && l <= toLevel).length;
    }

    // Subklassen-Merkmale (falls bereits eine Subklasse gewählt ist).
    if (delta.subclassKey) {
      const subProg = await getProgressionByKey(delta.subclassKey);
      if (subProg) delta.subclassFeaturesGained = featuresBetween(subProg, fromLevel, toLevel);
    } else {
      // Noch keine Subklasse → Optionen NUR aus der lokalen Bibliothek anbieten
      // (kein Open5e-Zugriff zur Laufzeit). Enthält eigene/Homebrew-Subklassen wie
      // „Circle of the Moon". Fehlende Subklassen müssen zuvor lokal angelegt werden.
      const options = new Map<string, SubclassOption>();
      try {
        for (const c of await getClasses()) {
          if (c.subclassOf === delta.sourceKey && c.key) options.set(c.key, { key: c.key, name: classDisplayName(c) });
        }
      } catch {
        /* lokale Bibliothek nicht lesbar → keine Optionen, kein Blocker */
      }
      delta.subclassOptions = [...options.values()];
      const gainsSubclassFeature = delta.featuresGained.some((f) => matches(f, SUBCLASS_HINTS));
      delta.triggersSubclassChoice = delta.subclassOptions.length > 0 && (gainsSubclassFeature || fromLevel >= 2);
    }
  }

  return delta;
}
