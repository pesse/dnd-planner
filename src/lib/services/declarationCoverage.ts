/**
 * Der Bibliotheks-Linter: wie viele Merkmale sind DEKLARIERT? Trägt die Unterscheidung
 * `grants` FEHLT (nie angesehen, läuft über die KI-Kette) gegen `grants: {}` (geprüft,
 * gewährt nichts) — `isRedacted` fragt nach der ANWESENHEIT, `hasDeclaredMechanics` nach Inhalt.
 */
import type { FeatureGrant, SpellGrant } from '$lib/schemas/grants';
import type { FeatureChoiceGrant } from '$lib/schemas/featureChoice';
import { isEmptyFeatureGrant } from './declaration/grants';

/**
 * Der Ausschnitt, den Klassenmerkmal, Speziesmerkmal und Talent teilen — strukturell statt
 * als Union, damit derselbe Zähler für alle drei Artefakttypen gilt.
 */
export interface DeclarableFeature {
  grants?: FeatureGrant;
  grantsChoice?: FeatureChoiceGrant;
  grantsSpells?: SpellGrant;
}

export interface DeclarationCoverage {
  total: number;
  /** Mindestens eine der drei Deklarationen ist gesetzt — auch leer. */
  redacted: number;
  withMechanics: number;
  undeclared: number;
}


/** Angesehen und entschieden — unabhängig davon, ob dabei Mechanik herauskam. */
export const isRedacted = (f: DeclarableFeature): boolean =>
  f.grants !== undefined || f.grantsChoice !== undefined || f.grantsSpells !== undefined;

/** Trägt deterministisch anwendbare Mechanik oder eine deklarierte Wahl. */
export const hasDeclaredMechanics = (f: DeclarableFeature): boolean =>
  f.grantsChoice !== undefined || f.grantsSpells !== undefined || (f.grants !== undefined && !isEmptyFeatureGrant(f.grants));

export function declarationCoverage(features: readonly DeclarableFeature[]): DeclarationCoverage {
  const redactedList = features.filter(isRedacted);
  return {
    total: features.length,
    redacted: redactedList.length,
    withMechanics: features.filter(hasDeclaredMechanics).length,
    undeclared: features.length - redactedList.length,
  };
}

export interface CoverageBadge {
  text: string;
  title: string;
  tone: 'open' | 'done';
}

/** Bei genau einem Merkmal (ein Talent) ein Ja/Nein — „1 von 1" wäre nur Rauschen. */
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
