/** Regelverweise (`[Liegend](rule:srd-2024_prone)`) im Regeltext: Tooltip mit der Definition. */
import { getRuleByKey, ruleDisplayName, ruleText, type RuleInfo } from '../rulesLibrary';
import { RULE_CATEGORY_DE } from '../schemas/rule';
import { sourceLabel } from '../schemas/source';
import { RULE_REF_SCHEME } from '../services/vaultLinks';
import { createRefLinks } from './refLinks.svelte';

/** Die Herkunft steht nur da, wo sie nicht das SRD ist — dort ist sie der Normalfall. */
export function ruleTipMarkdown(r: RuleInfo): string {
  const meta = [RULE_CATEGORY_DE[r.category], r.source === 'srd-2024' ? '' : sourceLabel(r.source)]
    .filter(Boolean)
    .join(' · ');
  return `**${ruleDisplayName(r)}** · *${meta}*\n\n${ruleText(r)}`;
}

const links = createRefLinks<string>({
  scheme: RULE_REF_SCHEME,
  async load(key) {
    const rule = await getRuleByKey(key);
    return rule ? ruleTipMarkdown(rule) : null;
  },
});

export const ruleRefTip = {
  get text() {
    return links.tip.data;
  },
  get x() {
    return links.tip.x;
  },
  get y() {
    return links.tip.y;
  },
};

export const ruleRefLinks = links.action;
