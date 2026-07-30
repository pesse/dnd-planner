/**
 * Fortlaufende, PRO STUFE wirkende Merkmals-Effekte — deterministisch aus `grants.perLevel`
 * der Bibliothek (`featureGrantSchema`, schemas/shared.ts).
 *
 * Ersetzt `aiActions/levelUpEffectsAction.ts`: ein Reasoning-Call, der den KOMPLETTEN
 * Merkmalsbestand des Charakters nach genau zwei Fällen durchsuchte, die im Vault stehen —
 * Zwergische Zähigkeit (+1/Stufe) und das Talent „Zäh" (+2/Stufe). Der Prompt nannte beide
 * selbst als Beispiel; damit war er eine Suchfunktion über Daten, die schon strukturiert
 * vorliegen konnten.
 *
 * Wie `spellAccess.ts`/`weaponMastery.ts` die deterministische Antwort auf ein geschlossenes
 * Vokabular. Der Einmal-Schub beim Erwerb („Zäh": zweifache Charakterstufe) ist bewusst NICHT
 * modelliert — er war es auch vorher nicht (Regel 4 des alten Prompts schloss ihn aus).
 */
import type { FeatureGrant } from '../schemas/shared';

/** Ein Merkmal, wie beide Flows es liefern können: Identität + Deklaration. */
export interface PerLevelFeature {
  key?: string;
  name: string;
  grants?: FeatureGrant;
}

/**
 * Eine beitragende Quelle. Feldnamen wie bisher, damit `buildDoc`/`ongoingChanges`
 * (levelUpMachine.ts) unverändert bleiben.
 */
export interface PerLevelSource {
  feature: string;
  sourceKey: string;
  amount: number;
}

/**
 * Die TP-Beiträge je Stufe, dedupliziert über Key (ersatzweise Name): derselbe Merkmalstext
 * erreicht die Flows aus mehreren Richtungen — als Bibliotheks-Trait, als neu gewonnenes
 * Merkmal und als Talent-Link. Ohne Dedup zählte „Zäh" beim Erwerbs-Aufstieg doppelt.
 */
export function hpPerLevelSources(features: PerLevelFeature[]): PerLevelSource[] {
  const seen = new Set<string>();
  const out: PerLevelSource[] = [];
  for (const f of features) {
    const id = f.key || f.name.trim().toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const amount = f.grants?.perLevel?.hpMax ?? 0;
    if (amount) out.push({ feature: f.name, sourceKey: f.key ?? '', amount });
  }
  return out;
}

/** Summe der pro-Stufe-Beiträge (× gewonnene Stufen wendet der Aufrufer an). */
export function hpPerLevelSum(sources: PerLevelSource[]): number {
  return sources.reduce((sum, s) => sum + s.amount, 0);
}
