/** `@tauri-apps/api/app` im Browser unter `npm run dev:vault`. */
import { invoke } from './tauriCoreBrowser';

export const getVersion = (): Promise<string> => invoke<string>('app_version');
