/**
 * Die Zahlenspalten der Klassentabelle als Bogen-Blöcke: was ein Zähler ist (Kästchen zum
 * Abstreichen), was ein skalierender Wert (Zahl) und was schon anderswo auf dem Bogen steht.
 */
import { formatDamageDice, ftToM } from '$lib/itemFormat';
import { firstInt } from '$lib/utils/num';

export type ResourceKind = 'skip' | 'count' | 'value';

export type ResourceColumnDef =
  | { kind: 'skip' }
  /** `spell`: gehört auf das Zauberblatt, nicht in den allgemeinen Ressourcen-Kasten. */
  | { kind: 'count' | 'value'; labelDe: string; spell?: true };

const skip = { kind: 'skip' } as const;

/**
 * Total über die Spaltennamen, die der Vault führt — auch die `skip`-Zeilen, denn sonst
 * bräuchte es daneben eine zweite, hand gepflegte Ausschlussliste. Der Schlüssel ist der
 * rohe v2-Spaltenname, es gibt keinen Rückweg vom deutschen Label zur Spalte.
 */
export const CLASS_RESOURCE_COLUMNS: Record<string, ResourceColumnDef> = {
  '1st': skip, '2nd': skip, '3rd': skip, '4th': skip, '5th': skip,
  '6th': skip, '7th': skip, '8th': skip, '9th': skip,
  'Slot Level': skip,
  'Spell Slots': skip,
  'Prepared Spells': skip,
  Cantrips: skip,
  'Cantrips Known': skip,
  'Proficiency Bonus': skip,
  'Weapon Mastery': skip,
  'Eldritch Invocations': skip,

  Rages: { kind: 'count', labelDe: 'Kampfrausch' },
  'Sorcery Points': { kind: 'count', labelDe: 'Zauberpunkte', spell: true },
  'Focus Points': { kind: 'count', labelDe: 'Fokuspunkte' },
  'Channel Divinity': { kind: 'count', labelDe: 'Göttlicher Kanal' },
  'Second Wind': { kind: 'count', labelDe: 'Zweiter Wind' },
  // 2024 ist das die Zahl der Jägermal-Einsätze pro langer Rast, kein Gegnertyp.
  'Favored Enemy': { kind: 'count', labelDe: 'Erzfeind' },
  'Wild Shape': { kind: 'count', labelDe: 'Tiergestalt' },

  'Rage Damage': { kind: 'value', labelDe: 'Rauschschaden' },
  'Sneak Attack': { kind: 'value', labelDe: 'Hinterhältiger Angriff' },
  'Martial Arts': { kind: 'value', labelDe: 'Kampfkunst' },
  'Unarmoed Movement': { kind: 'value', labelDe: 'Bewegung ohne Rüstung' },
  'Bardic Die': { kind: 'value', labelDe: 'Bardenwürfel' },
};

export interface ResourceTrack {
  column: string;
  label: string;
  kind: 'count' | 'value';
  /** Steht auf dem Zauberblatt (Zauberpunkte), nicht im Ressourcen-Kasten. */
  spell: boolean;
  /** Zahl der Kästchen; bei `value` immer 0. */
  max: number;
  /** Der Spaltenwert in Bogen-Schreibweise: `1W6` statt `1d6`, Meter statt Fuß. */
  text: string;
}

const isEmpty = (raw: string): boolean => !raw.trim() || /^[—–-]$/.test(raw.trim());

/** Die Tabelle kommt englisch aus Open5e — der Bogen ist deutsch und metrisch. */
const sheetValue = (raw: string): string =>
  formatDamageDice(raw.trim()).replace(/(\d+)\s*ft\.?/gi, (_, ft) => ftToM(Number(ft)));

/**
 * Aus den Spalten EINER Klassenstufe. Eine unbekannte Spalte fällt still heraus — dieselbe
 * Degradation wie `getProgressionByKey → null`, damit Homebrew den Bogen nicht sprengt.
 */
export function resourceTracks(columns: Record<string, string>): ResourceTrack[] {
  const tracks: ResourceTrack[] = [];
  for (const [column, def] of Object.entries(CLASS_RESOURCE_COLUMNS)) {
    if (def.kind === 'skip') continue;
    const raw = columns[column];
    if (raw === undefined || isEmpty(raw)) continue;
    if (def.kind === 'count') {
      const max = firstInt(raw);
      if (max > 0)
        tracks.push({ column, label: def.labelDe, kind: 'count', max, text: sheetValue(raw), spell: !!def.spell });
    } else {
      tracks.push({ column, label: def.labelDe, kind: 'value', max: 0, text: sheetValue(raw), spell: !!def.spell });
    }
  }
  return tracks;
}
