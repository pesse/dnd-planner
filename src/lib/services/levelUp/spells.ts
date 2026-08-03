/**
 * Zaubernamen aus KI-Ridern und Deklarationen gegen die lokale Bibliothek auflösen,
 * kanonisieren, nach Grad trennen. Ein Name ohne Treffer wird `flagged`, nie übernommen.
 */
import { resolveSpell, type SpellInfo } from '../../spellLibrary';
import type { Change, FeatureRider } from '../../schemas/levelUp';
import type { LevelUpDelta } from '../levelUp';
import {
  declaredSpellGrants,
  unreadableSpellGrant,
  type SpellGrantSource,
} from '../grantedSpells';
import { isSpellbookClass } from '../spellcasting';
import type { StepId } from './steps';

export interface ValidatedRiders {
  riders: FeatureRider[];
  flagged: string[]; // KI-Zaubernamen ohne Bibliothekstreffer
  grantedCantrips: string[]; // aufgelöste Grad-0-Zauber (kanonisch)
  grantedPrepared: { level: number; name: string }[]; // aufgelöste Grad-1+-Zauber (kanonisch)
}

export interface DeclaredSpells {
  cantrips: string[];
  prepared: { level: number; name: string }[];
  flagged: string[];
  /** Merkmale mit unlesbar angekündigter Liste — bleiben beim Modell, werden aber gemeldet. */
  unreadable: string[];
}

export const noDeclaredSpells = (): DeclaredSpells => ({ cantrips: [], prepared: [], flagged: [], unreadable: [] });

/**
 * Immer-vorbereitete Zauber der Merkmale auf `classLevel`. Ein Name ohne Bibliothekstreffer
 * wird gemeldet statt still verworfen — der Nutzer soll den fehlenden Zauber anlegen können.
 */
export function resolveDeclaredSpells(
  features: (SpellGrantSource & { name?: string; nameDe?: string })[],
  classLevel: number,
  library: SpellInfo[],
  klasseName = '',
): DeclaredSpells {
  const out = noDeclaredSpells();
  for (const f of features) {
    if (!unreadableSpellGrant(f)) continue;
    const label = f.nameDe?.trim() || f.name?.trim() || '';
    if (label && !out.unreadable.includes(label)) out.unreadable.push(label);
  }
  return resolveSpellNames(declaredSpellGrants(features, classLevel), library, klasseName, out);
}

/**
 * Zwei Quellen speisen dieselbe Senke — die Stufentabelle im `desc` (`declaredSpellGrants`)
 * und die Zauber einer gewählten Option (`optionSpellNames`). `into` sammelt beide in EIN
 * Ergebnis, ohne Merge-Hilfsfunktion.
 */
export function resolveSpellNames(
  names: readonly string[],
  library: SpellInfo[],
  klasseName = '',
  into: DeclaredSpells = noDeclaredSpells(),
): DeclaredSpells {
  const out = into;
  for (const raw of names) {
    const info = resolveSpell(library, raw, klasseName);
    if (!info) { if (!out.flagged.includes(raw)) out.flagged.push(raw); continue; }
    if (info.level === 0) { if (!out.cantrips.includes(info.name)) out.cantrips.push(info.name); }
    else if (!out.prepared.some((p) => p.name === info.name)) out.prepared.push({ level: info.level, name: info.name });
  }
  return out;
}

/**
 * Am DETERMINISTISCHEN Subklassen-Schritt, nicht am KI-Schritt: ohne QM-Modell (Analyse
 * übersprungen) bekäme der Charakter seine Domänen-/Kreiszauber sonst überhaupt nicht.
 */
export function declaredSpellChanges(g: DeclaredSpells, step: StepId = 'subclass-delta'): Change[] {
  return [
    ...g.cantrips.map((name): Change => ({
      target: 'cantrip', name, step, source: 'class-feature', label: `Zaubertrick: ${name}`,
    })),
    ...g.prepared.map((p): Change => ({
      target: 'preparedSpell', level: p.level, name: p.name, prepared: true, step,
      source: 'class-feature', label: `Vorbereitet (Grad ${p.level}): ${p.name}`,
    })),
  ];
}

export function validateRiderSpells(riders: FeatureRider[], library: SpellInfo[], klasseName = ''): ValidatedRiders {
  const flagged: string[] = [];
  const grantedCantrips: string[] = [];
  const grantedPrepared: { level: number; name: string }[] = [];
  const cleaned = riders.map((r) => {
    const kept: string[] = [];
    for (const raw of r.grantedSpells) {
      const info = resolveSpell(library, raw, klasseName);
      if (!info) { flagged.push(raw); continue; }
      kept.push(info.name);
      if (info.level === 0) { if (!grantedCantrips.includes(info.name)) grantedCantrips.push(info.name); }
      else if (!grantedPrepared.some((p) => p.name === info.name)) grantedPrepared.push({ level: info.level, name: info.name });
    }
    return { ...r, grantedSpells: kept };
  });
  return { riders: cleaned, flagged: [...new Set(flagged)], grantedCantrips, grantedPrepared };
}

export interface LearnInfo {
  learns: boolean; // Klasse lernt beim Aufstieg Zauber dauerhaft dazu
  count: number; // wie viele
  spellbook: boolean; // true = ins Zauberbuch (nicht automatisch vorbereitet)
}

/**
 * „Vorbereiten" ist KEIN Teil des Aufstiegs: reine Vorbereiter (Druide/Kleriker) lernen nichts
 * dazu und bekommen keine Auswahl. Der Magier trägt 2 je Stufe ins Zauberbuch ein.
 */
export function learnInfo(delta: LevelUpDelta, riders: FeatureRider[]): LearnInfo {
  const spellbook = isSpellbookClass(delta.sourceKey, delta.klasseName);
  const known = delta.casterKind === 'known';
  const riderExtra = riders.reduce((s, r) => s + r.extraPreparedCount, 0);
  const count = known ? delta.preparedDelta + riderExtra : spellbook ? 2 * delta.levelsGained : 0;
  return { learns: known || spellbook, count, spellbook };
}
