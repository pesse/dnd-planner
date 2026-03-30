import { writable } from 'svelte/store';

export interface AppError {
  id: number;
  message: string;
}

let _next = 1;
export const appErrors = writable<AppError[]>([]);

export function pushError(message: string) {
  const id = _next++;
  appErrors.update(list => [...list, { id, message }]);
}

export function dismissError(id: number) {
  appErrors.update(list => list.filter(e => e.id !== id));
}
