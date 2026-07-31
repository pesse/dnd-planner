/**
 * Fixture: Gnom-Zauberer mit Hintergrund „Weiser" auf Stufe 1 (Charakter-Erstell-Wizard).
 *
 * Warum dieser Fall: er trifft genau die drei Dinge, die die Wizard-Merkmalsanalyse von der
 * Stufenaufstiegs-Analyse unterscheidet.
 *  1. Die erzwungene Wahl steckt in einem SPEZIES-Merkmal („Gnomische Abstammung":
 *     Waldgnom vs. Felsgnom) — und sie bestimmt, welche Zauber gewährt werden. Die Analyse
 *     muss also blockieren und darf noch keinen Zauber erden.
 *  2. Das Herkunftstalent des Hintergrunds („Eingeweihter der Magie") ist FLOW-EIGEN: es deklariert
 *     seinen Zauber-Zugang (`grantsChoice.kind === "spellAccess"`), also fragt der Wizard
 *     Liste, Attribut und Kontingent deterministisch ab und das Talent steht NICHT im
 *     KI-Eingang. Damit ist es hier die zweite Negativprobe — jede Wahl dazu wäre erfunden.
 *  3. Fünf der sieben Merkmale tragen gar keine Wahl (Angeborene Zauberei, Größe,
 *     Bewegungsrate, Dunkelsicht, Gnomische Gerissenheit). Sie sind die Negativprobe.
 *
 * Dazu kommt eine Falle: das Klassen-Zauberwirken des Zauberers (vier Zaubertricks,
 * vorbereitete Zauber) ist flow-eigen (`grantsChoice: spellcasting`) und deshalb NICHT im
 * Eingang. Der Klassen-Kontext sagt aber `casterType: FULL` — die Analyse darf daraus keine
 * Zaubertrick-Wahl erfinden.
 *
 * WICHTIG — kein Drift zur Realität: der Eingang entsteht über den ECHTEN Wizard-Pfad
 * (`buildFeaturePrep` → Vault-Bibliotheken), exakt wie `CharacterWizard.kickoff()` ihn für
 * `analyzeFeatureEffects` baut. Vault-Reads laufen im Node-Eval über den fs-Shim
 * (tests/support/tauriInvokeShim.ts).
 */
import type { FeatureEffectsContext } from '../../src/lib/services/aiActions/featureEffectsAction';
import { buildFeaturePrep } from '../../src/lib/services/wizard/featurePrep';

/** Die Grundwahl aus Schritt 1 des Wizards (Bibliotheks-Keys wie in der Sidebar). */
export const GNOME_SORCERER_BASICS = {
  species: { sourceKey: 'srd-2024_gnome', name: 'Gnom' },
  klass: { sourceKey: 'srd-2024_sorcerer', name: 'Zauberer' },
  background: { sourceKey: 'srd-2024_sage', name: 'Weiser' },
} as const;

// ── Merkmals-Keys (Anker der Assertions) ────────────────────────────────────────
/** Die Wahl-tragende Volks-Abstammung. */
export const LINEAGE_KEY = 'srd-2024_gnome_gnomish-lineage';
/**
 * Das Herkunftstalent des Weisen — deklariert seinen Zauber-Zugang und ist damit flow-eigen.
 * Anker der Negativprobe: eine Wahl oder ein Rider mit diesem Key wäre frei erfunden.
 */
export const MAGIC_INITIATE_KEY = 'srd-2024_magic-initiate';

/** Merkmale, die KEINE Wahl erzwingen — jede Frage zu ihnen ist erfunden. */
export const NO_CHOICE_KEYS = [
  'srd-2024_sorcerer_innate-sorcery',
  'srd-2024_gnome_darkvision',
  'srd-2024_gnome_gnomish-cunning',
] as const;

/**
 * Reine Bogenwerte (`sheetValue`) — stehen NICHT im Eingang, seit Größe und Bewegungsrate
 * deterministisch aus dem Merkmal gelesen werden. Ein Rider dazu wäre erfunden.
 */
export const SHEET_VALUE_KEYS: string[] = ['srd-2024_gnome_size', 'srd-2024_gnome_speed'];

/**
 * Das flow-eigene Klassen-Zauberwirken (`grantsChoice: spellcasting`) — steht NICHT im
 * Eingang. Anker der Negativprobe: eine Wahl mit diesem Key wäre frei erfunden.
 */
export const SORCERER_SPELLCASTING_KEY = 'srd-2024_sorcerer_spellcasting';

/** Alle Keys des Eingangs — `choice.featureKey` darf nichts anderes tragen. */
export const ALL_FEATURE_KEYS: string[] = [LINEAGE_KEY, ...NO_CHOICE_KEYS];

