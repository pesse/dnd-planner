/** Die Merkmale des aktuellen Stands, nachgeladen, sobald sich Volk, Klassen, Hintergrund oder Talent-Links ändern. */
import { ownedGrantFeatures, type OwnedGrantFeature, type OwnedLinks as Links } from './hitPoints';

export interface OwnedGrantFeatures {
  /** null bis zum ersten Laden; beim Nachladen bleibt der alte Stand stehen. */
  readonly current: OwnedGrantFeature[] | null;
  readonly failed: boolean;
}

export function createOwnedGrantFeatures(input: () => Links | null): OwnedGrantFeatures {
  let current = $state<OwnedGrantFeature[] | null>(null);
  let failed = $state(false);
  // Nur die Links sind Abhängigkeit des Ladens — kein Neuladen bei jedem Tastendruck im Formular.
  const links = $derived.by(() => {
    const c = input();
    return c && {
      species: { ...c.species },
      classes: c.classes.map((k) => ({ ...k })),
      features: (c.features ?? []).map((f) => ({ ...f })),
      backgroundRef: { ...c.backgroundRef },
    };
  });
  $effect(() => {
    const c = links;
    if (!c) return;
    let cancelled = false;
    void ownedGrantFeatures(c)
      .then((f) => { if (!cancelled) { current = f; failed = false; } })
      .catch(() => { if (!cancelled) { current = null; failed = true; } });
    return () => { cancelled = true; };
  });
  return {
    get current() { return current; },
    get failed() { return failed; },
  };
}
