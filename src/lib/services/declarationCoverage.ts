/**
 * Der Bibliotheks-Linter: wie viele Merkmale sind DEKLARIERT? Trägt die Unterscheidung
 * `grants` FEHLT (nie angesehen, läuft über die KI-Kette) gegen `grants: {}` (geprüft,
 * gewährt nichts) — `isRedacted` fragt nach der ANWESENHEIT, `hasDeclaredMechanics` nach Inhalt.
 */
import type { FeatureGrant, ProficiencyGrant, SpellGrant } from '$lib/schemas/grants';
import type { FeatureChoiceGrant } from '$lib/schemas/featureChoice';
import { isEmptyCharacterProperties } from './characterProperties';

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

const hasProficiency = (p: ProficiencyGrant): boolean =>
  p.skills.fixed.length > 0 || p.skills.choose > 0 || p.savingThrows.length > 0 ||
  p.weapons.length > 0 || p.weaponsOther.length > 0 || p.armor.length > 0;

/** `grants: {}` nach dem Zod-Parse: alle Felder auf ihrem Default. */
const grantIsEmpty = (g: FeatureGrant): boolean =>
  !hasProficiency(g.proficiencies) && g.extraCantrips === 0 && g.extraPreparedCount === 0 &&
  g.perLevel.hpMax === 0 && isEmptyCharacterProperties(g.properties);

/** Angesehen und entschieden — unabhängig davon, ob dabei Mechanik herauskam. */
export const isRedacted = (f: DeclarableFeature): boolean =>
  f.grants !== undefined || f.grantsChoice !== undefined || f.grantsSpells !== undefined;

/** Trägt deterministisch anwendbare Mechanik oder eine deklarierte Wahl. */
export const hasDeclaredMechanics = (f: DeclarableFeature): boolean =>
  f.grantsChoice !== undefined || f.grantsSpells !== undefined || (f.grants !== undefined && !grantIsEmpty(f.grants));

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
