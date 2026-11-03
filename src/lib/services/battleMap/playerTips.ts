/** Regeltexte, die das Spielerfenster beim Überfahren zeigt — es liest den Vault nicht selbst. */
import { getRuleByKey } from '../../rulesLibrary';
import { ruleTipMarkdown } from '../../components/ruleRefLinks.svelte';
import { BADGE_KEYS } from '../../conditionIcon';

export const BLOODIED_TIP = 'bloodied';

/** Schlüssel wie im Token: Zustand bzw. Effekt, dazu `bloodied`. */
export async function loadPlayerTips(): Promise<Record<string, string>> {
  const keys = [...BADGE_KEYS, BLOODIED_TIP];
  const rules = await Promise.all(keys.map((k) => getRuleByKey(`srd-2024_${k}`)));
  return Object.fromEntries(keys.flatMap((k, i) => (rules[i] ? [[k, ruleTipMarkdown(rules[i])]] : [])));
}
