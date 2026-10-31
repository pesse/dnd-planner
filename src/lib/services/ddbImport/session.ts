/** Der Ablauf hinter dem Import-Wizard: laden, analysieren, Entscheidungen anwenden, anlegen. */
import type { DdbSheet } from '$lib/schemas/ddbSheet';
import { displayName } from '$lib/itemLibrary';
import { featDisplayName } from '$lib/featsLibrary';
import { classDisplayName } from '$lib/classLibrary';
import { normName } from '$lib/utils/text';
import { invalidateLibraryCaches } from '../library/invalidate';
import { buildDdbCharacter, type DdbImportResult } from './assemble';
import { fetchDdbCharacter } from './fetchCharacter';
import { parseDdbJson } from './parseJson';
import { loadDdbImportLibraries } from './loadLibraries';
import { loadSourceCatalog, type DdbSourceCatalog } from './sources';
import { featFromDdb, itemFromDdb, writeImportedFeat, writeImportedItem } from './createEntries';
import type { DdbImportLibraries } from './linkEntities';
import { findingId, type ImportFinding, type LibraryOption, type Resolutions } from './findings';

export interface DdbAnalysis {
  sheet: DdbSheet;
  catalog: DdbSourceCatalog;
  libs: DdbImportLibraries;
  /** Stand ohne Entscheidungen — die Befunde bleiben im Wizard fest, auch wenn sich Entscheidungen ändern. */
  draft: DdbImportResult;
}

export async function analyzeDdbCharacter(id: string): Promise<DdbAnalysis> {
  const [json, catalog, libs] = await Promise.all([fetchDdbCharacter(id), loadSourceCatalog(), loadDdbImportLibraries()]);
  const sheet = parseDdbJson(json);
  return { sheet, catalog, libs, draft: await buildDdbCharacter(sheet, libs) };
}

const MAX_HITS = 12;

/** Bibliothekseinträge zum Verknüpfen. Unterklassen nur unter der verknüpften Grundklasse. */
export function searchLibrary(libs: DdbImportLibraries, f: ImportFinding, query: string): LibraryOption[] {
  const q = normName(query);
  const hit = (...names: (string | undefined)[]) => !q || names.some((n) => normName(n).includes(q));
  const take = <T>(xs: T[], label: (x: T) => string, key: (x: T) => string | undefined) =>
    xs.flatMap((x) => (key(x) ? [{ key: key(x)!, label: label(x) }] : [])).slice(0, MAX_HITS);
  switch (f.kind) {
    case 'class':
      return take(libs.classes.filter((e) => !e.subclassOf && hit(e.name, e.nameDe)), classDisplayName, (e) => e.key);
    case 'subclass':
      return take(libs.classes.filter((e) => e.subclassOf && (!f.context || e.subclassOf === f.context) && hit(e.name, e.nameDe)), classDisplayName, (e) => e.key);
    case 'species':
      return take(libs.species.filter((e) => hit(e.name, e.nameDe)), (e) => e.nameDe || e.name, (e) => e.key);
    case 'background':
      return take(libs.backgrounds.filter((e) => hit(e.name, e.nameDe)), (e) => e.nameDe || e.name, (e) => e.key);
    case 'feat':
      return take(libs.feats.filter((e) => hit(e.name, e.nameDe)), featDisplayName, (e) => e.sourceKey);
    case 'item':
      return q ? take([...libs.items.byKey.values()].filter((e) => hit(e.name, e.name_de)), (e) => `${displayName(e)} (${e.name})`, (e) => e.key) : [];
    case 'spell':
      return q ? take(libs.spellList.filter((e) => hit(e.name, e.name_en)), (e) => e.name, (e) => e.key) : [];
  }
}

/** Legt die Einträge mit `create` an und ersetzt die Entscheidung durch einen Link auf sie. */
async function createEntries(sheet: DdbSheet, findings: ImportFinding[], resolutions: Resolutions): Promise<Resolutions> {
  const out: Resolutions = { ...resolutions };
  for (const f of findings) {
    const r = resolutions[f.id];
    if (r?.action !== 'create') continue;
    if (f.kind === 'feat') {
      const ddb = sheet.features.find((x) => x.section === 'FEATS' && findingId('feat', x.name) === f.id);
      if (!ddb) continue;
      const feat = featFromDdb(ddb, r.source);
      await writeImportedFeat(feat);
      out[f.id] = { action: 'link', key: feat.key };
    } else if (f.kind === 'item') {
      const ddb = sheet.inventory.find((x) => findingId('item', x.name) === f.id);
      if (!ddb) continue;
      const item = itemFromDdb(ddb, r.source);
      await writeImportedItem(item);
      out[f.id] = { action: 'link', key: item.key };
    }
  }
  return out;
}

export async function finishDdbImport(a: DdbAnalysis, resolutions: Resolutions): Promise<DdbImportResult> {
  const needsCreate = Object.values(resolutions).some((r) => r.action === 'create');
  const final = needsCreate ? await createEntries(a.sheet, a.draft.findings, resolutions) : resolutions;
  if (needsCreate) invalidateLibraryCaches();
  const libs = needsCreate ? await loadDdbImportLibraries() : a.libs;
  return buildDdbCharacter(a.sheet, libs, { resolutions: final });
}
