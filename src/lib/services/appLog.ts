/**
 * Frontend-Meldungen ins Logfile des Tauri-Log-Plugins
 * (Release: `%LOCALAPPDATA%\de.developer-sam.dnd-planner\logs\dnd-planner.log`).
 */
import { isTauri } from './httpFetch';

type Level = 'info' | 'warn' | 'error';

let plugin: Promise<typeof import('@tauri-apps/plugin-log')> | null = null;

export function appLog(level: Level, message: string): void {
  if (!isTauri()) return;
  plugin ??= import('@tauri-apps/plugin-log');
  // Ein fehlgeschlagener Log-Aufruf darf nichts auslösen: der `catch` unten läuft
  // bewusst ohne `console`, sonst schickt ihn `captureConsole` zurück hier herein.
  void plugin.then((m) => m[level](message)).catch(() => {});
}

function format(value: unknown): string {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Leitet `console.warn`/`console.error` zusätzlich ins Logfile. Ohne das bliebe von einem
 * Fehler im Release nichts übrig — die Webview-Konsole ist dort nicht zu öffnen.
 */
export function captureConsole(): void {
  if (!isTauri()) return;
  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      appLog(level, args.map(format).join(' '));
    };
  }
}

/** Ordner des Logfiles im Datei-Explorer zeigen. */
export async function revealLogDir(): Promise<void> {
  const [{ appLogDir }, { revealItemInDir }] = await Promise.all([
    import('@tauri-apps/api/path'),
    import('@tauri-apps/plugin-opener'),
  ]);
  await revealItemInDir(await appLogDir());
}
