/** Was der Open5e-Mapper braucht — `invoke`-frei, weil der MM-Importer ihn bündelt. */

/** Standard-Quelle: SRD 5.2 (passt zur deutschen 5.2.1-Terminologie der App). */
export const DEFAULT_DOCUMENT = 'srd-2024';

export const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
