/** Welcher Tab des Karten-Cockpits offen ist; bleibt über das Schließen der Karte hinweg stehen. */
export type CockpitTab = 'prep' | 'play';

export const cockpit = $state<{ tab: CockpitTab }>({ tab: 'prep' });
