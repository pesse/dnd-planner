/**
 * Verdichtet ein deutsches Freitext-Feld des Charakterbogens („Klassenmerkmale &
 * Eigenschaften", „Volksmerkmale") — aus dem bisherigen Feldinhalt, dem vollen
 * Merkmalsbestand und/oder schon verdichteten Notizzeilen.
 *
 * EIN Prompt für alle Aufrufer: die zwei Zusammenfassen-Knöpfe im Charakter-Editor und
 * der Level-Up-Merge (Schritt D). Welches Feld geschrieben wird, sagt `<target_field>`
 * im Input, nicht der Prompt.
 *
 * Die Doktrin — welche Zeile ihren Platz im PDF-Kasten verdient — ist die gemeinsame Quelle
 * mit `featureEffectsAction` (dessen `sheetNote`) und dem Übersetzungs-Call. Sie steht
 * absichtlich nur HIER; sonst optimiert man zwei Fassungen derselben Regel.
 *
 * Bewusst der EINE Call, der DEUTSCH schreibt, obwohl die Merkmals-Strecke sonst durchgehend
 * englisch reasont: sein Haupt-Input ist Prosa des SPIELERS (`<current_text>`), und Regel 1/4
 * verpflichten ihn auf deren Wortlaut und Layout. Ein Umweg über Englisch wäre ein
 * Round-Trip über fremd-autorierten Text. Nur der Merkmals-Rohstoff kommt englisch herein.
 *
 * Tool-frei → `runAiAction` nimmt den Single-Call-Pfad; auf QM/vllm heißt guided decoding
 * zugleich `enable_thinking:false` (llmService), also kein Reasoning-Vorlauf.
 */
import type { AiAction } from './types';
import {
  fieldSummaryJsonSchema,
  parseFieldSummary,
  type FieldSummary,
} from '../../schemas/levelUp';

/**
 * Die gemeinsame Doktrin, in drei Bausteinen — sie hat drei verschiedene Leser:
 *
 *   `SHEET_NOTE_CONTENT`        WAS eine Zeile verdient → dieser Prompt + Merkmals-Deutung
 *   `SHEET_NOTE_EXAMPLE_EN`     derselbe Maßstab englisch → nur die Merkmals-Deutung
 *   `SHEET_NOTE_GERMAN_WORDING` Wortlaut/Abkürzungen → dieser Prompt + Übersetzer
 *   `SHEET_NOTE_GERMAN_ONE_LINE` eine Notiz = eine Zeile → nur der Übersetzer
 *   `SHEET_NOTE_GERMAN_LAYOUT`  mehrere Einträge in einem Feld → nur dieser Prompt
 *                               (`SHEET_NOTE_GERMAN_FORM` = Wortlaut + Layout, sein Aufrufer)
 *
 * Getrennt statt doppelt: sonst optimiert man zwei Fassungen derselben Regel. Jeder Leser
 * bekommt nur seine Bausteine — dieser Prompt schreibt direkt Deutsch und braucht daher
 * Inhalt + deutsche Form, aber nicht das englische Beispiel (das brächte ihn auf Fuß statt
 * Meter).
 *
 * Das Beispiel ist der Maßstab, nicht die Prosa darüber — es hält die Zusammenfassung davon
 * ab, die Mechanik wegzukürzen (Feedback 2026-07-28). Beide Fassungen stammen wörtlich aus
 * der Bibliothek (vault/classes/fighter.json, vault/species/dwarf.json): ein selbst
 * formuliertes Beispiel schleppt sonst 2014er-Begriffe in den Prompt.
 */
