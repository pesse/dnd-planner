/** Hilfethemen: Titel plus Markdown-Text aus einer Datei neben dieser. */
import { Marked } from 'marked';
import cloudflarePortrait from './cloudflarePortrait.md?raw';

export const HELP_TOPICS = {
  cloudflarePortrait: { title: 'Cloudflare für Portraits einrichten', body: cloudflarePortrait },
} as const satisfies Record<string, { title: string; body: string }>;

export type HelpTopicId = keyof typeof HELP_TOPICS;

// Nur `target="_blank"` lässt das Opener-Plugin den Link im Browser öffnen statt in der App-Webview.
const md = new Marked({
  async: false,
  renderer: {
    link({ href, tokens }) {
      return `<a href="${href}" target="_blank" rel="noreferrer">${this.parser.parseInline(tokens)}</a>`;
    },
  },
});

export const renderHelp = (id: HelpTopicId): string => md.parse(HELP_TOPICS[id].body) as string;
