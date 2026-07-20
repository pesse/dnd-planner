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

/** Listet Klassen-/Subklassen-Referenzen (für Quellen-Filter & Subklassen-Auswahl). */
export async function listClasses(limit = 400): Promise<V2ClassRef[]> {
  const raw = (await apiGet(`${OPEN5E_V2}/classes/?format=json&limit=${limit}`)) as { results?: V2ClassRef[] };
  return raw.results ?? [];
}

/** Subklassen einer Basisklasse, gefiltert nach erlaubten Quellen (document.key). */
export async function getSubclasses(parentKey: string, allowedDocs: string[] = [DEFAULT_DOCUMENT]): Promise<V2ClassRef[]> {
  const all = await listClasses();
  const allow = new Set(allowedDocs);
  return all.filter((c) => c.subclass_of?.key === parentKey && allow.has(c.document?.key));
}