export const SHEET_NOTE_CONTENT = `An entry names the feature and says what it does at the table: \`Feature name: effect\`.
WRITE an entry for whatever the player has to remember while playing: an ability they actively use (with its action type and how often it recharges), numbers that live nowhere else (sneak attack dice, rage, ki points, wild shape limits), the ongoing effect of an option they picked, a companion and its stats.
LEAVE OUT pure flavour with no effect at the table, and what the sheet already records elsewhere (granted spells, proficiencies and expertise, ability increases, spell slots, proficiency bonus, hit dice).
DEPTH: complete enough to play from, short enough to scan. One line where one is enough, two or three where dice, action type or recharge need saying. Numbers and keywords over full sentences, no rules quotes, no filler like "You can" — but never cut the mechanic itself to save space.`;

/**
 * Derselbe Maßstab in ENGLISCH, für den Pass, der englisch schreibt (Merkmals-Deutung).
 * Wörtlich aus der Bibliothek (vault/classes/fighter.json, vault/species/dwarf.json), damit
 * kein selbst formulierter Wortlaut hineinkommt. Ohne dieses Beispiel fiel eine Sinnesnotiz
 * („Dunkelsicht 18 m") weg — gemessen 2026-07-29, in allen drei Läufen.
 */
export const SHEET_NOTE_EXAMPLE_EN = `This is the depth that works — a sense with a range DOES earn its line, size and speed do NOT:
Second Wind: bonus action, regain 1d10+fighter level HP. 2 uses; 1 back on a Short Rest, all on a Long Rest.
Action Surge: one extra action (not Magic) once per Short/Long Rest.
Darkvision 120 ft
Dwarven Resilience: Resistance to Poison damage, Advantage on saves against the Poisoned condition.`;

/** Die deutsche Wort-Hälfte: Wortlaut und Abkürzungen. Sie gilt für beide deutschen Leser. */
export const SHEET_NOTE_GERMAN_WORDING = `WORDING: write GERMAN. Take every feature name VERBATIM from the input — those are the current German 5.2.1 names. Never fall back on 2014 wording ("Zweiter Wind", not "Durchschnaufen"; "Aktionsschub", not "Tatendrang"). Abbreviate the recurring terms: TP (Trefferpunkte), RW (Rettungswurf), RK (Rüstungsklasse), SG (Schwierigkeitsgrad), dice as 1W10 — feature names themselves are never abbreviated. Avoid filler like "Du kannst".`;

/**
 * Derselbe Maßstab als EINZEILER — für den Übersetzer der Bogen-Notizen, der je Notiz genau
 * eine Zeile liefert. Er darf die Layout-Vorlage unten NICHT sehen: Namen auf eigener Zeile,
 * Leerzeilen und Abschnitts-Überschriften sind dort das Gegenteil seiner Regel 4 (gemessen
 * 2026-07-29: Notizen bis 195 Zeichen gegen ein hartes Budget von 160). Beide Beispielzeilen
 * stammen wörtlich aus der Bibliothek und liegen selbst unter dem Budget; die Dunkelsicht-Zeile
 * bleibt bewusst weg — sie würde eine konkurrierende Reichweite vorgeben.
 */
export const SHEET_NOTE_GERMAN_ONE_LINE = `Each note is ONE line, and this is the depth that works:
Zweiter Wind: Bonusaktion, stellt 1W10+Kämpferstufe TP wieder her. 2 Anwendungen; 1 zurück nach Kurzer Rast, alle nach Langer Rast.
Zwergische Widerstandskraft: Resistenz gegen Giftschaden, Vorteil auf RW gegen den Zustand Vergiftet.`;

/**
 * Die Layout-Hälfte: mehrere Einträge in EINEM Feld. Nur `FIELD_SUMMARY_SYSTEM` liest sie —
 * es schreibt das ganze Freitext-Feld, der Übersetzer nur einzelne Zeilen.
 */
export const SHEET_NOTE_GERMAN_LAYOUT = `This is the depth and shape that works (name on its own line where the description needs one, blank line between entries):
[Klassenmerkmale]
Zweiter Wind:
Bonusaktion, stellt 1W10+Kämpferstufe TP wieder her. 2 Anwendungen; 1 zurück nach Kurzer Rast, alle nach Langer Rast.

Kampfstil: Bogenschießen (+2 auf Angriffswürfe mit Fernkampfwaffen)

Aktionsschub:
Einmal pro Kurzer/Langer Rast eine zusätzliche Aktion (nicht die Aktion Magie).

[Volksmerkmale]
Dunkelsicht 36 m

Zwergische Widerstandskraft:
Resistenz gegen Giftschaden, Vorteil auf RW gegen den Zustand Vergiftet.`;

