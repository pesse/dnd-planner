/** Öffnet die Spieleransicht als eigenes Fenster, das sich auf Beamer oder Zweitmonitor ziehen lässt. */
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { isTauri } from '../httpFetch';

const LABEL = 'player';
const URL_PATH = '/player';

/** Ein schon offenes Fenster wird nur nach vorn geholt. */
export async function openPlayerWindow(): Promise<void> {
  if (!isTauri()) {
    window.open(URL_PATH, LABEL, 'width=1280,height=800');
    return;
  }
  const existing = await WebviewWindow.getByLabel(LABEL);
  if (existing) {
    await existing.unminimize();
    await existing.setFocus();
    return;
  }
  const win = new WebviewWindow(LABEL, {
    url: URL_PATH,
    title: 'Spieleransicht',
    width: 1280,
    height: 800,
  });
  await new Promise<void>((resolve, reject) => {
    void win.once('tauri://created', () => resolve());
    void win.once<string>('tauri://error', (e) => reject(new Error(String(e.payload))));
  });
}
