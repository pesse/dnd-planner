/** Zauber-Tabelle in zwei Ansichten über dieselben Zeilen: nach Schule (Vault-Ordner) und nach Grad. */
import { SPELLS_PATH } from '../../spellLibrary';
import { spellArtUrl } from '../../libraryArt';
import { SPELL_CLASS_LABELS, spellComponents, type Spell } from '../../types';
import { parseSpell } from '../../utils/schemaValidation';
import { listSubdirs, scanJsonFolder } from '../library/createLibrary';
import { memoOnce } from '../library/memo';
import {
  levelBadgeText, levelGroupLabel, levelLabel, schoolDirColor, schoolDirLabel, spellBadgeColor,
} from '../spellBadge';
import {
  byLabel, sourceFacet, type CatalogCell, type CatalogFacetValue, type CatalogKind, type CatalogRow, type CatalogSpec,
} from './catalogTypes';

interface LoadedSpell {
  spell: Spell;
  dir: string;
  path: string;
  entryName: string;
}

const library = memoOnce(async (): Promise<LoadedSpell[]> => {
  const dirs = await listSubdirs(SPELLS_PATH).catch(() => []);
  const perDir = await Promise.all(dirs.map((dir) =>
    scanJsonFolder<LoadedSpell | null>(
      `${SPELLS_PATH}/${dir}`,
      (data, { path, filename }) => {
        const parsed = parseSpell(data);
        return parsed.ok ? { spell: parsed.data, dir, path, entryName: filename.replace('.json', '') } : null;
      },
      () => null,
    )));
  return perDir.flat().filter((s): s is LoadedSpell => !!s);
});

const TIME_UNITS: [RegExp, number][] = [
  [/^reaktion/i, 1], [/^bonusaktion/i, 2], [/^aktion/i, 3], [/^runden?$/i, 6],
  [/^minuten?$/i, 60], [/^stunden?$/i, 3600], [/^tage?$/i, 86400],
];

