/**
 * Der Bibliotheks-Linter: wie viele Merkmale einer Bibliothek sind DEKLARIERT?
 *
 * Ohne diese Sichtbarkeit ist die Abdeckung blind (docs/plan/plan-wahlen-deklarieren.md,
 * Stufe 3 und Risiko 1): nur ein deklariertes Merkmal fällt aus der KI-Deutung heraus,
 * und ob eines deklariert ist, sieht man einer Karte sonst nirgends an.
 *
 * Die Unterscheidung, die alles trägt (siehe `featureGrantSchema`, schemas/shared.ts):
 * `grants` FEHLT = nie angesehen, läuft weiter über die KI-Kette; `grants: {}` = geprüft,
 * gewährt nichts. Deshalb fragt `isRedacted` nach der ANWESENHEIT des Feldes und
 * `hasDeclaredMechanics` nach seinem Inhalt — die beiden Fragen sind nicht dieselbe.
 */
import type { FeatureGrant, FeatureChoiceGrant, ProficiencyGrant, SpellGrant } from '$lib/schemas/shared';

/**
 * Der Ausschnitt, den Klassenmerkmal, Speziesmerkmal und Talent teilen — strukturell
 * statt als Union, damit derselbe Zähler für alle drei Artefakttypen gilt. Ein Typ
 * ohne `grantsChoice`/`grantsSpells` (Trait) passt hier hinein, weil beide optional sind.
 */
export interface DeclarableFeature {
  grants?: FeatureGrant;
  grantsChoice?: FeatureChoiceGrant;
  grantsSpells?: SpellGrant;
}

export interface DeclarationCoverage {
  /** Betrachtete Merkmale (bei einem Talent: 1 — das Talent selbst). */
  total: number;
  /** Redigiert: mindestens eine der drei Deklarationen ist gesetzt, auch leer. */
  redacted: number;
  /** Davon: trägt tatsächlich Mechanik. */
  withMechanics: number;
  /** Nicht redigiert — läuft weiter über die KI-Deutung. */
  undeclared: number;
}

const hasProficiency = (p: ProficiencyGrant): boolean =>
  p.skills.fixed.length > 0 || p.skills.choose > 0 || p.savingThrows.length > 0 ||
  p.weapons.length > 0 || p.weaponsOther.length > 0 || p.armor.length > 0;

/** `grants: {}` nach dem Zod-Parse: alle Felder auf ihrem Default. */
const grantIsEmpty = (g: FeatureGrant): boolean =>
  !hasProficiency(g.proficiencies) && g.extraCantrips === 0 && g.extraPreparedCount === 0 && g.perLevel.hpMax === 0;

/** Angesehen und entschieden — unabhängig davon, ob dabei Mechanik herauskam. */
export const isRedacted = (f: DeclarableFeature): boolean =>
  f.grants !== undefined || f.grantsChoice !== undefined || f.grantsSpells !== undefined;

/** Trägt deterministisch anwendbare Mechanik oder eine deklarierte Wahl. */
export const hasDeclaredMechanics = (f: DeclarableFeature): boolean =>
  f.grantsChoice !== undefined || f.grantsSpells !== undefined || (f.grants !== undefined && !grantIsEmpty(f.grants));

/**
 * Zählt die Abdeckung einer Merkmalsliste. Taugt für `classProgression.features`
 * (auch die einer Subklasse — die ist eine eigene Progression mit eigener Liste),
 * `species.traits` und ein einzelnes Talent (`[feat]`).
 */
export function declarationCoverage(features: readonly DeclarableFeature[]): DeclarationCoverage {
  const redactedList = features.filter(isRedacted);
  return {
    total: features.length,
    redacted: redactedList.length,
    withMechanics: features.filter(hasDeclaredMechanics).length,
    undeclared: features.length - redactedList.length,
  };
}

/** Anzeigeform des Abdeckungsstands: `tone` steuert nur die Farbe, nicht den Text. */
export interface CoverageBadge {
  text: string;
  title: string;
  tone: 'open' | 'done';
}

/**
 * Badge-Text für eine Bibliothekskarte. Bei genau einem Merkmal (ein Talent ist eines)
 * ist die Aussage ein Ja/Nein — ein Zähler „1 von 1" wäre dort nur Rauschen.
 */
export function coverageBadge(c: DeclarationCoverage): CoverageBadge {
  const title = `${c.withMechanics} mit Mechanik · ${c.redacted - c.withMechanics} geprüft ohne Wirkung · ${c.undeclared} undeklariert`;
  if (c.total === 1) {
    return c.undeclared ? { text: 'Undeklariert', title, tone: 'open' } : { text: 'Deklariert', title, tone: 'done' };
  }
  if (c.undeclared) {
    return { text: `${c.undeclared} von ${c.total} Merkmalen undeklariert`, title, tone: 'open' };
  }
  return { text: `Alle ${c.total} Merkmale deklariert`, title, tone: 'done' };
}
