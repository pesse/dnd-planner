/** Eine Zeile der Wizard-Seitenleiste: Klartext oder ein Verweis mit Tooltip. `prefix` steht davor („Zaubertrick: "). */
import type { FeatEntry } from '$lib/featsLibrary';

export type Fact =
  | { kind: 'text'; text: string }
  | { kind: 'feature'; prefix?: string; name: string; text: string; choice?: string; pinned?: boolean }
  | { kind: 'feat'; prefix?: string; feat: FeatEntry; name?: string }
  | { kind: 'spell'; prefix?: string; name: string; key: string };

export interface FactGroup {
  heading: string;
  facts: Fact[];
}