/** Reaktion < Bonusaktion < Aktion < 1 Runde; ohne Zeitangabe („Bis der Zauber gebannt wird") ans Ende. */
export function timeSortKey(text: string): number {
  const t = text.replace(/^(konzentration, )?bis zu /i, '').trim();
  if (/^unmittelbar/i.test(t)) return 0;
  const m = t.match(/^(\d+)?\s*([^\s,(]+)/);
  const unit = TIME_UNITS.find(([re]) => re.test(m?.[2] ?? ''));
  return unit ? Number(m?.[1] ?? 1) * unit[1] : Number.MAX_SAFE_INTEGER;
}

const RANGE_WORDS: Record<string, number> = { selbst: 0, 'berührung': 1, sicht: 1e7, unbegrenzt: 1e8 };

/** In Metern; „Berührung" liegt vor 1,5 Meter, „Besonders" ganz hinten. */
export function rangeSortKey(text: string): number {
  const word = RANGE_WORDS[text.split(/[\s(]/)[0].toLowerCase()];
  if (word !== undefined) return word;
  const m = text.match(/^([\d.,]+)\s*(km|kilometer)?/i);
  return m ? parseFloat(m[1].replace(',', '.')) * (m[2] ? 1000 : 1) : 1e9;
}

/** Schneidet Auslöser („, die du ausführst …"), Klammern und „oder Ritual" ab — Ritual zeigt die Spalte R. */
export function timeCell(text: string): CatalogCell {
  const short = text
    .replace(/^konzentration, bis zu /i, '')
    .split(/,| \(| oder Ritual/)[0]
    .replace(/^1 (?=Aktion|Bonusaktion|Reaktion)/, '')
    .trim();
  const shown = short.charAt(0).toUpperCase() + short.slice(1);
  return { text: shown || '—', sort: timeSortKey(text), title: shown !== text ? text : undefined };
}

const CHECK: CatalogCell = { text: '✓', sort: 1, color: 'var(--arcane)' };
const NO_CHECK: CatalogCell = { text: '', sort: 0 };

const classLabel = (key: string): string => SPELL_CLASS_LABELS[key as keyof typeof SPELL_CLASS_LABELS] ?? key;

function spellCells({ spell, dir }: LoadedSpell): Record<string, CatalogCell> {
  return {
    level: {
      text: levelBadgeText(spell.level),
      sort: spell.level,
      color: spellBadgeColor(schoolDirColor(dir), spell.level),
      title: levelLabel(spell.level),
    },
    school: { text: schoolDirLabel(dir), color: schoolDirColor(dir) },
    castingTime: timeCell(spell.casting_time),
    range: { text: spell.range || '—', sort: rangeSortKey(spell.range) },
    duration: timeCell(spell.duration),
    concentration: spell.concentration ? CHECK : NO_CHECK,
    ritual: spell.ritual ? CHECK : NO_CHECK,
    components: {
      text: spellComponents(spell),
      title: spell.components.material ? spell.components.materials_needed ?? undefined : undefined,
    },
    classes: { text: spell.classes.map(classLabel).join(', ') },
  };
}

const levelFacet = (level: number): CatalogFacetValue => ({ id: String(level), label: levelGroupLabel(level), order: level });
const schoolFacet = (dir: string): CatalogFacetValue => ({ id: dir, label: schoolDirLabel(dir) });

const classFacets = (spell: Spell): CatalogFacetValue[] =>
  spell.classes.map((key) => ({ id: key, label: classLabel(key) }));

type Axis = 'school' | 'level';

const AXES: Record<Axis, {
  kind: CatalogKind;
  groupLabel: string;
  /** Die andere Achse, hier als Filter. */
  other: Axis;
  group: (s: LoadedSpell) => CatalogFacetValue;
}> = {
  school: { kind: 'spell-school', groupLabel: 'Schule', other: 'level', group: (s) => schoolFacet(s.dir) },
  level: { kind: 'spell-level', groupLabel: 'Grad', other: 'school', group: (s) => levelFacet(s.spell.level) },
};

const DETAIL_COLUMNS = ['castingTime', 'range', 'duration', 'concentration', 'ritual', 'components', 'classes'];

function spellCatalog(axis: Axis): CatalogSpec {
  const { kind, groupLabel, other, group } = AXES[axis];
  return {
    kind,
    type: 'spell',
    label: 'Zauber',
    groupLabel,
    columns: {
      level: { label: 'Grad', badge: true, center: true },
      school: { label: 'Schule', badge: true },
      castingTime: { label: 'Zeitaufwand' },
      range: { label: 'Reichweite' },
      duration: { label: 'Dauer' },
      concentration: { label: 'K', center: true, title: 'Konzentration' },
      ritual: { label: 'R', center: true, title: 'Ritual' },
      components: { label: 'Komp.', title: 'Komponenten: Verbal, Gestik, Material' },
      classes: { label: 'Klassen', wrap: true },
    },
    columnSets: { '': [other, ...DETAIL_COLUMNS] },
    facets: { [other]: AXES[other].groupLabel, class: 'Klasse', source: 'Quelle' },
    views: { kinds: [AXES.school.kind, AXES.level.kind], facet: other },
    invalidate: library.invalidate,
    async load() {
      const spells = await library.get();
      const rows: CatalogRow[] = spells.map((s) => ({
        path: s.path,
        entryName: s.entryName,
        name: s.spell.name || s.entryName,
        altName: s.spell.name_en,
        group: group(s).id,
        icon: spellArtUrl(s.spell),
        iconColor: schoolDirColor(s.dir),
        cells: spellCells(s),
        facets: {
          [other]: AXES[other].group(s),
          class: classFacets(s.spell),
          source: sourceFacet(s.spell.source),
        },
      }));
      const groups = new Map(spells.map((s) => [group(s).id, group(s)]));
      return {
        rows,
        groups: [...groups.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || byLabel(a, b)),
      };
    },
  };
}

export const spellSchoolCatalog = spellCatalog('school');
export const spellLevelCatalog = spellCatalog('level');
