<script lang="ts">
  /**
   * Angriffe: Bonus/Schaden reaktiv berechnen oder manuell eintragen, dazu die
   * benannten nicht-magischen Zusatzeffekte.
   */
  import { sign } from '../../utils/num';
  import {
    attackBonusTip, attackDamageTip, attackForDiff, blankAttack,
    computeAttackBonus, computeAttackDamage, toggleAttackMode, type WeaponAttackContext,
  } from '../../services/attackCalc';
  import { staleMagicBonus } from '../../services/attackEffects';
  import { buildAttackFromSpell, type SpellAttackOption } from '../../services/spellAttacks';
  import { ABILITY_ABBR_DE, ABILITY_KEYS, type AbilityKey } from '../../schemas/abilities';
  import { classifyChange, diffMark } from '../../utils/diffHighlight';
  import type { Attack, Character } from '../../schemas/characterSchema';
  import { textTip } from '../textTip.svelte';
  import './form.css';

  let { attacks, ctx, saved, fixes = [], spellOptions = [] }: {
    attacks: Attack[];
    ctx: WeaponAttackContext;
    saved?: Character | null;
    fixes?: { label: string; onfix: () => void }[];
    /** Zauber des Charakters mit `attack`-Block; leer, solange das Zauberwirken lädt. */
    spellOptions?: SpellAttackOption[];
  } = $props();

  const listed = $derived(new Set(attacks.flatMap((a) => (a.spell ? [a.spell.key] : []))));
  const freeSpells = $derived(spellOptions.filter((o) => !listed.has(o.key)));

  /** Ohne Quelle (Homebrew-Extra) das stärkste Zauberattribut — änderbar in der Zeile. */
  function abilityFor(o: SpellAttackOption): AbilityKey {
    if (o.ability) return o.ability;
    const mods = ctx.spells?.mods;
    return (['int', 'wis', 'cha'] as const).reduce((best, k) => ((mods?.[k] ?? 0) > (mods?.[best] ?? 0) ? k : best));
  }

  function addSpell(key: string) {
    const o = spellOptions.find((x) => x.key === key);
    if (o) attacks.push(buildAttackFromSpell(o.info, abilityFor(o), ctx));
  }

  const gradeLabel = (level: number): string => (level === 0 ? 'Zaubertrick' : `Grad ${level}`);
</script>

