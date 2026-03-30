import type { FileEntry } from '../types';

/** Required ## sections per file type. Types not listed here are not validated. */
const REQUIRED_SECTIONS: Partial<Record<FileEntry['type'], string[]>> = {
  act:     ['Summary', 'Ergebnis', 'Details'],
  npc:     ['Summary', 'Motivations', 'Details'],
  world:   ['Summary', 'Details'],
};

const SECTION_PLACEHOLDERS: Record<string, string> = {
  Summary:     '_Brief overview (2-3 sentences)._',
  Ergebnis:    '_What did the players accomplish or change?_',
  Details:     '### Inhalt\n\n_Details hier eintragen._',
  Motivations: '_What does this NPC want? What drives them?_',
};

function hasSection(content: string, section: string): boolean {
  return new RegExp(`^##\\s+${section}\\s*$`, 'im').test(content);
}

export interface TemplateValidation {
  required: string[];
  missing: string[];
  valid: boolean;
}

/**
 * Returns null for file types without a required structure (campaign, character, unknown).
 * Returns a TemplateValidation object otherwise.
 */
export function validateTemplate(
  type: FileEntry['type'] | undefined,
  content: string
): TemplateValidation | null {
  if (!type) return null;
  const required = REQUIRED_SECTIONS[type];
  if (!required) return null;

  const missing = required.filter((s) => !hasSection(content, s));
  return { required, missing, valid: missing.length === 0 };
}

/**
 * Appends any missing required sections to the document, in template order.
 * Existing sections are preserved as-is.
 */
export function fixTemplate(type: FileEntry['type'] | undefined, content: string): string {
  if (!type) return content;
  const required = REQUIRED_SECTIONS[type];
  if (!required) return content;

  let result = content.trimEnd();
  for (const section of required) {
    if (!hasSection(result, section)) {
      const placeholder = SECTION_PLACEHOLDERS[section] ?? '_Inhalt hier eintragen._';
      result += `\n\n## ${section}\n\n${placeholder}`;
    }
  }
  return result;
}