/** Wortlaut + Layout zusammen — für den einen Leser, der ein ganzes Feld schreibt. */
export const SHEET_NOTE_GERMAN_FORM = `${SHEET_NOTE_GERMAN_WORDING}
${SHEET_NOTE_GERMAN_LAYOUT}`;

const FIELD_SUMMARY_SYSTEM =`You are a rules assistant for Dungeons & Dragons 5e (SRD 5.2 / German 5.2.1 terminology).
You rewrite ONE German free-text field of a character sheet, so the player can play from it. <target_field> says which field it is and what belongs in it. Return its FULL new text.

## Input (only <current_text> is always there)
- <current_text>: the field today, written BY THE PLAYER.
- <all_features>: the character's features. "nameDe" is the name to WRITE — the current German 5.2.1 wording, never translate or replace it. "name" and "desc" are the source, usually English. "source"/"group" say where each comes from, "choice" an option already picked. Raw material to boil down.
- <new_notes>: already-condensed entries that must end up in the field; keep their wording.
- <other_fields>: what OTHER fields of the same sheet already say.
- <chosen_subclass>.

## Rules
1. Keep what the player wrote. Feature entries you may reword freely, but no piece of information from the input disappears — least of all notes of their own (a companion, equipment reminders, table rulings) that have nothing to do with features.
2. One entry per feature, in the depth the doctrine below describes. Where <current_text> already has it in the player's words, merge both into that entry (keep the more precise wording).
3. Only what belongs in this field — never what <other_fields> already records, and never what <target_field>'s "omit" names: the sheet has its own form fields for those, so repeating them here wastes the space and can contradict them.
4. Follow the layout of <current_text> — bullets stay bullets, headings stay headings. If the field is empty, follow the doctrine's example.
5. Invent nothing, and skip values the sheet computes anyway (spell slots, proficiency bonus, hit dice).
6. GERMAN only, in the single field "text". No commentary, no markdown fences.

## What belongs on the sheet
${SHEET_NOTE_CONTENT}
${SHEET_NOTE_GERMAN_FORM}`;

/** Ein Zielfeld des Bogens: deutsches Label, Zuständigkeit, feldeigene Dubletten. */
export interface SheetFieldTarget {
  label: string;
  /** Englisch — geht als Zuständigkeits-Beschreibung ins Modell. */
  belongs: string;
  /**
   * Was der Bogen für DIESES Feld schon in eigenen Formularfeldern führt. Getrennt je
   * Feld statt zwei Prompts: die Aufgabe ist dieselbe, nur die Dubletten unterscheiden sich.
   * Jeder Begriff mit seinem deutschen Wortlaut in Klammern — das Modell schreibt Deutsch
   * und erkennt die Dublette sonst nicht wieder.
   */
  omit: string;
}

/**
 * Die verdichtbaren Freitext-Felder. Der Schnitt ist bewusst disjunkt: jedes Merkmal
 * gehört in genau ein Feld, sonst steht dieselbe Zeile zweimal im PDF.
 */
