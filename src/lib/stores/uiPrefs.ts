import { writable } from 'svelte/store';

/**
 * Zuletzt gewählter Anzeige-Modus der Karten-Editoren (Karte vs. Bearbeiten),
 * übergreifend über alle Entitätstypen (Item, Zauber, Monster, Encounter).
 * Beim Öffnen eines Datensatzes wird dieser Modus respektiert — statt immer
 * im Bearbeiten-Modus zu starten. Der „json"-Tab fließt bewusst nicht ein.
 */
export const preferredCardTab = writable<'karte' | 'bearbeiten'>('karte');
