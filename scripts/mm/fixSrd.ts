/**
 * Zieht die englische Seite eines SRD-Monsters auf den MM-Statblock nach. Der Abgleich mit dem
 * englischen SRD-5.2.1-PDF hat gezeigt: wo beide abweichen, ist der Fehler fast immer der
 * Open5e-Import. Das Deutsch (aus dem deutschen SRD-PDF) bleibt unberührt.
 */
import type { Monster, MonsterAction, MonsterTrait } from '$lib/schemas/monster';
import { text } from './compareSrd';

/** Produktnamen, die das SRD weglässt („Acid Arrow" statt „Melf's Acid Arrow"). */
const PRODUCT_NAMES = /\b(Melf|Tasha|Bigby|Mordenkainen|Otiluke|Otto|Leomund|Evard|Drawmij|Nystul|Rary|Tenser)'s\b/;

const baseName = (name: string) => name.replace(/\s*\((?:Recharge [^)]*|\d+\/Day[^)]*)\)/i, '').replace(/\s+/g, ' ').trim();

/** Paare über den englischen Namen; je ein namenloser Rest auf beiden Seiten gehört zusammen. */
function pair<T extends MonsterTrait>(mm: T[], srd: T[], id: (e: T) => string): Map<T, T> {
  const out = new Map<T, T>();
  for (const s of srd) {
    const m = mm.find((x) => id(x) === id(s));
    if (m) out.set(s, m);
  }
  const restSrd = srd.filter((s) => !out.has(s));
  const taken = new Set(out.values());
  const restMm = mm.filter((m) => !taken.has(m));
  if (restSrd.length === 1 && restMm.length === 1 && !restSrd[0].name_en) out.set(restSrd[0], restMm[0]);
  return out;
}

function syncText(srd: MonsterTrait, mm: MonsterTrait, log: string[], where: string): void {
  if (!srd.name_en) {
    srd.name_en = mm.name_en;
    log.push(`${where}: name_en ergänzt`);
  }
  // Nur inhaltliche Abweichungen; Open5es fehlendes „Hit:" allein ist keine.
  if (text(srd.desc_en) === text(mm.desc_en) || PRODUCT_NAMES.test(mm.desc_en)) return;
  srd.desc_en = mm.desc_en;
  log.push(`${where}: desc_en`);
}

const actionId = (a: MonsterAction) => `${a.action_type}:${baseName(a.name_en)}`;

/** Gedruckte Reihenfolge des MM; was dort fehlt, bleibt hinten stehen. */
function inMmOrder<T>(srd: T[], pairs: Map<T, T>, mm: T[]): T[] {
  const rank = (e: T) => (pairs.has(e) ? mm.indexOf(pairs.get(e)!) : mm.length);
  return [...srd].sort((a, b) => rank(a) - rank(b));
}

export function fixSrdFromMm(srd: Monster, mm: Monster): string[] {
  const log: string[] = [];
  const name = srd.name_en;
  if (srd.size !== mm.size) {
    log.push(`${name}: size ${srd.size} → ${mm.size}`);
    srd.size = mm.size;
  }

  const traits = pair(mm.traits, srd.traits, (t) => t.name_en);
  for (const [s, m] of traits) syncText(s, m, log, `${name} / ${m.name_en}`);

  const actions = pair(mm.actions, srd.actions, actionId);
  for (const [s, m] of actions) {
    const where = `${name} / ${m.name_en}`;
    syncText(s, m, log, where);
    const hasLimitInName = baseName(s.name_en) !== s.name_en;
    if (m.usage_limits && !s.usage_limits && !hasLimitInName) {
      s.usage_limits = m.usage_limits;
      log.push(`${where}: usage_limits`);
    }
    if (s.action_type === 'LEGENDARY_ACTION' && s.legendary_action_cost !== m.legendary_action_cost) {
      s.legendary_action_cost = m.legendary_action_cost;
      log.push(`${where}: legendary_action_cost`);
    }
    if (m.attacks.length && JSON.stringify(s.attacks) !== JSON.stringify(m.attacks)) {
      s.attacks = m.attacks;
      log.push(`${where}: attacks`);
    }
  }

  const traitOrder = inMmOrder(srd.traits, traits, mm.traits);
  const actionOrder = inMmOrder(srd.actions, actions, mm.actions);
  if (traitOrder.some((t, i) => t !== srd.traits[i]) || actionOrder.some((a, i) => a !== srd.actions[i])) {
    log.push(`${name}: Reihenfolge`);
  }
  srd.traits = traitOrder;
  srd.actions = actionOrder;

  for (const t of mm.traits) if (![...traits.values()].includes(t)) log.push(`${name}: ⚠ Merkmal „${t.name_en}" fehlt im Vault`);
  for (const a of mm.actions) if (![...actions.values()].includes(a)) log.push(`${name}: ⚠ Aktion „${a.name_en}" fehlt im Vault`);
  return log;
}
