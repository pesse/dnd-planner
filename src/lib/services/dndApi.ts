/**
 * Geteilte Zugriffe auf die offizielle D&D-5e-SRD-API (dnd5eapi.co).
 *
 * Läuft über das Tauri-`http_request`-Kommando (Rust/reqwest) — umgeht die
 * CORS-Beschränkung des Webviews, genau wie der LLM-HTTP-Pfad. Wird sowohl von
 * der `ItemCard` (manueller Import) als auch vom KI-Tool-Executor genutzt.
 */
import { invoke } from '@tauri-apps/api/core';

export const DND_API = 'https://www.dnd5eapi.co/api/2014';

export interface DndApiRef {
  index: string;
  name: string;
  url: string;
}

/** GET gegen die DnD-API via Rust-HTTP; liefert das geparste JSON. */
export async function apiGet(url: string): Promise<unknown> {
  const text = await invoke<string>('http_request', {
    req: { url, method: 'GET', headers: {}, body: '' },
  });
  return JSON.parse(text);
}

async function searchCategory(category: 'equipment' | 'magic-items', q: string): Promise<DndApiRef[]> {
  const raw = (await apiGet(`${DND_API}/${category}?name=${encodeURIComponent(q)}`)) as Record<string, unknown>;
  return (raw.results as DndApiRef[]) ?? [];
}

export const searchEquipment = (q: string): Promise<DndApiRef[]> => searchCategory('equipment', q);
export const searchMagicItems = (q: string): Promise<DndApiRef[]> => searchCategory('magic-items', q);

/** Holt eine vollständige Ressource per API-URL (relativ wie `/api/2014/equipment/warhammer` oder absolut). */
export async function getResource(urlOrPath: string): Promise<Record<string, unknown>> {
  const url = urlOrPath.startsWith('http') ? urlOrPath : `https://www.dnd5eapi.co${urlOrPath}`;
  return (await apiGet(url)) as Record<string, unknown>;
}
