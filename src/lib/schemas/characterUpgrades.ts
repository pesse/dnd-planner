/**
 * Die versionierte Upgrade-Pipeline der Charakterdateien: sie laufen beim Laden im
 * Speicher, in die DATEI schreibt sie erst die sichtbare Aktion pro Charakter.
 */
import { migrateSourceKey } from './source';
import { parseClassLevelText } from './classLevelText';

export const CHARACTER_VERSION = 6;

export interface CharacterUpgrade {
  /** Version, die dieser Schritt herstellt. */
  to: number;
  /** Erscheint im Upgrade-Protokoll. */
  label: string;
  apply: (c: Record<string, unknown>) => void;
}

// Ein neuer Schritt heißt: `CHARACTER_VERSION` erhöhen und GENAU EINEN Schritt mit dieser
// `to` ergänzen. Sein `apply` muss idempotent UND inhaltlich abgesichert sein — Altbestand
// trägt oft keine oder eine zu niedrige `_version`, obwohl die Umstellung schon lief.
export const CHARACTER_UPGRADES: CharacterUpgrade[] = [
  {
    to: 2,
    label: 'Freitext-Klasse → strukturierte Klassen-Einträge',
    apply: (c) => {
      // Nur wenn noch keine gepflegt sind, damit bereits umgestellte Charaktere unberührt bleiben.
      const hasClasses = Array.isArray(c.classes) && c.classes.length > 0;
      if (hasClasses || typeof c.classLevel !== 'string' || !c.classLevel.trim()) return;
      const parsed = parseClassLevelText(c.classLevel);
      if (parsed.length) c.classes = parsed;
    },
  },
  {
    to: 3,
    label: 'Volk/Hintergrund → Bibliotheks-Links, Key-Präfixe aktualisiert',
    apply: (c) => {
      // `sourceKey` bleibt leer, bis der Bibliotheks-Picker im Editor greift.
      const sp = c.species as { sourceKey?: string; name?: string } | undefined;
      const hasSpecies = sp && typeof sp === 'object' && ((sp.sourceKey ?? '').trim() || (sp.name ?? '').trim());
      if (!hasSpecies && typeof c.race === 'string' && c.race.trim())
        c.species = { sourceKey: '', name: c.race.trim() };

      const bg = c.backgroundRef as { sourceKey?: string; name?: string } | undefined;
      const hasBackground = bg && typeof bg === 'object' && ((bg.sourceKey ?? '').trim() || (bg.name ?? '').trim());
      if (!hasBackground && typeof c.background === 'string' && c.background.trim())
        c.backgroundRef = { sourceKey: '', name: c.background.trim() };

      for (const cls of (Array.isArray(c.classes) ? c.classes : []) as Record<string, unknown>[]) {
        if (cls?.sourceKey) cls.sourceKey = migrateSourceKey(cls.sourceKey as string);
        if (cls?.subclassKey) cls.subclassKey = migrateSourceKey(cls.subclassKey as string);
      }
      const species = c.species as Record<string, unknown> | undefined;
      if (species?.sourceKey) species.sourceKey = migrateSourceKey(species.sourceKey as string);
      if (species?.subspeciesKey) species.subspeciesKey = migrateSourceKey(species.subspeciesKey as string);
      const background = c.backgroundRef as Record<string, unknown> | undefined;
      if (background?.sourceKey) background.sourceKey = migrateSourceKey(background.sourceKey as string);
      // Schritt 4 zieht references.feats nach features um; hier liegt es noch am alten Ort.
      const refs = c.references as { feats?: Record<string, unknown>[] } | undefined;
      for (const f of refs?.feats ?? []) {
        if (f?.sourceKey) f.sourceKey = migrateSourceKey(f.sourceKey as string);
      }
    },
  },
  {
    to: 4,
    label: 'Talent-Referenzen → Merkmals-Ledger (references.feats → features)',
    apply: (c) => {
      const refs = c.references as { feats?: Record<string, unknown>[] } | undefined;
      const legacy = (refs?.feats ?? []).map((f) => ({
        sourceKey: migrateSourceKey((f?.sourceKey as string) ?? ''),
        name: (f?.name as string) ?? '',
        choice: '',
        ...(typeof f?.gainedAt === 'number' ? { gainedAt: f.gainedAt } : {}),
        desc: (f?.desc as string) ?? '',
      }));
      // Was schon in `features` steht, bleibt und wird nicht dupliziert.
      const existing = (Array.isArray(c.features) ? c.features : []) as { sourceKey?: string; name?: string }[];
      const known = new Set(existing.map((e) => `${e.sourceKey ?? ''}|${e.name ?? ''}`));
      c.features = [...existing, ...legacy.filter((e) => !known.has(`${e.sourceKey}|${e.name}`))];
      delete c.references;
    },
  },
  {
    to: 5,
    label: 'Zauber: Zaubertricks als Objektliste (Vorbereitung Key-Verknüpfung)',
    apply: (c) => {
      const sp = c.spells as Record<string, unknown> | undefined;
      if (!sp || typeof sp !== 'object' || !Array.isArray(sp.cantrips)) return;
      // Nur Strings wandeln; Keys werden NICHT erfunden — `sourceKey` bleibt leer und
      // löst zur Laufzeit über den Namen auf.
      sp.cantrips = (sp.cantrips as unknown[]).map((x) => (typeof x === 'string' ? { name: x } : x));
    },
  },
  {
    to: 6,
    label: 'Merkmals-Wahl: deutsches Label nach choiceDe',
    apply: (c) => {
      // Kopieren statt verschieben: `choice` ist an sechs Stellen der Diskriminator
      // „Wahl-Eintrag vs. Talent-Link", leeren würde diese Aufteilung still umwerfen.
      const features = Array.isArray(c.features) ? (c.features as Record<string, unknown>[]) : [];
      for (const f of features) {
        if (!f || typeof f !== 'object') continue;
        const choice = typeof f.choice === 'string' ? f.choice : '';
        const choiceDe = typeof f.choiceDe === 'string' ? f.choiceDe : '';
        if (choice.trim() && !choiceDe.trim()) f.choiceDe = choice;
      }
    },
  },
];

