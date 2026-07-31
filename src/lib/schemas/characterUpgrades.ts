/**
 * Die versionierte Upgrade-Pipeline der Charakterdateien.
 */
import { migrateSourceKey } from './source';
import { parseClassLevelText } from './classLevelText';

//
// Charaktere liegen als Dateien im Vault und überleben jede Programmversion.
// Damit Schema-Änderungen einen definierten Ort haben, ist die Migration eine
// GEORDNETE PIPELINE statt einer Sammlung von Ad-hoc-Reparaturen: jeder Schritt
// trägt seine Zielversion, eine deutsche Beschreibung fürs Protokoll und eine
// idempotente `apply`-Funktion. Beim Laden laufen alle Schritte, deren
// Zielversion über der gespeicherten liegt; danach wird `_version` gestempelt.
//
// Zwei Regeln für neue Schritte:
//   1. `CHARACTER_VERSION` erhöhen und GENAU EINEN Schritt mit dieser `to` ergänzen.
//   2. `apply` muss idempotent und inhaltlich abgesichert sein — Altbestand trägt
//      oft keine oder eine zu niedrige `_version`, obwohl die Umstellung schon
//      passiert ist (früher lief die Migration ohne Versionsstempel).
//
// In die DATEI geschrieben wird das Upgrade nicht automatisch, sondern als sichtbare
// Aktion pro Charakter: der Bearbeiten-Modus zeigt einen Hinweis, sobald
// `pendingCharacterUpgrade` etwas meldet.

/** Aktuelle Charakter-Schemaversion. Bei jeder Formatänderung erhöhen. */
export const CHARACTER_VERSION = 6;

export interface CharacterUpgrade {
  /** Version, die dieser Schritt herstellt. */
  to: number;
  /** Deutsche Kurzbeschreibung — erscheint im Upgrade-Protokoll. */
  label: string;
  apply: (c: Record<string, unknown>) => void;
}

export const CHARACTER_UPGRADES: CharacterUpgrade[] = [
  {
    to: 2,
    label: 'Freitext-Klasse → strukturierte Klassen-Einträge',
    apply: (c) => {
      // Best-effort: „Kämpfer 5 / Zauberer 2" → classes[]. Nur wenn noch keine
      // gepflegt sind, damit bereits umgestellte Charaktere unberührt bleiben.
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
      // Legacy-Freitexte → strukturierte Links. `sourceKey` bleibt leer, bis der
      // Bibliotheks-Picker im Editor greift; der Name ist der bisherige Freitext.
      const sp = c.species as { sourceKey?: string; name?: string } | undefined;
      const hasSpecies = sp && typeof sp === 'object' && ((sp.sourceKey ?? '').trim() || (sp.name ?? '').trim());
      if (!hasSpecies && typeof c.race === 'string' && c.race.trim())
        c.species = { sourceKey: '', name: c.race.trim() };

      const bg = c.backgroundRef as { sourceKey?: string; name?: string } | undefined;
      const hasBackground = bg && typeof bg === 'object' && ((bg.sourceKey ?? '').trim() || (bg.name ?? '').trim());
      if (!hasBackground && typeof c.background === 'string' && c.background.trim())
        c.backgroundRef = { sourceKey: '', name: c.background.trim() };

      // Bibliotheks-Links auf das aktuelle Key-Präfix ziehen ("homebrew_" → "homebrew-sam_").
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
      // Inhaltlich abgesichert und verlustfrei: was schon in `features` steht (Umstellung
      // bereits gelaufen, `_version` aber zu niedrig), bleibt und wird nicht dupliziert.
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
      // Idempotent + inhaltlich abgesichert: nur noch-Strings wandeln; bereits migrierte
      // {name,…}-Objekte bleiben unangetastet (Legacy-Dateien ohne/mit zu niedrigem _version).
      // Keys werden NICHT erfunden — sourceKey bleibt leer und löst zur Laufzeit über den Namen auf.
      sp.cantrips = (sp.cantrips as unknown[]).map((x) => (typeof x === 'string' ? { name: x } : x));
    },
  },
  {
    to: 6,
    label: 'Merkmals-Wahl: deutsches Label nach choiceDe',
    apply: (c) => {
      // `choice` führt ab jetzt das englische Label; das bisherige deutsche wandert in die
      // Anzeige-Fassung. `choice` bleibt dabei STEHEN: es ist an sechs Stellen der
      // Diskriminator „Wahl-Eintrag vs. Talent-Link", und leeren würde diese Aufteilung
      // still umwerfen. Inhaltlich abgesichert über das leere `choiceDe`.
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

/**
 * Gespeicherte Version eines rohen Charakters. Ohne `_version` gilt 1 — so waren
 * die Dateien, bevor es das Feld gab.
 */
export function characterVersionOf(raw: unknown): number {
  const v = (raw as { _version?: unknown } | null)?._version;
  return typeof v === 'number' && v >= 1 ? Math.floor(v) : 1;
}

export interface CharacterUpgradeResult {
  data: Record<string, unknown>;
  fromVersion: number;
  toVersion: number;
  /** Beschreibungen der angewandten Schritte, in Reihenfolge. */
  applied: string[];
}

/**
 * Zieht einen rohen Charakter auf `CHARACTER_VERSION` und protokolliert, was
 * angewandt wurde. Wirft nie; ein Schritt, der an kaputten Daten scheitert, wird
 * übersprungen, damit ein einzelnes Feld nicht die ganze Datei unlesbar macht.
 */
export function upgradeCharacter(raw: unknown): CharacterUpgradeResult {
  const empty = { data: {}, fromVersion: CHARACTER_VERSION, toVersion: CHARACTER_VERSION, applied: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;

  const data = { ...(raw as Record<string, unknown>) };
  const fromVersion = characterVersionOf(data);
  const applied: string[] = [];

  for (const step of CHARACTER_UPGRADES) {
    if (step.to <= fromVersion) continue;
    try {
      step.apply(data);
      applied.push(step.label);
    } catch {
      /* Einzelschritt übersprungen — der Rest der Datei bleibt nutzbar. */
    }
  }
  data._version = CHARACTER_VERSION;
  return { data, fromVersion, toVersion: CHARACTER_VERSION, applied };
}

export interface PendingCharacterUpgrade {
  fromVersion: number;
  toVersion: number;
  /** Beschreibungen der Schritte, die greifen würden. Leer = nur der Versionsstempel fehlt. */
  applied: string[];
}

/**
 * Würde ein Upgrade dieser DATEI etwas ändern? `null` = nein, sie ist aktuell.
 *
 * Der Vergleich läuft über einen Schnappschuss VOR dem Upgrade: `upgradeCharacter`
 * kopiert nur flach, seine Schritte mutieren verschachtelte Objekte von `raw` mit —
 * hinterher serialisiert, sähen reine Feld-Umschreibungen (Schritt 3 auf
 * `species.sourceKey`) identisch aus und die Datei bliebe still veraltet.
 */
export function pendingCharacterUpgrade(raw: unknown): PendingCharacterUpgrade | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const before = JSON.stringify(raw);
  const fromVersion = characterVersionOf(raw);
  const result = upgradeCharacter(raw);
  if (before === JSON.stringify(result.data)) return null;
  return { fromVersion, toVersion: result.toVersion, applied: result.applied };
}

/**
 * Migriert Altformat-Felder, bevor das Schema greift (Eintritt für
 * `normalizeCharacter`/`parseCharacter`). Idempotent — dünne Hülle um
 * `upgradeCharacter`.
 */
export function migrateCharacterLegacy(raw: unknown): Record<string, unknown> {
  return upgradeCharacter(raw).data;
}
