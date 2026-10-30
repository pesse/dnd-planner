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
