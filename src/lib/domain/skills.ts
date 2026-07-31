/**
 * Die 18 Fertigkeiten des Bogens und die eine Übersetzungstabelle zwischen
 * Bibliothek (englisch) und Charakter (deutsche Bogen-Schlüssel). `mod()` steht
 * dabei: es ist die Rechnung, die aus einem Attribut einen Fertigkeitswert macht.
 *
 * Lag in `pdf/characterFields.ts` — der PDF-Rand ist ein Leser dieser Tabelle,
 * nicht ihr Besitzer.
 */
import type { AbilityKey } from '$lib/schemas/abilities';
import type { SkillName } from '$lib/schemas/vocabulary';

/**
 * `key` ist der DEUTSCHE Bogen-Schlüssel (`character.skills[key]`, vom
 * PDF-Formular diktiert), `en` der englische SRD-Name.
 */
export interface SkillDef {
  key: string;
  en: SkillName;
  label: string;
  attr: AbilityKey;
  profField: string;
  expField: string;
  valField: string;
}

export const SKILL_DEFS = [
  { key: 'Akrobatik',         en: 'Acrobatics',      label: 'Akrobatik',          attr: 'ges', profField: 'AkrobatikProf',         expField: 'AkrobatikExp',         valField: 'AkrobatikGes' },
  { key: 'ArkaneKunde',       en: 'Arcana',          label: 'Arkane Kunde',       attr: 'int', profField: 'ArkaneKundeProf',        expField: 'ArkaneKundeExp',        valField: 'ArkaneKundeInt' },
  { key: 'Athletik',          en: 'Athletics',       label: 'Athletik',           attr: 'str', profField: 'AthletikProf',           expField: 'AthletikExp',           valField: 'AthletikStr' },
  { key: 'Auftreten',         en: 'Performance',     label: 'Auftreten',          attr: 'cha', profField: 'AuftretenProf',          expField: 'AuftretenExp',          valField: 'AuftretenCha' },
  { key: 'Einschüchtern',     en: 'Intimidation',    label: 'Einschüchtern',      attr: 'cha', profField: 'EinschüchternProf',      expField: 'EinschüchternExp',      valField: 'EinschüchternCha' },
  { key: 'Fingerfertigkeit',  en: 'Sleight of Hand', label: 'Fingerfertigkeit',   attr: 'ges', profField: 'FingerfertigkeitProf',   expField: 'FingerfertigkeitExp',   valField: 'FingerfertigkeitGes' },
  { key: 'Geschichte',        en: 'History',         label: 'Geschichte',         attr: 'int', profField: 'GeschichteProf',         expField: 'GeschichteExp',         valField: 'GeschichteInt' },
  { key: 'Heilkunde',         en: 'Medicine',        label: 'Heilkunde',          attr: 'wei', profField: 'HeilkundeProf',          expField: 'HeilkundeExp',          valField: 'HeilkundeWei' },
  { key: 'Heimlichkeit',      en: 'Stealth',         label: 'Heimlichkeit',       attr: 'ges', profField: 'HeimlichkeitProf',       expField: 'HeimlichkeitExp',       valField: 'HeimlichkeitGes' },
  { key: 'MitTierenUmgehen',  en: 'Animal Handling', label: 'Mit Tieren umgehen', attr: 'wei', profField: 'MitTierenUmgehenProf',   expField: 'MitTierenUmgehenExp',   valField: 'MitTierenUmgehenWei' },
  { key: 'MotivErkennen',     en: 'Insight',         label: 'Motiv erkennen',     attr: 'wei', profField: 'MotivErkennenProf',      expField: 'MotivErkennenExp',      valField: 'MotivErkennenWei' },
  { key: 'Nachforschungen',   en: 'Investigation',   label: 'Nachforschungen',    attr: 'int', profField: 'NachforschungenProf',    expField: 'NachforschungenExp',    valField: 'NachforschungenInt' },
  { key: 'Naturkunde',        en: 'Nature',          label: 'Naturkunde',         attr: 'int', profField: 'NaturkundeProf',         expField: 'NaturkundeExp',         valField: 'NaturkundeInt' },
  { key: 'Religion',          en: 'Religion',        label: 'Religion',           attr: 'int', profField: 'ReligionProf',           expField: 'ReligionExp',           valField: 'ReligionInt' },
  { key: 'Täuschen',          en: 'Deception',       label: 'Täuschen',           attr: 'cha', profField: 'TäuschenProf',           expField: 'TäuschenExp',           valField: 'TäuschenCha' },
  { key: 'Überlebenskunst',   en: 'Survival',        label: 'Überlebenskunst',    attr: 'wei', profField: 'ÜberlebenskunstProf',    expField: 'ÜberlebenskunstExp',    valField: 'ÜberlebenskunstWei' },
  { key: 'Überzeugen',        en: 'Persuasion',      label: 'Überzeugen',         attr: 'cha', profField: 'ÜberzeugenProf',         expField: 'ÜberzeugenExp',         valField: 'ÜberzeugenCha' },
  { key: 'Wahrnehmung',       en: 'Perception',      label: 'Wahrnehmung',        attr: 'wei', profField: 'WahrnehmungProf',        expField: 'WahrnehmungExp',        valField: 'WahrnehmungWei' },
] as const satisfies readonly SkillDef[];

// Vollständigkeit ist compilergeprüft: fehlt eine der 18 Fertigkeiten (oder ist eine
// falsch geschrieben), ist `MissingSkill` nicht `never` und die Zuweisung schlägt fehl.
type MissingSkill = Exclude<SkillName, (typeof SKILL_DEFS)[number]['en']>;
const _skillDefsComplete: MissingSkill extends never ? true : MissingSkill = true;
void _skillDefsComplete;

const SHEET_KEY_BY_EN = new Map<SkillName, string>(SKILL_DEFS.map((d) => [d.en, d.key]));
const EN_BY_SHEET_KEY = new Map<string, SkillName>(SKILL_DEFS.map((d) => [d.key, d.en]));

/** `Acrobatics` → `Akrobatik`: die eine Richtung, in der Bibliotheks-Mechanik auf dem Bogen landet. */
export const skillSheetKey = (en: SkillName): string => SHEET_KEY_BY_EN.get(en) ?? en;

/** Umkehrung; `undefined` bei einem Fremdschlüssel. */
export const skillEnName = (sheetKey: string): SkillName | undefined => EN_BY_SHEET_KEY.get(sheetKey);

export function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}