/** Ohne `_version` gilt 1 — so waren die Dateien, bevor es das Feld gab. */
export function characterVersionOf(raw: unknown): number {
  const v = (raw as { _version?: unknown } | null)?._version;
  return typeof v === 'number' && v >= 1 ? Math.floor(v) : 1;
}

export interface CharacterUpgradeResult {
  data: Record<string, unknown>;
  fromVersion: number;
  /** Ziel, nicht Ergebnis: gestempelt wird `data._version`. */
  toVersion: number;
  applied: string[];
  /** Der Schritt, der an diesen Daten scheiterte — ab ihm bleibt der Stempel stehen. */
  failed: string;
}

/**
 * Wirft nie: ein Schritt, der an kaputten Daten scheitert, hält die Pipeline an, statt die
 * Datei unlesbar zu machen. **Der Stempel bleibt dann VOR ihm** — sonst wäre die Version die
 * Behauptung einer Umstellung, die nie lief, und der Schritt käme nie wieder dran.
 */
export function upgradeCharacter(raw: unknown): CharacterUpgradeResult {
  const empty = { data: {}, fromVersion: CHARACTER_VERSION, toVersion: CHARACTER_VERSION, applied: [], failed: '' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;

  const data = { ...(raw as Record<string, unknown>) };
  const fromVersion = characterVersionOf(data);
  const applied: string[] = [];
  let reached = fromVersion;
  let failed = '';

  for (const step of CHARACTER_UPGRADES) {
    if (step.to <= fromVersion) continue;
    try {
      step.apply(data);
    } catch {
      failed = step.label;
      break;
    }
    applied.push(step.label);
    reached = step.to;
  }
  data._version = failed ? reached : CHARACTER_VERSION;
  return { data, fromVersion, toVersion: CHARACTER_VERSION, applied, failed };
}

export interface PendingCharacterUpgrade {
  fromVersion: number;
  toVersion: number;
  /** Beschreibungen der Schritte, die greifen würden. Leer = nur der Versionsstempel fehlt. */
  applied: string[];
  /** Gesetzt, wenn ein Schritt an der Datei scheitert; sie bleibt dann unter `toVersion`. */
  failed: string;
}

/**
 * Der Vergleich braucht den Schnappschuss VOR dem Upgrade: `upgradeCharacter` kopiert nur
 * flach, seine Schritte mutieren verschachtelte Objekte von `raw` mit — hinterher
 * serialisiert sähen Feld-Umschreibungen identisch aus und die Datei bliebe veraltet.
 */
export function pendingCharacterUpgrade(raw: unknown): PendingCharacterUpgrade | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const before = JSON.stringify(raw);
  const fromVersion = characterVersionOf(raw);
  const result = upgradeCharacter(raw);
  // Ein scheiternder Schritt ändert nichts und wäre ohne diese Meldung unsichtbar.
  if (!result.failed && before === JSON.stringify(result.data)) return null;
  return { fromVersion, toVersion: result.toVersion, applied: result.applied, failed: result.failed };
}

/** Eintritt für `normalizeCharacter`/`parseCharacter`, bevor das Schema greift. */
export function migrateCharacterLegacy(raw: unknown): Record<string, unknown> {
  return upgradeCharacter(raw).data;
}
