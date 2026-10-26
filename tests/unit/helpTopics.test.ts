import { describe, expect, it } from 'vitest';
import { HELP_TOPICS, renderHelp, type HelpTopicId } from '../../src/lib/help/topics';

describe('Hilfethemen', () => {
  it.each(Object.keys(HELP_TOPICS) as HelpTopicId[])('%s öffnet jeden Link außerhalb der App', (id) => {
    const html = renderHelp(id);
    const links = html.match(/<a [^>]*>/g) ?? [];
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) expect(a).toContain('target="_blank"');
  });
});
