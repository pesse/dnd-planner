/**
 * Fixture: Gnom-Zauberer, Hintergrund „Weiser", Stufe 1 (Charakter-Erstell-Wizard).
 * Der Fall trifft, was die Wizard-Analyse von der Stufenaufstiegs-Analyse unterscheidet:
 *  1. Die erzwungene Wahl steckt in einem SPEZIES-Merkmal („Gnomische Abstammung") und
 *     bestimmt die gewährten Zauber — die Analyse muss blockieren, nicht schon erden.
 *  2. Das Herkunftstalent („Eingeweihter der Magie") ist flow-eigen (`grantsChoice:
 *     spellAccess`) und steht NICHT im KI-Eingang; jede Wahl dazu wäre erfunden.
 *  3. Das Klassen-Zauberwirken ist ebenfalls flow-eigen, der Kontext sagt aber
 *     `casterType: FULL` — daraus darf keine Zaubertrick-Wahl entstehen.
 *
 * Der Eingang entsteht über den ECHTEN Wizard-Pfad (`buildFeaturePrep` → Vault), damit die
 * Fixture nicht von der Wirklichkeit abdriftet; Vault-Reads laufen über den fs-Shim.
 */
import type { FeatureEffectsContext } from '../../src/lib/services/aiActions/featureEffectsAction';
import { buildFeaturePrep } from '../../src/lib/services/wizard/featurePrep';

export const GNOME_SORCERER_BASICS = {
  species: { sourceKey: 'srd-2024_gnome', name: 'Gnom' },
  klass: { sourceKey: 'srd-2024_sorcerer', name: 'Zauberer' },
  background: { sourceKey: 'srd-2024_sage', name: 'Weiser' },
} as const;

/** Die Wahl-tragende Volks-Abstammung. */
export const LINEAGE_KEY = 'srd-2024_gnome_gnomish-lineage';
/** Flow-eigen: eine Wahl oder ein Rider mit diesem Key wäre frei erfunden. */
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

/** Flow-eigen (`grantsChoice: spellcasting`): eine Wahl mit diesem Key wäre erfunden. */
export const SORCERER_SPELLCASTING_KEY = 'srd-2024_sorcerer_spellcasting';

/** Alle Keys des Eingangs — `choice.featureKey` darf nichts anderes tragen. */
export const ALL_FEATURE_KEYS: string[] = [LINEAGE_KEY, ...NO_CHOICE_KEYS];

/** Keys, die der Flow selbst führt und die deshalb NICHT im KI-Eingang stehen. */
export const FLOW_OWNED_KEYS: string[] = [MAGIC_INITIATE_KEY, SORCERER_SPELLCASTING_KEY];

/**
 * Rider-Namen von Call C in der Reihenfolge des Eingangs (Klassen-, dann Speziesmerkmale).
 * ENGLISCH, weil die Merkmals-Deutung einsprachig ist und `featureName` den Eingangsnamen
 * wörtlich zurückgibt; der deutsche Name entsteht später aus `featureKey` + Bibliothek.
 */
export const EXPECTED_RIDER_NAMES: string[] = [
  'Innate Sorcery',
  'Darkvision',
  'Gnomish Cunning',
  'Gnomish Lineage',
];

/**
 * Erwartung an die Abstammungs-Wahl: die Optionen WORTGLEICH so, wie der englische
 * Merkmalstext sie fett setzt (`**Forest Gnome.**`) — das ist der kanonische Wert, der
 * gespeichert wird und zur KI zurückgeht. Eine Umschreibung ist ein Fehlschlag, kein Stil.
 */
export const LINEAGE_OPTIONS = ['Forest Gnome', 'Rock Gnome'] as const;

/** Wie `descDe` sie setzt — das muss der Übersetzungs-Call ZITIEREN, nicht übersetzen. */
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

/**
 * Erwartung an das Herkunftstalent: Der Vault führt „Magic Initiate" generisch („Cleric,
 * Druid, or Wizard") als `grantsChoice.spellLists`, der Hintergrund „Weiser" legt es in
 * seinen `benefits` auf die Magierliste fest. `spellAccessOffer` verengt die Deklaration
 * damit auf EINEN Wert — geprüft in `tests/integration/spellAccess.test.ts`.
 */
export const MAGIC_INITIATE_LIST = 'wizard';

/** ENGLISCH aus `benefits[].desc` — das deutsche „Magier" wäre die Zauberer/Magier-Kollision. */
export const MAGIC_INITIATE_CHOICE = 'Wizard';

export const MAGIC_INITIATE_CANTRIPS = 2;
export const MAGIC_INITIATE_LEVEL1 = 1;

/**
 * Wie `CharacterWizard.kickoff()`: Klassen- und Speziesmerkmale in einem Rutsch und OHNE die
 * flow-eigenen (`analysisGained`, nicht `gained`). Eine Handabschrift würde genau diese
 * Filterung stumm verpassen — deshalb der echte Wizard-Pfad.
 */
export async function loadGnomeSorcererContext(): Promise<FeatureEffectsContext> {
  const prep = await buildFeaturePrep(GNOME_SORCERER_BASICS);
  return {
    classContext: prep.classContext,
    features: [...prep.analysisGained, ...prep.analysisSpeciesFeatures],
    pastChoices: [],
  };
}
