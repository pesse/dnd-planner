/**
 * Sprachen und persönliche Angaben aus dem Wizard. Sprachen sind deutscher Freitext (keine
 * Übung, kein Vokabular) — die Listen sind die Tabellen „Standardsprachen“/„Seltene Sprachen“/„Gesinnung“ des SRD.
 */
import type { Character } from '$lib/schemas/characterSchema';

export const COMMON_LANGUAGE = 'Gemeinsprache';
export const STANDARD_LANGUAGE_PICKS = 2;

export const STANDARD_LANGUAGES = [
  'Drakonisch', 'Elfisch', 'Gebärden-Gemeinsprache', 'Gnomisch', 'Goblinisch',
  'Halblingisch', 'Orkisch', 'Riesisch', 'Zwergisch',
] as const;

/** Regulär nur über Merkmale erlernbar; im Wizard als Ausnahme nach Absprache mit der SL. */
export const RARE_LANGUAGES = [
  'Abyssisch', 'Celestisch', 'Diebessprache', 'Druidisch', 'Gemeinsprache der Unterreiche',
  'Infernalisch', 'Sylvanisch', 'Tiefensprache', 'Urtümlich',
] as const;

export const ALIGNMENTS: { label: string; hint: string }[] = [
  { label: 'Rechtschaffen gut', hint: 'Tut das Richtige, wie es die Gesellschaft erwartet.' },
  { label: 'Neutral gut', hint: 'Tut das Beste, das möglich ist, ohne sich an Regeln zu binden.' },
  { label: 'Chaotisch gut', hint: 'Folgt dem eigenen Gewissen, Regeln sind zweitrangig.' },
  { label: 'Rechtschaffen neutral', hint: 'Handelt nach Gesetz, Tradition oder einem Kodex.' },
  { label: 'Neutral', hint: 'Meidet Extreme und entscheidet von Fall zu Fall.' },
  { label: 'Chaotisch neutral', hint: 'Folgt den eigenen Launen und schätzt die Freiheit über alles.' },
  { label: 'Rechtschaffen böse', hint: 'Nimmt sich methodisch, was er will — innerhalb einer Ordnung.' },
  { label: 'Neutral böse', hint: 'Tut, was ihm nützt, ohne Mitleid oder Skrupel.' },
  { label: 'Chaotisch böse', hint: 'Handelt mit willkürlicher Gewalt aus Gier oder Hass.' },
];

export interface PersonalInput {
  playerName: string;
  languages: string[];
  alignment: string;
  traits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  appearance: string;
}

/** VOR den Grants: deklarierte Sprachen (Diebessprache) kommen über `applyChanges` dazu. */
export function applyPersonal(c: Character, p: PersonalInput): void {
  c.playerName = p.playerName.trim();
  c.languages = [COMMON_LANGUAGE, ...p.languages.filter((l) => l && l !== COMMON_LANGUAGE)];
  c.personal.gesinnung = p.alignment;
  c.personal.aussehen = p.appearance.trim();
  c.traits = p.traits.trim();
  c.ideals = p.ideals.trim();
  c.bonds = p.bonds.trim();
  c.flaws = p.flaws.trim();
}
