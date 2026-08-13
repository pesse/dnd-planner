/**
 * Der Katalog dessen, was auf den Bogen kann. Zwei Blätter sind feste Vorlagen und stehen
 * deshalb als je EINE Sektion darin: die Übersicht (`overview`) und der Kopf des Zauberblatts
 * (`spellTop`). `available` liest ausschließlich das fertige Bündel — ein Häkchen im
 * Vorschau-Dialog baut damit nur neu, es lädt nichts nach.
 */
import type { CharacterPrintData } from './data';
import { renderOverview } from './pages/overview';
import { renderInventory, renderMasteries } from './pages/extras';
import {
  renderClassFeatures, renderCompanion, renderFeats, renderFreetext, renderPersonal,
  renderPinnedFeatures, renderSpeciesFeatures,
} from './pages/details';
import { renderExtraSpells, renderSpellSource, renderSpellTop, spellSourceGroups } from './pages/spells';

export type SheetPageId = 'overview' | 'details' | 'spells' | 'pinned' | 'spellCards';

export const SHEET_PAGES: { id: SheetPageId; label: string }[] = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'details', label: 'Merkmale & Ausrüstung' },
  { id: 'spells', label: 'Zauber' },
  { id: 'pinned', label: 'Anhang' },
  { id: 'spellCards', label: 'Zauberkarten' },
];

/**
 * Reihenfolge auf dem Bogen — ein Tupel, keine Sortierfunktion. Nach Blockbreite gruppiert:
 * jeder Wechsel zwischen `column-span: all` und Spaltensatz franst eine Bahn aus.
 */
export const STATIC_SECTION_IDS = [
  'overview',
  'masteries', 'personal', 'companion',
  'inventory', 'featuresSpecies', 'featuresClass', 'featuresFeats', 'freetext',
  'spellTop', 'spellsExtra', 'featuresPinned', 'spellCards',
] as const;

export type StaticSectionId = (typeof STATIC_SECTION_IDS)[number];
export type SheetSectionId = StaticSectionId | `spells:${string}`;

export interface SheetSection {
  id: SheetSectionId;
  label: string;
  page: SheetPageId;
  /** false = angeboten, aber im Dialog nicht vorausgewählt. */
  defaultOn: boolean;
  render(d: CharacterPrintData): string;
}

type SectionDef = Omit<SheetSection, 'id'> & { available(d: CharacterPrintData): boolean };

const always = () => true;
const hasText = (s: string | undefined): boolean => !!s?.trim();

/** Angeboten wird schon vor dem Messen — `spellCards` füllt der Dialog erst beim Anhaken. */
const hasSpells = (d: CharacterPrintData): boolean =>
  d.grouped.extra.length > 0 ||
  d.grouped.sources.some((s) => s.quotas.some((q) => q.spells.length > 0));

/** Total über `StaticSectionId` — eine fehlende Sektion ist ein Compile-Fehler. */
const STATIC_SECTIONS: Record<StaticSectionId, SectionDef> = {
  // Ein Blatt, eine Sektion: die Aufteilung ist fest, es gibt darin nichts abzuwählen.
  overview:    { label: 'Kampfbogen (festes Blatt)', page: 'overview', defaultOn: true,
                 available: always, render: renderOverview },

  masteries:   { label: 'Waffenmeisterschaft', page: 'details', defaultOn: true,
                 available: (d) => !!renderMasteries(d), render: renderMasteries },
  personal:    { label: 'Persönliches',       page: 'details', defaultOn: true,
                 available: (d) => !!renderPersonal(d), render: renderPersonal },
  companion:   { label: 'Gefährte',           page: 'details', defaultOn: true,
                 available: (d) => !!renderCompanion(d), render: renderCompanion },
  // Der Kasten steht immer: Leerzeilen und Münzkapseln sind die Fläche zum Nachtragen.
  inventory:   { label: 'Ausrüstung & Geldmittel', page: 'details', defaultOn: true,
                 available: always, render: renderInventory },
  featuresSpecies: { label: 'Volksmerkmale',  page: 'details', defaultOn: true,
                 available: (d) => hasText(d.character.personal?.rassenmerkmale),
                 render: renderSpeciesFeatures },
  featuresClass: { label: 'Klassenmerkmale',  page: 'details', defaultOn: true,
                 available: (d) => hasText(d.character.classFeatures),
                 render: renderClassFeatures },
  featuresFeats: { label: 'Talente',          page: 'details', defaultOn: true,
                 available: (d) => d.features.featEntries.length > 0, render: renderFeats },
  freetext:    { label: 'Notizen',            page: 'details', defaultOn: false,
                 available: (d) => hasText(d.freetext), render: renderFreetext },

  spellTop:    { label: 'Vorräte, Werte und Options-Pools', page: 'spells', defaultOn: true,
                 available: (d) => !!renderSpellTop(d), render: renderSpellTop },
  spellsExtra: { label: 'Weitere Zauber',     page: 'spells', defaultOn: true,
                 available: (d) => !!renderExtraSpells(d), render: renderExtraSpells },
  // Nachschlagetext, kein Bogen: er steht hinter allem, was am Tisch bedient wird.
  featuresPinned: { label: 'Gepinnte Merkmale', page: 'pinned', defaultOn: true,
                 available: (d) => !!renderPinnedFeatures(d), render: renderPinnedFeatures },
  // Neun Karten je Blatt — bei einem Magier sind das mehrere Seiten, deshalb nicht vorgewählt.
  spellCards:  { label: 'Volltext-Karten (3×3)', page: 'spellCards', defaultOn: false,
                 available: hasSpells, render: (d) => d.spellCards },
};

/** Ein Kasten je Satz Zauberwerte; die Id der ersten Quelle ist stabil über ein Neuladen. */
const spellSections = (d: CharacterPrintData): SheetSection[] =>
  spellSourceGroups(d).map((group) => ({
    id: `spells:${group.id}` as const,
    label: [group.label, group.hint].filter(Boolean).join(' · '),
    page: 'spells' as const,
    defaultOn: true,
    render: (data: CharacterPrintData) => renderSpellSource(data, group.id),
  }));

export function sheetSections(d: CharacterPrintData): SheetSection[] {
  const statics = STATIC_SECTION_IDS
    .filter((id) => STATIC_SECTIONS[id].available(d))
    .map((id): SheetSection => {
      const { available: _available, ...def } = STATIC_SECTIONS[id];
      return { id, ...def };
    });
  // Die Quellen nach dem Vorrat, aber vor „Weitere Zauber".
  const at = statics.findIndex((s) => s.id === 'spellsExtra');
  const sources = spellSections(d);
  return at < 0
    ? [...statics, ...sources]
    : [...statics.slice(0, at), ...sources, ...statics.slice(at)];
}

export const defaultSelection = (sections: SheetSection[]): Record<string, boolean> =>
  Object.fromEntries(sections.map((s) => [s.id, s.defaultOn]));
