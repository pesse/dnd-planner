<script lang="ts">
  /**
   * Angriffe: Waffe aus der Bibliothek übernehmen, Bonus/Schaden reaktiv berechnen oder
   * manuell eintragen, dazu die benannten nicht-magischen Zusatzeffekte.
   */
  import { invoke } from '@tauri-apps/api/core';
  import { sign } from '../../utils/num';
  import { searchItems, displayName, type ItemInfo, type ItemSuggestion } from '../../itemLibrary';
  import { CATEGORY_COLORS } from '../../itemLabels';
  import {
    attackBonusTip, attackDamageTip, attackForDiff, blankAttack, buildAttackFromWeapon,
    computeAttackBonus, computeAttackDamage, toggleAttackMode, type WeaponAttackContext,
  } from '../../services/attackCalc';
  import { classifyChange, diffMark } from '../../utils/diffHighlight';
  import { createSuggestNav } from '../../utils/suggestNav.svelte';
  import { dropdownPlacement } from '../../utils/dropdownPlacement';
  import type { Attack, Character } from '../../schemas/characterSchema';
  import type { Item } from '../../types';
  import './form.css';

  let { attacks, ctx, weaponItems, saved }: {
    attacks: Attack[];
    ctx: WeaponAttackContext;
    weaponItems: ItemInfo[];
    saved?: Character | null;
  } = $props();

  let search = $state('');
  let suggestions = $state<ItemSuggestion[]>([]);

  $effect(() => {
    if (!search.trim()) { suggestions = []; nav.reset(); return; }
    suggestions = searchItems({ weapon: weaponItems }, search, 8);
    nav.reset();
  });

  async function selectWeapon(sug: ItemSuggestion) {
    try {
      const content = await invoke<string>('read_file_content', { path: sug.item.path });
      attacks.push(buildAttackFromWeapon(JSON.parse(content) as Item, ctx));
    } catch {
      // Item nicht ladbar → Auto-Angriff mit dem Namen anlegen
      attacks.push({ ...blankAttack(), name: displayName(sug.item), range: 'Nah' });
    }
    search = '';
    suggestions = [];
    nav.reset();
  }

  const nav = createSuggestNav<ItemSuggestion>({
    items: () => suggestions,
    pick: selectWeapon,
    escape: () => { suggestions = []; },
  });
</script>

<div class="autocomplete-wrap weapon-picker">
  <input placeholder="Waffe aus Bibliothek hinzufügen…" bind:value={search} onkeydown={nav.onkeydown} />
  {#if suggestions.length}
    <ul class="suggestions" use:dropdownPlacement>
      {#each suggestions as sug, i}
        <li
          class:active={i === nav.index}
          onclick={() => selectWeapon(sug)}
          onmouseenter={() => (nav.index = i)}
        >
          <span>{displayName(sug.item)}</span>
          <span class="sug-cat" style:color={CATEGORY_COLORS[sug.item.category] ?? 'var(--ink-muted)'}>
            {sug.item.category}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<table class="attack-table">
  <thead><tr><th>Waffe</th><th>Bonus</th><th>Schaden</th><th>Typ</th><th>RW</th><th></th><th></th></tr></thead>
  <tbody>
    {#each attacks as atk, i}
      {@const atkDir = !saved || !atk.name.trim() ? 'none'
        : i >= (saved.attacks?.length ?? 0) ? 'up'
        : classifyChange(attackForDiff($state.snapshot(saved.attacks[i]), ctx), attackForDiff($state.snapshot(atk), ctx))}
      <tr use:diffMark={atkDir}>
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
                  <option value="ges">GES ({sign(ctx.gesMod)})</option>
                  <option value="finesse">Finesse ({sign(Math.max(ctx.strMod, ctx.gesMod))})</option>
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
    {/each}
  </tbody>
</table>
<button class="btn-add" onclick={() => attacks.push(blankAttack())}>+ Angriff</button>