/** Keys, die der Flow selbst führt und die deshalb NICHT im KI-Eingang stehen. */
export const FLOW_OWNED_KEYS: string[] = [MAGIC_INITIATE_KEY, SORCERER_SPELLCASTING_KEY];

/**
 * Erwartete Rider-Namen von Call C, in der Reihenfolge des Eingangs
 * (`analysisGained` = Klassenmerkmale ohne die flow-eigenen, dann `analysisSpeciesFeatures`
 * = Speziesmerkmale ohne die reinen Bogenwerte).
 *
 * ENGLISCH: die Merkmals-Deutung ist einsprachig, `featureName` gibt den Eingangsnamen
 * wörtlich zurück. Der deutsche Anzeigename entsteht später aus `featureKey` + Bibliothek.
 */
export const EXPECTED_RIDER_NAMES: string[] = [
  'Innate Sorcery',
  'Darkvision',
  'Gnomish Cunning',
  'Gnomish Lineage',
];

// ── Erwartungen an die Abstammungs-Wahl ─────────────────────────────────────────
/**
 * Die beiden Optionen, WORTGLEICH wie der englische Merkmalstext sie fett setzt
 * (`**Forest Gnome.**`) — das ist der kanonische Wert, der gespeichert wird und zur KI
 * zurückgeht. Umschreibungen sind ein Fehlschlag, kein Stilproblem.
 */
export const LINEAGE_OPTIONS = ['Forest Gnome', 'Rock Gnome'] as const;

/**
 * Dieselben Optionen, wie `descDe` sie setzt (`**Waldgnom.**`) — das ist, was der
 * Übersetzungs-Call als ZITAT liefern muss, nicht als eigene Übersetzung.
 */
export const LINEAGE_OPTIONS_DE = ['Waldgnom', 'Felsgnom'] as const;

/** Die im Eval gewählte Abstammung (Call C) — Wert und Anzeige. */
export const CHOSEN_LINEAGE = 'Forest Gnome';
export const CHOSEN_LINEAGE_DE = 'Waldgnom';

/** Was Waldgnom gewährt — englische Bibliotheksnamen und ihre deutschen Pendants. */
export const FOREST_GNOME_SPELLS = ['Minor Illusion', 'Speak with Animals'] as const;
export const FOREST_GNOME_SPELLS_DE = ['Einfache Illusion', 'Mit Tieren sprechen'] as const;

/** Der NICHT gewählte Zweig — nach der Wahl darf davon nichts mehr auftauchen. */
export const ROCK_GNOME_SPELLS = ['Mending', 'Prestidigitation'] as const;
export const ROCK_GNOME_SPELLS_DE = ['Ausbessern', 'Taschenspielerei'] as const;

// ── Erwartungen an das Herkunftstalent (jetzt deterministisch) ───────────────────
/**
 * Die Zauberliste des Talents: Der Vault führt „Magic Initiate" in seiner GENERISCHEN Fassung
 * („Cleric, Druid, or Wizard") und deklariert sie als `grantsChoice.spellLists`; der
 * Hintergrund „Weiser" legt sie in seinen `benefits` auf die Magierliste fest. `spellAccessOffer`
 * verengt die Deklaration damit auf EINEN Wert — geprüft in `tests/integration/spellAccess.test.ts`.
 */
export const MAGIC_INITIATE_LIST = 'wizard';

/**
 * Die vom Hintergrund gesetzte Spezialisierung, wie sie am Merkmal ankommt — ENGLISCH aus
 * `benefits[].desc`. Das deutsche „Magier" wäre genau die Zauberer/Magier-Kollision.
 */
export const MAGIC_INITIATE_CHOICE = 'Wizard';

/** Anzahl der Zaubertricks bzw. Grad-1-Zauber, die das Talent wählen lässt. */
export const MAGIC_INITIATE_CANTRIPS = 2;
export const MAGIC_INITIATE_LEVEL1 = 1;

/**
 * Baut den Analyse-Eingang genau so, wie `CharacterWizard.kickoff()` es tut: Klassen- und
 * Speziesmerkmale in einem Rutsch, ohne frühere Wahlen — und OHNE die flow-eigenen Merkmale
 * (`analysisGained`, nicht `gained`). Genau das ist der Grund, weshalb der Eingang über den
 * echten Wizard-Pfad entsteht: eine Handabschrift würde diese Filterung stumm verpassen.
 */
export async function loadGnomeSorcererContext(): Promise<FeatureEffectsContext> {
  const prep = await buildFeaturePrep(GNOME_SORCERER_BASICS);
  return {
    classContext: prep.classContext,
    features: [...prep.analysisGained, ...prep.analysisSpeciesFeatures],
    pastChoices: [],
  };
}
