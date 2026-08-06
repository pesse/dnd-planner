/**
 * Der Verweis-Umschreiber der UID-Umstellung. Er fasst Kampagnen- und Sitzungsdateien an,
 * die der Nutzer selbst pflegt — was nicht im Mapping steht, muss unangetastet bleiben.
 *
 *   npm run test -- migrateCharacterUids
 */
import { describe, expect, it } from 'vitest';
import { remapCharacterRefs } from '../../src/lib/services/migrateCharacterUids';

const MAP = new Map([
  ['carric_galanodel', '23cbb024a6a3'],
  ['phönix', 'b985d2b5d167'],
]);

describe('Verweise auf Charakterordner umschreiben', () => {
  it('ersetzt die gemappten Einträge der Listenform und lässt den Rest stehen', () => {
    const md = '---\ncharacters:\n  - carric_galanodel\n  - phönix\n  - fremder_slug\n---\n# Kampagne\n';
    expect(remapCharacterRefs(md, MAP)).toBe(
      '---\ncharacters:\n  - 23cbb024a6a3\n  - b985d2b5d167\n  - fremder_slug\n---\n# Kampagne\n',
    );
  });

  it('beherrscht die Inline-Form', () => {
    const md = '---\ncharacters: [carric_galanodel, fremder_slug]\n---\nText\n';
    expect(remapCharacterRefs(md, MAP)).toBe('---\ncharacters: [23cbb024a6a3, fremder_slug]\n---\nText\n');
  });

  it('lässt eine Datei ohne characters-Schlüssel zeichengleich', () => {
    const md = '# Sitzung 3\n\nDie Gruppe traf carric_galanodel im Wirtshaus.\n';
    expect(remapCharacterRefs(md, MAP)).toBe(md);
  });

  it('rührt Listen unter anderen Schlüsseln nicht an', () => {
    const md = '---\ntags:\n  - phönix\ncharacters:\n  - phönix\n---\n';
    expect(remapCharacterRefs(md, MAP)).toBe('---\ntags:\n  - phönix\ncharacters:\n  - b985d2b5d167\n---\n');
  });

  it('zieht auch Markdown-Links auf den Charakterordner mit', () => {
    const md = '# Notiz\n\nSiehe [Carric](../../characters/carric_galanodel) und ./vault/characters/phönix/.\n';
    expect(remapCharacterRefs(md, MAP)).toBe(
      '# Notiz\n\nSiehe [Carric](../../characters/23cbb024a6a3) und ./vault/characters/b985d2b5d167/.\n',
    );
  });

  it('ist wiederholbar: ein zweiter Lauf ändert nichts mehr', () => {
    const md = '---\ncharacters:\n  - carric_galanodel\n---\n';
    const once = remapCharacterRefs(md, MAP);
    expect(remapCharacterRefs(once, MAP)).toBe(once);
  });
});
