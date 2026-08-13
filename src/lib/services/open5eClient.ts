/**
 * Transport zur Open5e-v2-API (api.open5e.com/v2): rohes JSON, keine Abbildung, Keys der
 * Form `srd-2024_wizard`. Läuft über das Tauri-`http_request`-Kommando statt `fetch`,
 * sonst blockt die CORS-Beschränkung des Webviews.
 */
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_DOCUMENT, OPEN5E_V2 } from './open5eSource';
export { DEFAULT_DOCUMENT, OPEN5E_V2 };


export async function apiGet(url: string): Promise<unknown> {
  const text = await invoke<string>('http_request', {
    req: { url, method: 'GET', headers: {}, body: '' },
  });
  return JSON.parse(text);
}

export async function getClass(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/classes/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

export interface V2ClassRef {
  key: string;
  name: string;
  document: { key: string; gamesystem?: { key?: string }; display_name?: string };
  subclass_of?: { key?: string; name?: string } | null;
}

// Session-Cache: der Abruf holt bis zu `limit` Klassen auf einmal und ist teuer.
let classListCache: V2ClassRef[] | null = null;

export async function listClasses(limit = 400): Promise<V2ClassRef[]> {
  if (classListCache) return classListCache;
  const raw = (await apiGet(`${OPEN5E_V2}/classes/?format=json&limit=${limit}`)) as { results?: V2ClassRef[] };
  classListCache = raw.results ?? [];
  return classListCache;
}

export async function getSubclasses(parentKey: string, allowedDocs: string[] = [DEFAULT_DOCUMENT]): Promise<V2ClassRef[]> {
  const all = await listClasses();
  const allow = new Set(allowedDocs);
  return all.filter((c) => c.subclass_of?.key === parentKey && allow.has(c.document?.key));
}

export async function getSpecies(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/species/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

export interface V2SpeciesRef {
  key: string;
  name: string;
  document: { key: string; gamesystem?: { key?: string }; display_name?: string };
}

export async function listSpecies(limit = 400): Promise<V2SpeciesRef[]> {
  const raw = (await apiGet(`${OPEN5E_V2}/species/?format=json&limit=${limit}`)) as { results?: V2SpeciesRef[] };
  return raw.results ?? [];
}


export async function getFeat(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/feats/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

export interface V2FeatRef {
  key: string;
  name: string;
  document: { key: string; gamesystem?: { key?: string }; display_name?: string };
}

export async function listFeats(limit = 500): Promise<V2FeatRef[]> {
  const raw = (await apiGet(`${OPEN5E_V2}/feats/?format=json&limit=${limit}`)) as { results?: V2FeatRef[] };
  return raw.results ?? [];
}

// Nur 4 der ~58 Hintergründe sind `srd-2024`, der Rest ist 2014-Mechanik aus A5E und
// Drittanbietern. `toSourceKey` zieht solche Importe deshalb auf `homebrew-sam` — sonst
// landet etwas mit ungeklärter Lizenz in einem offen verteilten Pack.
export async function getBackground(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/backgrounds/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

export interface V2BackgroundRef {
  key: string;
  name: string;
  document: { key: string; gamesystem?: { key?: string }; display_name?: string };
}

export async function listBackgrounds(limit = 100): Promise<V2BackgroundRef[]> {
  const raw = (await apiGet(`${OPEN5E_V2}/backgrounds/?format=json&limit=${limit}`)) as { results?: V2BackgroundRef[] };
  return raw.results ?? [];
}

// Gegenstände liegen auf ZWEI Endpunkten mit identischem Schema (`/v2/items/` ohne,
// `/v2/magicitems/` mit rarity/attunement); `mapOpen5eItem` bildet beide gleich ab.
// Verifiziert: der Quellen-Filter heißt hier `document=` und die Freitextsuche
// `name__icontains=` — `document__key=`/`search=` werden still ignoriert und liefern alles.
export async function getItem(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/items/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

export async function getMagicItem(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/magicitems/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

/** Die srd-2024-Keys der beiden Endpunkte kollidieren nicht — der 404-Fallback ist eindeutig. */
export async function getOpen5eItem(key: string): Promise<Record<string, unknown>> {
  try {
    return await getItem(key);
  } catch {
    return await getMagicItem(key);
  }
}

export async function listItems(limit = 500): Promise<Record<string, unknown>[]> {
  const raw = (await apiGet(
    `${OPEN5E_V2}/items/?document=${DEFAULT_DOCUMENT}&format=json&limit=${limit}`,
  )) as { results?: Record<string, unknown>[] };
  return raw.results ?? [];
}

/** Die Form, die `DndApiSearch` und `CreateCardModal` erwarten. */
export interface ApiRef {
  index: string;
  name: string;
  url: string; // = v2-Key, keine URL — die Form stammt aus der früheren dnd5eapi-Anbindung
  tag?: string;
}

export interface Open5eItemSearchResult extends ApiRef {
  tag: string; // 'ausrüstung' | 'magisch' | 'zauber'
}

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

export async function searchOpen5eItems(q: string, limit = 20): Promise<Open5eItemSearchResult[]> {
  const [gear, magic] = await Promise.all([
    searchOpen5eEndpoint('items', q, 'ausrüstung', limit),
    searchOpen5eEndpoint('magicitems', q, 'magisch', limit),
  ]);
  return [...gear, ...magic].slice(0, limit);
}

// Bei Zaubern heißt der Quellen-Filter — anders als bei Items — `document__key=`;
// `document=` wird still ignoriert und liefert alle 1955 Dokumente.
export async function getSpell(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/spells/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

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