export const SHEET_FIELDS = {
  classFeatures: {
    label: 'Klassenmerkmale & Eigenschaften',
    belongs:
      'class and subclass features, feats and background features — everything EXCEPT species (ancestry) traits',
    omit:
      'hit dice ("Trefferwürfel"), proficiency bonus ("Übungsbonus"), ANY proficiency the feature grants ' +
      '("Geübt in …": Rettungswürfe, Fertigkeiten, Werkzeuge, Einfache Waffen, Kriegswaffen, Leichte/' +
      'Mittelschwere/Schwere Rüstung, Schilde), expertise ("Expertise"), spell slots ("Zauberplätze") and ' +
      'the spell list ("Zauberliste") — the sheet has its own fields and blocks for all of these',
  },
  speciesTraits: {
    label: 'Volksmerkmale',
    belongs: 'species and subspecies traits only — no class features, no feats',
    // Genau die Dubletten, die der Nutzer im Feld gefunden hat (Größe, Bewegungsrate …).
    omit:
      'size category ("Größe"), height and weight ("Körpergrösse", "Gewicht"), the walking speed ' +
      '("Bewegungsrate"), age or lifespan ("Alter"), creature type ("Kreaturentyp"), known languages ' +
      '("Sprachen"), ability score bonuses ("Attributswerte") and ANY proficiency the trait grants ' +
      '("Geübt in …") — the sheet has dedicated fields and blocks for all of these. A movement mode the ' +
      'speed field cannot express ("Fliegen", "Schwimmen", "Klettern") DOES belong here, and so do senses ' +
      '("Dunkelsicht") and resistances ("Resistenz")',
  },
} as const satisfies Record<string, SheetFieldTarget>;

/**
 * Ein Merkmal als Rohstoff für die Verdichtung. Regeltext ENGLISCH (eine Aufbereitung für
 * alle Merkmals-Jobs), Anzeigename deutsch — dieser Call schreibt Deutsch und braucht den
 * 5.2.1-Wortlaut, den er nicht erfinden soll.
 */
export interface SummaryFeature {
  name: string;
  /** Deutscher Anzeigename aus der Bibliothek; Fallback = `name`. */
  nameDe?: string;
  desc: string;
  /** Entscheidet über die Feld-Zuständigkeit (siehe SHEET_FIELDS). */
  source: 'class' | 'species' | 'background' | 'feat';
  /** Herkunftsgruppe wie im Editor angezeigt („Waldläufer 5", „Kreis des Mondes", „Zwerg"). */
  group?: string;
  /** Stufe, auf der es erlangt wurde — nur gesetzt, wo bekannt. */
  gainedAt?: number;
  /** Getroffene Wahl (z.B. Kampfstil) — trägt die Doktrin-Regel „ongoing mechanic". */
  choice?: string;
}

export function buildFieldSummaryAction(): AiAction<FieldSummary> {
  return {
    id: 'sheet-field-summary',
    label: 'Bogen-Feld zusammenfassen',
    anthropicTools: [],
    openAiTools: [],
    execute: async () => '',
    jsonSchema: fieldSummaryJsonSchema,
    validate: (d): d is FieldSummary => parseFieldSummary(d) !== null,
    buildSystemPrompt: () => FIELD_SUMMARY_SYSTEM,
  };
}

/** userInput: XML-gegliedert, JSON-Inhalt. Leere Sektionen bleiben weg. */
export function buildFieldSummaryInput(ctx: {
  target: SheetFieldTarget;
  currentText: string;
  features?: SummaryFeature[];
  newNotes?: string[];
  otherFields?: { label: string; text: string }[];
  chosenSubclass?: { key: string; name: string } | null;
}): string {
  const others = (ctx.otherFields ?? []).filter((f) => f.text.trim());
  return [
    `<target_field>${JSON.stringify({ field: ctx.target.label, belongs: ctx.target.belongs, omit: ctx.target.omit })}</target_field>`,
    `<current_text>${ctx.currentText}</current_text>`,
    ...(ctx.features?.length ? [`<all_features>${JSON.stringify(ctx.features)}</all_features>`] : []),
    ...(ctx.newNotes?.length ? [`<new_notes>${JSON.stringify(ctx.newNotes)}</new_notes>`] : []),
    ...(others.length ? [`<other_fields>${JSON.stringify(others)}</other_fields>`] : []),
    ...(ctx.chosenSubclass ? [`<chosen_subclass>${JSON.stringify(ctx.chosenSubclass)}</chosen_subclass>`] : []),
  ].join('\n');
}
