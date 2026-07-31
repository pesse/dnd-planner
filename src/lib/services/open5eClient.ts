/**
 * Transport zur Open5e-**v2**-API (api.open5e.com/v2): rohes JSON, keine Abbildung.
 *
 * Läuft — wie `dndApi.ts` — über das Tauri-`http_request`-Kommando (Rust/reqwest), um die
 * CORS-Beschränkung des Webviews zu umgehen.
 *
 * v2 ist vollstrukturiert: `data_for_class_table` je Spalte, `gained_at` je Merkmal,
 * `caster_type`, `saving_throws`, `document` mit Quelle. Es gibt SRD 5.1 (`srd-2014`)
 * UND SRD 5.2 (`srd-2024`) als Dokumente.
 */
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_DOCUMENT, OPEN5E_V2 } from './open5eSource';
export { DEFAULT_DOCUMENT, OPEN5E_V2 };


/** GET gegen die Open5e-v2-API via Rust-HTTP; liefert das geparste JSON. */
export async function apiGet(url: string): Promise<unknown> {
  const text = await invoke<string>('http_request', {
    req: { url, method: 'GET', headers: {}, body: '' },
  });
  return JSON.parse(text);
}

/** Holt eine Klasse (oder Subklasse) per v2-Key, z.B. "srd-2024_wizard". */
export async function getClass(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/classes/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

export interface V2ClassRef {
  key: string;
  name: string;
  document: { key: string; gamesystem?: { key?: string }; display_name?: string };
  subclass_of?: { key?: string; name?: string } | null;
}

// Session-Cache für die (große) Klassenliste — der Netzabruf lädt bis zu `limit`
// Klassen und ist teuer; innerhalb einer Session ändert er sich nicht.
let classListCache: V2ClassRef[] | null = null;

/** Listet Klassen-/Subklassen-Referenzen (für Quellen-Filter & Subklassen-Auswahl). */
export async function listClasses(limit = 400): Promise<V2ClassRef[]> {
  if (classListCache) return classListCache;
  const raw = (await apiGet(`${OPEN5E_V2}/classes/?format=json&limit=${limit}`)) as { results?: V2ClassRef[] };
  classListCache = raw.results ?? [];
  return classListCache;
}

/** Subklassen einer Basisklasse, gefiltert nach erlaubten Quellen (document.key). */
export async function getSubclasses(parentKey: string, allowedDocs: string[] = [DEFAULT_DOCUMENT]): Promise<V2ClassRef[]> {
  const all = await listClasses();
  const allow = new Set(allowedDocs);
  return all.filter((c) => c.subclass_of?.key === parentKey && allow.has(c.document?.key));
}

/** Holt eine Spezies per v2-Key. Der v2-Endpunkt heißt `/v2/species/`, NICHT `/v2/races/`. */
export async function getSpecies(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/species/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

export interface V2SpeciesRef {
  key: string;
  name: string;
  document: { key: string; gamesystem?: { key?: string }; display_name?: string };
}

/** Listet Spezies-Referenzen (für Quellen-Filter & Auswahl). */
export async function listSpecies(limit = 400): Promise<V2SpeciesRef[]> {
  const raw = (await apiGet(`${OPEN5E_V2}/species/?format=json&limit=${limit}`)) as { results?: V2SpeciesRef[] };
  return raw.results ?? [];
}


/** Holt ein Talent per v2-Key, z.B. "srd-2024_alert". */
export async function getFeat(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/feats/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

export interface V2FeatRef {
  key: string;
  name: string;
  document: { key: string; gamesystem?: { key?: string }; display_name?: string };
}

/** Listet Talent-Referenzen (für Suche & Auswahl). */
export async function listFeats(limit = 500): Promise<V2FeatRef[]> {
  const raw = (await apiGet(`${OPEN5E_V2}/feats/?format=json&limit=${limit}`)) as { results?: V2FeatRef[] };
  return raw.results ?? [];
}

// ACHTUNG: nur 4 der ~58 Einträge sind 5e-2024 (`document.key === 'srd-2024'`).
// Der Rest stammt aus SRD 5.1, A5E und Drittanbieter-Quellen und ist 2014-Mechanik
// (Feature + Suggested Characteristics statt Attributswerte + Herkunftstalent).
// `toSourceKey` zieht solche Importe auf `homebrew-sam` — bewusst, damit nichts mit
// ungeklärter Lizenz in einem offen verteilten Pack landet.

/** Holt einen Hintergrund per v2-Key, z.B. "srd-2024_soldier". */
export async function getBackground(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/backgrounds/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

export interface V2BackgroundRef {
  key: string;
  name: string;
  document: { key: string; gamesystem?: { key?: string }; display_name?: string };
}

/** Listet Hintergrund-Referenzen (für Suche & Auswahl). */
export async function listBackgrounds(limit = 100): Promise<V2BackgroundRef[]> {
  const raw = (await apiGet(`${OPEN5E_V2}/backgrounds/?format=json&limit=${limit}`)) as { results?: V2BackgroundRef[] };
  return raw.results ?? [];
}

// Open5e v2 splittet Gegenstände auf ZWEI Endpunkte, beide mit inline
// weapon/armor-Detailobjekten und identischem Datensatz-Schema:
//   • `/v2/items/`      — gewöhnliche Ausrüstung (keine rarity)
//   • `/v2/magicitems/` — magische Gegenstände (mit rarity/attunement)
// Beide werden importiert/durchsucht; `mapOpen5eItem` bildet beide gleich ab.
//
// WICHTIG zu den v2-Query-Parametern (verifiziert): der Quellen-Filter heißt
// `document=<key>` (NICHT `document__key`, das wird still ignoriert und liefert
// alle Dokumente), und Freitextsuche geht über `name__icontains=` (`search=`
// wird ebenfalls ignoriert). Alle Zugriffe filtern hart auf srd-2024.

/** Holt einen Ausrüstungs-Datensatz (`/v2/items/`) per v2-Key, z.B. "srd-2024_battleaxe". */
export async function getItem(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/items/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

/** Holt einen magischen Gegenstand (`/v2/magicitems/`) per v2-Key, z.B. "srd-2024_ring-of-protection". */
export async function getMagicItem(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/magicitems/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

/**
 * Lädt einen Gegenstand per Key ohne den Endpunkt zu kennen — erst `/v2/items/`,
 * bei 404 `/v2/magicitems/`. Die srd-2024-Keys der beiden Endpunkte kollidieren
 * nicht, der Fallback ist also eindeutig. Für UI/KI, die nur einen Key haben.
 */
export async function getOpen5eItem(key: string): Promise<Record<string, unknown>> {
  try {
    return await getItem(key);
  } catch {
    return await getMagicItem(key);
  }
}

/** Listet die rohen srd-2024-Ausrüstungs-Datensätze (mit inline weapon/armor). */
export async function listItems(limit = 500): Promise<Record<string, unknown>[]> {
  const raw = (await apiGet(
    `${OPEN5E_V2}/items/?document=${DEFAULT_DOCUMENT}&format=json&limit=${limit}`,
  )) as { results?: Record<string, unknown>[] };
  return raw.results ?? [];
}

/** Such-Treffer für die manuelle Import-UI (`DndApiSearch`-kompatibel: {index,name,url}). */
export interface Open5eItemSearchResult {
  index: string; // = v2-Key
  name: string;
  url: string; // = v2-Key (an getOpen5eItem übergeben)
  tag: string; // 'ausrüstung' | 'magisch'
}

/** Ein `/v2/…`-Suchendpunkt → {index,name,url,tag}-Treffer (srd-2024, name__icontains). */
async function searchOpen5eEndpoint(path: string, q: string, tag: string, limit: number): Promise<Open5eItemSearchResult[]> {
  const raw = (await apiGet(
    `${OPEN5E_V2}/${path}/?document=${DEFAULT_DOCUMENT}&name__icontains=${encodeURIComponent(q)}&format=json&limit=${limit}`,
  )) as { results?: Array<Record<string, unknown>> };
  return (raw.results ?? []).map((r) => ({
    index: String(r.key ?? ''),
    name: String(r.name ?? ''),
    url: String(r.key ?? ''),
    tag,
  }));
}

/** Durchsucht srd-2024-Ausrüstung UND -Magie; liefert bis zu `limit` Treffer (Ausrüstung zuerst). */
export async function searchOpen5eItems(q: string, limit = 20): Promise<Open5eItemSearchResult[]> {
  const [gear, magic] = await Promise.all([
    searchOpen5eEndpoint('items', q, 'ausrüstung', limit),
    searchOpen5eEndpoint('magicitems', q, 'magisch', limit),
  ]);
  return [...gear, ...magic].slice(0, limit);
}

// Open5e v2 splittet Zauber NICHT auf zwei Endpunkte. Der Quellen-Filter ist hier —
// anders als bei Items — `document__key=<key>` (NICHT `document=`, das wird still
// ignoriert und liefert alle 1955 Dokumente). Freitextsuche wie bei Items via
// `name__icontains=`.

/** Holt einen Zauber (`/v2/spells/`) per v2-Key, z.B. "srd-2024_acid-arrow". */
export async function getSpell(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/spells/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

/** Durchsucht srd-2024-Zauber (`name__icontains`); liefert `{index,name,url}`-Treffer (url = v2-Key). */
export async function searchOpen5eSpells(q: string, limit = 20): Promise<Open5eItemSearchResult[]> {
  const raw = (await apiGet(
    `${OPEN5E_V2}/spells/?document__key=${DEFAULT_DOCUMENT}&name__icontains=${encodeURIComponent(q)}&format=json&limit=${limit}`,
  )) as { results?: Array<Record<string, unknown>> };
  return (raw.results ?? []).map((r) => ({
    index: String(r.key ?? ''),
    name: String(r.name ?? ''),
    url: String(r.key ?? ''),
    tag: 'zauber',
  }));
}
