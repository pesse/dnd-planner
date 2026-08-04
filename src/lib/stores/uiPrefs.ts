import { writable } from 'svelte/store';

/**
 * Ein gemeinsamer Modus für alle Karten-Editoren, nicht einer je Entitätstyp.
 * Der „json"-Tab wird bewusst nicht gemerkt.
 */
export const preferredCardTab = writable<'karte' | 'bearbeiten'>('karte');
