/**
 * Zugriff auf die Open5e-**v2**-API (api.open5e.com/v2).
 *
 * Läuft — wie `dndApi.ts` — über das Tauri-`http_request`-Kommando (Rust/reqwest),
 * um die CORS-Beschränkung des Webviews zu umgehen. Transport-Schicht: liefert das
 * rohe v2-JSON; die Abbildung auf den internen Typ passiert in `classProgression.ts`.
 *
 * v2 ist im Gegensatz zu v1 vollstrukturiert: `data_for_class_table` je Spalte,
 * `gained_at` je Merkmal, `caster_type`, `saving_throws`, `document` mit Quelle.
 * Es gibt SRD 5.1 (`srd-2014`) UND SRD 5.2 (`srd-2024`) als Dokumente.
 */
import { invoke } from '@tauri-apps/api/core';

export const OPEN5E_V2 = 'https://api.open5e.com/v2';

/** Standard-Quelle: SRD 5.2 (passt zur deutschen 5.2.1-Terminologie der App). */
export const DEFAULT_DOCUMENT = 'srd-2024';

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

// ── Spezies ──────────────────────────────────────────────────────────────────
// WICHTIG: der v2-Endpunkt heißt `/v2/species/`, NICHT `/v2/races/`.

/** Holt eine Spezies per v2-Key, z.B. "srd-2024_dwarf". */
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

// ── Talente (Feats) ────────────────────────────────────────────────────────────

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

// ── Hintergründe (Backgrounds) ─────────────────────────────────────────────────
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
