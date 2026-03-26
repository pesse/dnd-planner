import { writable } from 'svelte/store';
import type { Campaign, FileEntry } from '../types';

export const activeCampaign = writable<Campaign | null>(null);
export const openFiles = writable<FileEntry[]>([]);
export const activeFile = writable<FileEntry | null>(null);
export const fileContent = writable<string>('');