{#snippet modifierRows(atk: Attack)}
<!-- Nicht-magische Effekte (Kampfstil, Segen …). Gehören hierher und nicht
     ins Feld „Magie", sonst wandert Nicht-Magisches in die Gegenstands-Logik. -->
<div class="attack-mods">
  {#each atk.modifiers ?? [] as m, j}
    <div class="am-row">
      <input class="am-label" bind:value={m.label} placeholder="Kampfstil „Bogenschießen“" />
      <label class="ac-field">Angriff
        <input class="am-num" type="number" step="1"
          value={m.attackBonus}
          oninput={(e) => (m.attackBonus = parseInt(e.currentTarget.value) || 0)} />
      </label>
      <label class="ac-field">Schaden
        <input class="am-num" type="number" step="1"
          value={m.damageBonus}
          oninput={(e) => (m.damageBonus = parseInt(e.currentTarget.value) || 0)} />
      </label>
      <button type="button" class="remove-btn" title="Effekt entfernen"
        onclick={() => atk.modifiers?.splice(j, 1)}>✕</button>
    </div>
  {/each}
  <button type="button" class="am-add"
    onclick={() => (atk.modifiers = [...(atk.modifiers ?? []), { label: '', attackBonus: 0, damageBonus: 0 }])}>+ Effekt</button>
</div>
{/snippet}

<table class="attack-table">
  <thead><tr><th>Angriff</th><th>Bonus</th><th>Schaden</th><th>Typ</th><th>RW</th><th></th><th></th></tr></thead>
  <tbody>
    {#each attacks as atk, i}
      {@const atkDir = !saved || !atk.name.trim() ? 'none'
        : i >= (saved.attacks?.length ?? 0) ? 'up'
        : classifyChange(attackForDiff($state.snapshot(saved.attacks[i]), ctx), attackForDiff($state.snapshot(atk), ctx))}
      {@const libMagic = atk.spell ? undefined : staleMagicBonus(atk, ctx.declared?.weaponOf(atk))}
      <tr class="attack-row" use:diffMark={atkDir}>
        <td class:spell-name={atk.spell}>
          <input bind:value={atk.name} placeholder="Langschwert" />
          {#if atk.spell}<span class="spell-tag" title="Zauber — Werte aus der Zauberbibliothek">✦</span>{/if}
        </td>
        {#if atk.auto}
          <td><span class="computed-cell" use:textTip={attackBonusTip(atk, ctx)}>{computeAttackBonus(atk, ctx)}</span></td>
          <td><span class="computed-cell" use:textTip={attackDamageTip(atk, ctx)}>{computeAttackDamage(atk, ctx) || '—'}</span></td>
        {:else}
          <td><input bind:value={atk.bonus} placeholder="+5" /></td>
          <td><input bind:value={atk.damage} placeholder="1W8+3" /></td>
        {/if}
        <td><input bind:value={atk.type} placeholder="Hieb" /></td>
        <td><input bind:value={atk.range} placeholder="Nah" /></td>
        <td>
          <button type="button" class="mode-btn" class:active={atk.auto}
            title={atk.auto ? 'Reaktiv berechnet – klicken für manuelle Eingabe' : 'Manuell – klicken für automatische Berechnung'}
            onclick={() => toggleAttackMode(atk, ctx)}>{atk.auto ? '🔗' : '✎'}</button>
        </td>
        <td><button class="remove-btn" onclick={() => attacks.splice(i, 1)}>✕</button></td>
      </tr>
      {#if atk.auto && atk.spell}
        {@const sp = atk.spell}
        {@const lib = ctx.spells?.spellOf(sp.key)}
        <tr class="attack-auto-row">
          <td colspan="7">
            <div class="auto-controls">
              <label class="ac-field">Zauberattribut
                <select bind:value={atk.spell.ability}>
                  {#each ABILITY_KEYS as k (k)}
                    <option value={k}>{ABILITY_ABBR_DE[k]} ({sign(ctx.spells?.mods[k] ?? 0)})</option>
                  {/each}
                </select>
              </label>
              {#if lib && lib.level > 0 && lib.attack.upcast}
                <label class="ac-field">Gewirkt auf
                  <select value={sp.slotLevel ?? lib.level}
                    onchange={(e) => {
                      const v = parseInt(e.currentTarget.value);
                      if (v > lib.level) sp.slotLevel = v;
                      else delete sp.slotLevel;
                    }}>
                    {#each Array.from({ length: 10 - lib.level }, (_, i) => lib.level + i) as lvl (lvl)}
                      <option value={lvl}>{gradeLabel(lvl)}</option>
                    {/each}
                  </select>
                </label>
              {:else if lib}
                <span class="ac-field">{gradeLabel(lib.level)}</span>
              {:else}
                <span class="ac-field stale">Zauber nicht in der Bibliothek</span>
              {/if}
              <label class="ac-field">Magie
                <input class="ac-magic" type="number" step="1"
                  value={atk.magicBonus ?? 0}
                  oninput={(e) => (atk.magicBonus = parseInt(e.currentTarget.value) || 0)} />
              </label>
            </div>
            {@render modifierRows(atk)}
          </td>
        </tr>
      {:else if atk.auto}
        <tr class="attack-auto-row">
          <td colspan="7">
            <div class="auto-controls">
              <label class="ac-field">Attribut
                <select bind:value={atk.ability}>
                  <option value="str">STR ({sign(ctx.strMod)})</option>
                  <option value="dex">GES ({sign(ctx.dexMod)})</option>
                  <option value="finesse">Finesse ({sign(Math.max(ctx.strMod, ctx.dexMod))})</option>
                </select>
              </label>
              <label class="ac-check">
                <input type="checkbox" bind:checked={atk.proficient} /> geübt (+{ctx.proficiencyBonus})
              </label>
              <label class="ac-field">Würfel
                <input class="ac-dice" bind:value={atk.baseDamage} placeholder="1W8" />
              </label>
              <label class="ac-field" class:stale={libMagic !== undefined}
                title={libMagic !== undefined ? `Laut Bibliothek ${sign(libMagic)}` : undefined}>Magie
                <input class="ac-magic" type="number" step="1"
                  value={atk.magicBonus ?? 0}
                  oninput={(e) => (atk.magicBonus = parseInt(e.currentTarget.value) || 0)} />
              </label>
            </div>

            {@render modifierRows(atk)}
          </td>
        </tr>
      {/if}
      <tr class="attack-note-row">
        <td colspan="7">
          <div class="an-card" class:standalone={!atk.auto}>
            <label class="ac-field an-note">Notiz
              <input bind:value={atk.note} placeholder="+1W6 jede lange Rast" />
            </label>
          </div>
        </td>
      </tr>
    {/each}
  </tbody>
</table>
<div class="inv-actions">
  <button class="btn-add" onclick={() => attacks.push(blankAttack())}>+ Angriff</button>
  {#if freeSpells.length}
    <select class="spell-add" value=""
      onchange={(e) => { addSpell(e.currentTarget.value); e.currentTarget.value = ''; }}>
      <option value="" disabled>+ Zauber als Angriff …</option>
      {#each freeSpells as o (o.key)}
        <option value={o.key}>{o.info.name} ({gradeLabel(o.info.level)})</option>
      {/each}
    </select>
  {/if}
  {#each fixes as fix (fix.label)}
    <button class="btn-link-all" onclick={fix.onfix} title="Wird beim Speichern übernommen.">
      🔗 {fix.label}
    </button>
  {/each}
</div>

<style>
  .spell-name { white-space: nowrap; }
  .spell-name input { width: calc(100% - 1.2rem); }
  .spell-tag { margin-left: 0.25rem; color: var(--copper); cursor: help; }
  .spell-add { width: auto; font-size: 0.8rem; }
</style>
