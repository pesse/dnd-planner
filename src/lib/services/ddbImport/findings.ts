/**
 * Was der Import nicht selbst verknüpfen konnte, und was der Spieler dazu entscheidet.
 * Ohne Entscheidung gilt `freetext`: nichts geht verloren, nur der Link fehlt.
 */
import type { DdbOrigin } from '$lib/schemas/ddbSheet';
import type { SourceKey } from '$lib/schemas/source';
import { normName } from '$lib/utils/text';

export type FindingKind = 'class' | 'subclass' | 'species' | 'background' | 'feat' | 'item' | 'spell';

export interface LibraryOption {
  key: string;
  label: string;
}

export interface ImportFinding {
  id: string;
  kind: FindingKind;
  /** Name, wie D&D Beyond ihn führt. */
  name: string;
  origin: DdbOrigin | null;
  /** `ambiguous`: mehrere Bibliothekseinträge heißen so, `candidates` nennt sie. */
  reason: 'missing' | 'ambiguous';
  candidates: LibraryOption[];
  /** Unterklasse: Key der verknüpften Grundklasse. Zauber: woher er kommt. */
  context: string;
}

export type Resolution =
  | { action: 'link'; key: string }
  | { action: 'freetext' }
  | { action: 'create'; source: SourceKey }
  | { action: 'drop' };
export type ResolutionAction = Resolution['action'];
export type Resolutions = Record<string, Resolution>;

/** Klasse, Volk und Hintergrund trägt jeder Charakter — weglassen geht dort nicht. */
export const RESOLUTION_ACTIONS: Record<FindingKind, ResolutionAction[]> = {
  class: ['link', 'freetext'],
  subclass: ['link', 'freetext', 'drop'],
  species: ['link', 'freetext'],
  background: ['link', 'freetext'],
  feat: ['link', 'create', 'freetext', 'drop'],
  item: ['link', 'create', 'freetext', 'drop'],
  spell: ['link', 'freetext', 'drop'],
};

/** Klassen tragen ihren Index — „Fighter" kann nicht zweimal vorkommen, eine Unterklasse schon. */
export const findingId = (kind: FindingKind, name: string, index?: number): string =>
  index === undefined ? `${kind}:${normName(name)}` : `${kind}:${index}`;

export class FindingLog {
  readonly findings: ImportFinding[] = [];
  constructor(private readonly resolutions: Resolutions) {}

  resolution(id: string): Resolution | undefined {
    return this.resolutions[id];
  }

  linkedKey(id: string): string | undefined {
    const r = this.resolutions[id];
    return r?.action === 'link' ? r.key : undefined;
  }

  dropped(id: string): boolean {
    return this.resolutions[id]?.action === 'drop';
  }

  add(f: Omit<ImportFinding, 'reason' | 'candidates' | 'context'> & Partial<ImportFinding>): void {
    if (this.findings.some((x) => x.id === f.id)) return;
    this.findings.push({ reason: 'missing', candidates: [], context: '', ...f });
  }
}
