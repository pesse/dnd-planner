export interface Frontmatter {
  /** undefined = key not present; [] = explicitly empty */
  characters?: string[];
}

/**
 * Verkraftet auch vom Linter umformatiertes YAML (Leerzeilen, uneingerückte Listen).
 * `rawBlock` enthält die Trenner mit, damit das Dokument verlustfrei zurückgeschrieben wird.
 */
export function parseFrontmatter(markdown: string): { frontmatter: Frontmatter; body: string; rawBlock: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: {}, body: markdown, rawBlock: '' };

  const rawBlock = match[0];
  const yamlStr = match[1];
  const body = markdown.slice(rawBlock.length);
  const frontmatter: Frontmatter = {};

  const lines = yamlStr.split('\n');
  let inCharacters = false;
  let foundCharacters = false;
  const characters: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'characters:') {
      inCharacters = true;
      foundCharacters = true;
      continue;
    }

    if (inCharacters) {
      if (trimmed === '') continue; // blank line — keep collecting
      if (trimmed.startsWith('- ')) {
        characters.push(trimmed.slice(2).trim());
      } else if (trimmed.startsWith('-')) {
        characters.push(trimmed.slice(1).trim());
      } else {
        inCharacters = false;
      }
    }
  }

  // Inline style: `characters: [a, b]` or `characters: []`
  if (!foundCharacters) {
    const inlineMatch = yamlStr.match(/^characters:\s*\[([^\]]*)\]/m);
    if (inlineMatch) {
      foundCharacters = true;
      characters.push(
        ...inlineMatch[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
    }
  }

  if (foundCharacters) frontmatter.characters = characters;

  return { frontmatter, body, rawBlock };
}

/** Returns the markdown body without frontmatter. */
export function stripFrontmatter(markdown: string): string {
  return parseFrontmatter(markdown).body;
}

/** Builds a canonical frontmatter block for the given character slugs. */
export function buildFrontmatterBlock(characters: string[]): string {
  if (characters.length === 0) return '---\ncharacters: []\n---\n';
  const items = characters.map((s) => `  - ${s}`).join('\n');
  return `---\ncharacters:\n${items}\n---\n`;
}

/** Replaces the characters list in a markdown file's frontmatter.
 *  Inserts a frontmatter block if none exists yet.
 */
export function replaceFrontmatterCharacters(markdown: string, characters: string[]): string {
  const { body } = parseFrontmatter(markdown);
  return buildFrontmatterBlock(characters) + body;
}
