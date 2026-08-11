/**
 * Die Issue-Texte sind das Einzige, was ein Nutzer von einem Deklarationsfehler zu sehen
 * bekommt — vorher war jeder davon stumm.
 *
 *   npm run test -- castingIssues
 */
import { describe, expect, it } from 'vitest';
import { groupedIssue } from '../../src/lib/services/spellcasting/grouped';
import { castingIssue, type CastingIssueKind } from '../../src/lib/services/spellcasting/source';
import type { ProjectionLookup } from '../../src/lib/services/spellcasting/project';

const KINDS: CastingIssueKind[] = [
  'unlinkedClass',
  'unknownClassKey',
  'undeclaredCasting',
  'unresolvedPatch',
  'unresolvedPool',
  'unresolvedAbilityRef',
  'unreadableSpellTable',
  'unknownBranchKey',
  'unknownSpell',
];

const LOOKUP: ProjectionLookup = {
  resourceLabel: () => '',
  spell: () => undefined,
  spellByName: () => undefined,
  className: (key) => (key === 'srd-2024_cleric' ? 'Kleriker' : ''),
};

describe('Issue-Texte', () => {
  it('hat zu jeder Issue-Art einen Text', () => {
    for (const kind of KINDS) {
      const text = groupedIssue(castingIssue(kind, 'srd-2024_cleric', 'irgendwas'), LOOKUP).text;
      expect(text, kind).toBeTruthy();
      expect(text, kind).not.toContain('undefined');
    }
  });

  it('nennt beim nicht deklarierten Zauberwirken die Klasse und die Handlung', () => {
    const text = groupedIssue(
      castingIssue('undeclaredCasting', 'srd-2024_cleric', 'FULL-Zauberwirker ohne grantsCasting'),
      LOOKUP,
    ).text;
    expect(text).toContain('Kleriker');
    expect(text).toContain('Bibliothek aktualisieren');
  });

  /** Ohne Klassennamen im Lookup bleibt der Key stehen — besser als eine leere Aussage. */
  it('fällt auf den Key zurück, wenn die Klasse keinen Namen liefert', () => {
    const text = groupedIssue(castingIssue('undeclaredCasting', 'homebrew-sam_hexer', ''), LOOKUP).text;
    expect(text).toContain('homebrew-sam_hexer');
  });

  it('benennt die unverknüpfte Klasse mit ihrem Freitext-Namen', () => {
    const text = groupedIssue(castingIssue('unlinkedClass', '', 'Kämpferin'), LOOKUP).text;
    expect(text).toContain('Kämpferin');
    expect(text).toContain('nicht mit der Bibliothek verknüpft');
  });

  it('bleibt ohne Freitext-Namen aussagefähig', () => {
    expect(groupedIssue(castingIssue('unlinkedClass', '', ''), LOOKUP).text).toContain('Eine Klasse');
  });

  it('nennt den fehlenden Bibliotheks-Key', () => {
    const text = groupedIssue(castingIssue('unknownClassKey', '', 'srd-2024_artificer'), LOOKUP).text;
    expect(text).toContain('srd-2024_artificer');
  });
});
