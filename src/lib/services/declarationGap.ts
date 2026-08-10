/**
 * Der Lückenmelder: Prosa kündigt eine Mechanik an, für die keine Deklaration steht. Reine
 * WARNUNG, kein Parser — seit Wahlen und Zaubergewährung ausschließlich aus der Bibliothek
 * kommen, fiele so ein Merkmal sonst STILL aus; die KI schreibt ihm nur noch eine Bogenzeile.
 * Vorbild ist `DeclaredSpells.unreadable`: laut melden statt still verlieren.
 */
import type { DeclarableFeature } from './declarationCoverage';

export type DeclarationGapKind = 'spells' | 'resource' | 'ability' | 'choice';

export interface DeclarationGap {
  /** Deutscher Anzeigename, falls vorhanden — die Meldung liest ein Mensch. */
  name: string;
  kind: DeclarationGapKind;
}

/** Erfüllt jedes Merkmal der drei Bibliothekstypen; `desc` ist ENGLISCH, wie die Signale. */
export interface GapCandidate extends DeclarableFeature {
  name: string;
  nameDe?: string;
  desc?: string;
  aiInterpretsRest?: boolean;
}

/**
 * Über `DeclarationGapKind` total: eine neue Signal-Art ohne Gegenprüfung wäre wieder ein
 * stiller Verlust. `declared` fragt nach ANWESENHEIT, nicht nach Inhalt — `{}` und `[]` heißen
 * „geprüft, gewährt nichts" und sind damit keine Lücke.
 */
const GAP_RULES: {
  [K in DeclarationGapKind]: { signal: RegExp; declared: (f: DeclarableFeature) => boolean };
} = {
  spells: {
    signal: /\byou (?:always have|know) the\b|\bcantrip\b/i,
    declared: (f) => f.grantsSpells !== undefined || f.grantsCasting !== undefined,
  },
  resource: {
    signal: /\bexpended uses?\b|\bnumber of (?:times|uses)\b/i,
    declared: (f) => f.grantsResource !== undefined || f.grantsCasting !== undefined,
  },
  ability: {
    signal: /\bincrease (?:your|one) [^.]*\bscore\b/i,
    // Für die Attributserhöhung gibt es noch keine Senke (Issue #31), also ist sie NIE
    // deklariert. Wer sie bewusst der Bogen-Notiz überlässt, setzt `aiInterpretsRest`.
    declared: () => false,
  },
  choice: {
    signal: /\bchoose\b|\bof your choice\b|\bexpertise\b/i,
    declared: (f) => f.grantsChoice !== undefined,
  },
};

/**
 * EINE Meldung je Merkmal, die der ersten passenden Regel: die Zeile schickt zum Editor, und
 * dort steht das ganze Merkmal — zwei Zeilen darüber lasen sich wie zwei Probleme („Increase one
 * ability score of your choice" trifft `ability` und `choice`).
 */
export function declarationGaps(features: readonly GapCandidate[]): DeclarationGap[] {
  const out: DeclarationGap[] = [];
  // Dasselbe Merkmal erreicht den Flow aus mehreren Richtungen — ohne Guard doppelt gemeldet.
  const seen = new Set<string>();
  for (const f of features) {
    const desc = f.desc ?? '';
    // `aiInterpretsRest` heißt ausdrücklich „die Prosa bekommt eine Bogenzeile, sonst nichts" —
    // das ist eine Entscheidung, keine Lücke.
    if (!desc.trim() || f.aiInterpretsRest) continue;
    const name = f.nameDe || f.name;
    if (seen.has(name)) continue;
    const kind = (Object.keys(GAP_RULES) as DeclarationGapKind[]).find(
      (k) => GAP_RULES[k].signal.test(desc) && !GAP_RULES[k].declared(f),
    );
    if (!kind) continue;
    seen.add(name);
    out.push({ name, kind });
  }
  return out;
}

const GAP_TEXT: Record<DeclarationGapKind, string> = {
  spells: 'kündigt in seiner Regelprosa Zauber an, die die Bibliothek nicht deklariert',
  resource: 'zählt in seiner Regelprosa Anwendungen, für die kein Vorrat deklariert ist',
  ability: 'erhöht ein Attribut, das die Bibliothek nicht deklariert — der Wert bleibt aus',
  choice: 'kündigt in seiner Regelprosa eine Wahl an, die die Bibliothek nicht deklariert',
};

/** Deutsch: die Zeile landet im Schritt-Log und im Klassenmerkmale-Feld. */
export const declarationGapLine = (g: DeclarationGap): string =>
  `„${g.name}" ${GAP_TEXT[g.kind]} — im Editor nachtragen.`;

/**
 * Alle Meldungen eines Merkmalsbestands. `unredacted` sind Merkmale, deren GEWÄHLTE Option
 * nichts gewährt (`unredactedChoiceFeatures`) — dort spannt die Antwort die Lücke auf, nicht
 * die Prosa, deshalb kommen sie als eigene Liste herein.
 */
export function declarationGapLines(
  features: readonly GapCandidate[],
  unredacted: readonly { name: string; nameDe?: string }[] = [],
): string[] {
  return [...new Set([
    ...declarationGaps(features).map(declarationGapLine),
    ...unredacted.map((f) => `„${f.nameDe || f.name}": die gewählte Option deklariert keine Wirkung — im Editor nachtragen.`),
  ])];
}
