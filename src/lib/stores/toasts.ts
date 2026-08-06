import { writable } from 'svelte/store';

/** Die Handlung, die den Hinweis erst brauchbar macht — z.B. den zuständigen Dialog öffnen. */
export interface ToastAction {
  label: string;
  run(): void;
}

export interface Toast {
  id: number;
  message: string;
  kind: 'error' | 'notice';
  action?: ToastAction;
}

let _next = 1;
export const toasts = writable<Toast[]>([]);

function push(toast: Omit<Toast, 'id'>) {
  const id = _next++;
  toasts.update(list => [...list, { id, ...toast }]);
}

export function pushError(message: string) {
  push({ message, kind: 'error' });
}

export function pushNotice(message: string, action?: ToastAction) {
  push({ message, kind: 'notice', action });
}

export function dismissToast(id: number) {
  toasts.update(list => list.filter(t => t.id !== id));
}
