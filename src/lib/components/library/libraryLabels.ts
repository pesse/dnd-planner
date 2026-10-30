import type { Library } from '../../stores/libraries';

const INSTALL_LABEL: Record<Library['install'], string> = {
  installed: 'Installiert',
  update: 'Update verfügbar',
  available: 'Nicht installiert',
};

const BLOCK_LABEL: Record<NonNullable<Library['block']>, string> = {
  locked: 'Zugangscode erforderlich',
  staleCode: 'Zugangscode veraltet',
  appOutdated: 'App-Update erforderlich',
};

/** Ein Sperrgrund verdrängt die Anzeige des Installationsstands. */
export const stateLabel = (lib: Library) =>
  lib.block
    ? BLOCK_LABEL[lib.block]
    : lib.contentOutdated
      ? 'Inhalt veraltet'
      : INSTALL_LABEL[lib.install];

export const stateTone = (lib: Library): 'ok' | 'pending' | 'missing' | 'blocked' =>
  lib.block
    ? 'blocked'
    : lib.contentOutdated || lib.install === 'update'
      ? 'pending'
      : lib.install === 'installed' ? 'ok' : 'missing';

export const kib = (bytes: number) =>
  bytes >= 1048576 ? `${Math.round(bytes / 1048576)} MiB` : `${Math.max(1, Math.round(bytes / 1024))} KiB`;

export const needsCode = (lib: Library) => lib.block === 'locked' || lib.block === 'staleCode';

export const needsAppUpdate = (lib: Library) => lib.block === 'appOutdated';
