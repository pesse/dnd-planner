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
  import { classifyChange, diffMark } from '../../utils/diffHighlight';
  import type { Attack, Character } from '../../schemas/characterSchema';
  import './form.css';

  let { attacks, ctx, saved, fixLabel, onfix }: {
    attacks: Attack[];
    ctx: WeaponAttackContext;
    saved?: Character | null;
    fixLabel?: string;
    onfix?: () => void;
  } = $props();
</script>

<table class="attack-table">
  <thead><tr><th>Waffe</th><th>Bonus</th><th>Schaden</th><th>Typ</th><th>RW</th><th></th><th></th></tr></thead>
  <tbody>
    {#each attacks as atk, i}
      {@const atkDir = !saved || !atk.name.trim() ? 'none'
        : i >= (saved.attacks?.length ?? 0) ? 'up'
        : classifyChange(attackForDiff($state.snapshot(saved.attacks[i]), ctx), attackForDiff($state.snapshot(atk), ctx))}
      <tr class="attack-row" use:diffMark={atkDir}>
        <td><input bind:value={atk.name} placeholder="Langschwert" /></td>
        {#if atk.auto}
          <td><span class="computed-cell" title={attackBonusTip(atk, ctx)}>{computeAttackBonus(atk, ctx)}</span></td>
          <td><span class="computed-cell" title={attackDamageTip(atk, ctx)}>{computeAttackDamage(atk, ctx) || '—'}</span></td>
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
      {#if atk.auto}
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
              <label class="ac-field">Magie
                <input class="ac-magic" type="number" step="1"
                  value={atk.magicBonus ?? 0}
                  oninput={(e) => (atk.magicBonus = parseInt(e.currentTarget.value) || 0)} />
              </label>
            </div>

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
  {#if fixLabel}
    <button class="btn-link-all" onclick={onfix}
      title="Setzt bei diesen Zeilen den Bibliotheks-Link und rechnet Bonus/Schaden reaktiv. Wird beim Speichern übernommen.">
      🔗 {fixLabel}
    </button>
  {/if}
</div>
