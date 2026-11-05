/** Gerendert von components/NameDialog.svelte. */
import { promptDialog } from './promptDialog';

export interface NameRequest {
  title: string;
  placeholder: string;
  confirmLabel: string;
}

const channel = promptDialog<NameRequest, string | null>();

export const namePrompt = channel.prompt;

/** Der eingegebene Name, getrimmt; `null` bei Abbruch. */
export const askName = (opts: { title: string; placeholder?: string; confirmLabel?: string }): Promise<string | null> =>
  channel.ask({ title: opts.title, placeholder: opts.placeholder ?? 'Name', confirmLabel: opts.confirmLabel ?? 'Anlegen' });
