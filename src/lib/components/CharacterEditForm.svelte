<script lang="ts">
  import { SKILL_DEFS, type CharacterData, type SpellEntry } from '../pdf/characterFields';
  import { getSpellLibrary, searchSpells, SCHOOL_COLORS, type SpellInfo, type SpellSuggestion } from '../spellLibrary';

  let { character, onSave, onCancel }: {
    character: CharacterData;
    onSave: (data: CharacterData) => void;
    onCancel: () => void;
  } = $props();

  // ─── Felder ────────────────────────────────────────────
  let name = $state(character.name ?? '');
  let classLevel = $state(character.classLevel ?? '');
  let playerName = $state(character.playerName ?? '');
  let background = $state(character.background ?? '');
  let race = $state(character.race ?? '');
  let xp = $state(character.xp ?? '');

  let str = $state(character.str ?? 10);
  let ges = $state(character.ges ?? 10);
  let kon = $state(character.kon ?? 10);
  let int = $state(character.int ?? 10);
  let wei = $state(character.wei ?? 10);
  let cha = $state(character.cha ?? 10);

  let ac = $state(character.ac ?? '');
  let speed = $state(character.speed ?? '');
  let hpMax = $state(character.hpMax ?? '');
  let hpCurrent = $state(character.hpCurrent ?? '');
  let hpTemp = $state(character.hpTemp ?? '');
  let proficiencyBonus = $state(character.proficiencyBonus ?? 2);
  let hitDice = $state(character.hitDice ?? '');

  let strSaveProf = $state(character.strSaveProf ?? false);
  let gesSaveProf = $state(character.gesSaveProf ?? false);
  let konSaveProf = $state(character.konSaveProf ?? false);
  let intSaveProf = $state(character.intSaveProf ?? false);
  let weiSaveProf = $state(character.weiSaveProf ?? false);
  let chaSaveProf = $state(character.chaSaveProf ?? false);

  let alleskoenner = $state(character.alleskoenner ?? false);

  let skillFlags = $state<Record<string, { prof: boolean; exp: boolean }>>(
    Object.fromEntries(SKILL_DEFS.map(s => [s.key, {
      prof: character.skills[s.key]?.prof ?? false,
      exp: character.skills[s.key]?.exp ?? false,
    }]))
  );

  let attacks = $state(character.attacks.map(a => ({ ...a })));
  let classFeatures = $state(character.classFeatures ?? '');
  let traits = $state(character.traits ?? '');
  let ideals = $state(character.ideals ?? '');
  let bonds = $state(character.bonds ?? '');
  let flaws = $state(character.flaws ?? '');

  let languages = $state([...character.languages]);
  let tools = $state([...character.tools]);
  let langInput = $state('');
  let toolInput = $state('');

  let currency = $state({ ...character.currency });
  let inventory = $state(character.inventory.map(i => ({ ...i })));
  let inventoryNotes = $state(character.inventoryNotes ?? '');

  // ─── Zauber ──────────────────────────────────────────────
  let spellClass = $state(character.spells?.spellcastingClass ?? '');
  let spellAbility = $state(character.spells?.spellcastingAbility ?? '');
  let spellSaveDC = $state(character.spells?.saveDC ?? 0);
  let spellAttackBonus = $state(character.spells?.attackBonus ?? 0);
  let slotTotals = $state(Array.from({ length: 9 }, (_, i) => character.spells?.slots[i]?.total ?? 0));
  let cantrips = $state([...(character.spells?.cantrips ?? [])]);
  let cantripInput = $state('');
  let spellsByLevel = $state<Record<string, SpellEntry[]>>(
    Object.fromEntries(
      Object.entries(character.spells?.byLevel ?? {}).map(([k, v]) => [k, v.map(s => ({ ...s }))])
    )
  );
  let spellInput = $state('');
  let spellInputLvl = $state('1');
  let spellInputPrepared = $state(false);

  // ─── Zauber-Autocomplete ─────────────────────────────────
  let spellLibrary = $state<SpellInfo[]>([]);
  let cantripSuggestions = $state<SpellSuggestion[]>([]);
  let spellSuggestions = $state<SpellSuggestion[]>([]);
  let cantripSugIndex = $state(-1);
  let spellSugIndex = $state(-1);

  $effect(() => {
    getSpellLibrary().then(lib => { spellLibrary = lib; });
  });

  const spellSchoolMap = $derived(
    new Map(spellLibrary.map(s => [s.name, s.school]))
  );

  function spellColor(name: string): string {
    const school = spellSchoolMap.get(name);
    return school ? (SCHOOL_COLORS[school] ?? '') : '';
  }

  $effect(() => {
    cantripSuggestions = cantripInput.length > 0
      ? searchSpells(spellLibrary, cantripInput, 0, spellClass)
      : [];
    cantripSugIndex = -1;
  });

  $effect(() => {
    spellSuggestions = spellInput.length > 0
      ? searchSpells(spellLibrary, spellInput, Number(spellInputLvl), spellClass)
      : [];
    spellSugIndex = -1;
  });

  function selectCantripSuggestion(name: string) {
    if (!cantrips.includes(name)) cantrips.push(name);
    cantripInput = '';
    cantripSuggestions = [];
  }

  function selectSpellSuggestion(name: string) {
    const existing = spellsByLevel[spellInputLvl] ?? [];
    spellsByLevel[spellInputLvl] = [...existing, { name, prepared: spellInputPrepared }];
    spellInput = '';
    spellInputPrepared = false;
    spellSuggestions = [];
  }

  function onCantripKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); cantripSugIndex = Math.min(cantripSugIndex + 1, cantripSuggestions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cantripSugIndex = Math.max(cantripSugIndex - 1, -1); }
    else if (e.key === 'Escape') { cantripSuggestions = []; }
    else if (e.key === 'Enter') {
      if (cantripSugIndex >= 0 && cantripSuggestions[cantripSugIndex]) {
        selectCantripSuggestion(cantripSuggestions[cantripSugIndex].spell.name);
      } else {
        addCantrip();
      }
    }
  }

  function onSpellKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); spellSugIndex = Math.min(spellSugIndex + 1, spellSuggestions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); spellSugIndex = Math.max(spellSugIndex - 1, -1); }
    else if (e.key === 'Escape') { spellSuggestions = []; }
    else if (e.key === 'Enter') {
      if (spellSugIndex >= 0 && spellSuggestions[spellSugIndex]) {
        selectSpellSuggestion(spellSuggestions[spellSugIndex].spell.name);
      } else {
        addSpell();
      }
    }
  }

  function addCantrip(e?: KeyboardEvent) {
    if (e && e.key !== 'Enter') return;
    const v = cantripInput.trim();
    if (v && !cantrips.includes(v)) cantrips.push(v);
    cantripInput = '';
    cantripSuggestions = [];
  }

  function addSpell() {
    const v = spellInput.trim();
    if (!v) return;
    const existing = spellsByLevel[spellInputLvl] ?? [];
    spellsByLevel[spellInputLvl] = [...existing, { name: v, prepared: spellInputPrepared }];
    spellInput = '';
    spellInputPrepared = false;
    spellSuggestions = [];
  }

  // ─── Berechnete Werte ───────────────────────────────────
  function modFor(score: number) { return Math.floor((score - 10) / 2); }

  const strMod = $derived(modFor(str));
  const gesMod = $derived(modFor(ges));
  const konMod = $derived(modFor(kon));
  const intMod = $derived(modFor(int));
  const weiMod = $derived(modFor(wei));
  const chaMod = $derived(modFor(cha));

  const computedSkills = $derived.by(() => {
    const mods: Record<string, number> = { str: strMod, ges: gesMod, kon: konMod, int: intMod, wei: weiMod, cha: chaMod };
    const result: CharacterData['skills'] = {};
    for (const def of SKILL_DEFS) {
      const flags = skillFlags[def.key];
      const base = mods[def.attr] ?? 0;
      const pb = proficiencyBonus;
      let value = base;
      if (flags.exp) value = base + pb * 2;
      else if (flags.prof) value = base + pb;
      else if (alleskoenner) value = base + Math.floor(pb / 2);
      result[def.key] = { value, prof: flags.prof, exp: flags.exp };
    }
    return result;
  });

  function sign(n: number) { return n >= 0 ? `+${n}` : `${n}`; }

  // ─── Aktionen ────────────────────────────────────────────
  function addAttack() {
    attacks.push({ name: '', bonus: '', damage: '', type: '', range: '' });
  }
  function removeAttack(i: number) { attacks.splice(i, 1); }

  function addLanguage(e: KeyboardEvent | MouseEvent) {
    if ('key' in e && e.key !== 'Enter') return;
    const v = langInput.trim();
    if (v && !languages.includes(v)) languages.push(v);
    langInput = '';
  }
  function removeLang(l: string) { languages = languages.filter(x => x !== l); }

  function addTool(e: KeyboardEvent | MouseEvent) {
    if ('key' in e && e.key !== 'Enter') return;
    const v = toolInput.trim();
    if (v && !tools.includes(v)) tools.push(v);
    toolInput = '';
  }
  function removeTool(t: string) { tools = tools.filter(x => x !== t); }

  function addInventoryItem() {
    inventory.push({ name: '', count: '', weight: '' });
  }
  function removeInventoryItem(i: number) { inventory.splice(i, 1); }

  function handleSave() {
    onSave({
      name, classLevel, playerName, background, race, xp,
      str, ges, kon, int, wei, cha,
      strMod, gesMod, konMod, intMod, weiMod, chaMod,
      ac, initiative: character.initiative, speed, hpMax, hpCurrent, hpTemp,
      proficiencyBonus, passivePerception: character.passivePerception, hitDice,
      strSaveProf, gesSaveProf, konSaveProf, intSaveProf, weiSaveProf, chaSaveProf,
      skills: computedSkills,
      attacks: attacks.filter(a => a.name.trim() !== ''),
      classFeatures, traits, ideals, bonds, flaws,
      languages, tools, alleskoenner,
      currency,
      inventory: inventory.filter(i => i.name.trim() !== ''),
      inventoryNotes,
      totalWeight: character.totalWeight,
      spells: {
        spellcastingClass: spellClass,
        spellcastingAbility: spellAbility,
        saveDC: spellSaveDC,
        attackBonus: spellAttackBonus,
        slots: slotTotals.map((total, i) => ({ total, used: character.spells?.slots[i]?.used ?? 0 })),
        cantrips,
        byLevel: Object.fromEntries(Object.entries(spellsByLevel).filter(([, v]) => v.length > 0)),
      },
    });
  }

  const ATTRS = [
    { key: 'str', label: 'STR' },
    { key: 'ges', label: 'GES' },
    { key: 'kon', label: 'KON' },
    { key: 'int', label: 'INT' },
    { key: 'wei', label: 'WEI' },
    { key: 'cha', label: 'CHA' },
  ] as const;
</script>

<div class="edit-form">
  <!-- ── Toolbar ─── -->
  <div class="toolbar">
    <button class="btn-save" onclick={handleSave}>Speichern</button>
    <button class="btn-cancel" onclick={onCancel}>Abbrechen</button>
  </div>

  <!-- ── Kopf ─── -->
  <section>
    <h3>Allgemein</h3>
    <div class="grid-2">
      <label>Name<input bind:value={name} placeholder="Charaktername" /></label>
      <label>Klasse & Stufe<input bind:value={classLevel} placeholder="z.B. Waldläufer 5" /></label>
      <label>Spieler<input bind:value={playerName} placeholder="Spielername" /></label>
      <label>Volk<input bind:value={race} placeholder="Volk/Rasse" /></label>
      <label>Hintergrund<input bind:value={background} placeholder="Hintergrund" /></label>
      <label>EP<input bind:value={xp} placeholder="0" /></label>
    </div>
  </section>

  <!-- ── Attribute ─── -->
  <section>
    <h3>Attribute</h3>
    <div class="attr-row">
      {#each ATTRS as attr}
        {@const score = attr.key === 'str' ? str : attr.key === 'ges' ? ges : attr.key === 'kon' ? kon : attr.key === 'int' ? int : attr.key === 'wei' ? wei : cha}
        {@const mod = modFor(score)}
        <div class="attr-box">
          <span class="attr-mod-display">{sign(mod)}</span>
          <span class="attr-label">{attr.label}</span>
          <input
            class="attr-input"
            type="number"
            min="1" max="30"
            value={score}
            oninput={(e) => {
              const v = Number((e.target as HTMLInputElement).value);
              if (attr.key === 'str') str = v;
              else if (attr.key === 'ges') ges = v;
              else if (attr.key === 'kon') kon = v;
              else if (attr.key === 'int') int = v;
              else if (attr.key === 'wei') wei = v;
              else cha = v;
            }}
          />
        </div>
      {/each}
    </div>
  </section>

  <!-- ── Kampf ─── -->
  <section>
    <h3>Kampfwerte</h3>
    <div class="grid-3">
      <label>RK<input bind:value={ac} placeholder="15" /></label>
      <label>Bewegung (m)<input bind:value={speed} placeholder="9" /></label>
      <label>Trefferwürfel<input bind:value={hitDice} placeholder="5W10" /></label>
      <label>TP Maximum<input bind:value={hpMax} placeholder="45" /></label>
      <label>TP Aktuell<input bind:value={hpCurrent} placeholder="45" /></label>
      <label>Temp. TP<input bind:value={hpTemp} placeholder="0" /></label>
      <label>Übungsbonus
        <input type="number" bind:value={proficiencyBonus} min="2" max="6" />
      </label>
    </div>
  </section>

  <!-- ── Rettungswürfe ─── -->
  <section>
    <h3>Rettungswürfe (Profizienzen)</h3>
    <div class="save-checks">
      {#each [['STR', strSaveProf, (v: boolean) => (strSaveProf = v), strMod],
              ['GES', gesSaveProf, (v: boolean) => (gesSaveProf = v), gesMod],
              ['KON', konSaveProf, (v: boolean) => (konSaveProf = v), konMod],
              ['INT', intSaveProf, (v: boolean) => (intSaveProf = v), intMod],
              ['WEI', weiSaveProf, (v: boolean) => (weiSaveProf = v), weiMod],
              ['CHA', chaSaveProf, (v: boolean) => (chaSaveProf = v), chaMod]] as [label, checked, setter, mod]}
        <label class="check-row">
          <input type="checkbox" checked={checked as boolean} onchange={(e) => (setter as (v: boolean) => void)((e.target as HTMLInputElement).checked)} />
          <span class="check-label">{label}</span>
          <span class="check-val">{sign((mod as number) + ((checked as boolean) ? proficiencyBonus : 0))}</span>
        </label>
      {/each}
    </div>
  </section>

  <!-- ── Fertigkeiten ─── -->
  <section>
    <h3>Fertigkeiten</h3>
    <label class="check-row alleskoenner">
      <input type="checkbox" bind:checked={alleskoenner} />
      <span>Alleskönner</span>
    </label>
    <div class="skill-grid">
      {#each SKILL_DEFS as def}
        {@const flags = skillFlags[def.key]}
        {@const computed = computedSkills[def.key]}
        <div class="skill-edit-row">
          <input
            type="checkbox"
            checked={flags.prof}
            title="Profizient"
            onchange={(e) => { skillFlags[def.key].prof = (e.target as HTMLInputElement).checked; if (!skillFlags[def.key].prof) skillFlags[def.key].exp = false; }}
          />
          <input
            type="checkbox"
            checked={flags.exp}
            title="Expertise"
            disabled={!flags.prof}
            onchange={(e) => { skillFlags[def.key].exp = (e.target as HTMLInputElement).checked; }}
          />
          <span class="skill-name" class:proficient={flags.prof} class:expertise={flags.exp}>{def.key}</span>
          <span class="skill-val">{sign(computed.value)}</span>
        </div>
      {/each}
    </div>
  </section>

  <!-- ── Angriffe ─── -->
  <section>
    <h3>Angriffe</h3>
    <table class="attack-table">
      <thead><tr><th>Waffe</th><th>Bonus</th><th>Schaden</th><th>Typ</th><th>RW</th><th></th></tr></thead>
      <tbody>
        {#each attacks as atk, i}
          <tr>
            <td><input bind:value={atk.name} placeholder="Langschwert" /></td>
            <td><input bind:value={atk.bonus} placeholder="+5" /></td>
            <td><input bind:value={atk.damage} placeholder="1W8+3" /></td>
            <td><input bind:value={atk.type} placeholder="Hieb" /></td>
            <td><input bind:value={atk.range} placeholder="Nah" /></td>
            <td><button class="remove-btn" onclick={() => removeAttack(i)}>✕</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
    <button class="btn-add" onclick={addAttack}>+ Angriff</button>
  </section>

  <!-- ── Klassenmerkmale ─── -->
  <section>
    <h3>Klassenmerkmale & Eigenschaften</h3>
    <textarea class="ta-large" bind:value={classFeatures} placeholder="Klassenmerkmale, Rasseneigenschaften…"></textarea>
  </section>

  <!-- ── Persönlichkeit ─── -->
  <section>
    <h3>Persönlichkeit</h3>
    <div class="grid-2">
      <label>Persönlichkeitsmerkmale<textarea bind:value={traits}></textarea></label>
      <label>Ideale<textarea bind:value={ideals}></textarea></label>
      <label>Bindungen<textarea bind:value={bonds}></textarea></label>
      <label>Makel<textarea bind:value={flaws}></textarea></label>
    </div>
  </section>

  <!-- ── Sprachen & Werkzeuge ─── -->
  <section>
    <h3>Sprachen</h3>
    <div class="tag-editor">
      {#each languages as lang}
        <span class="tag">{lang}<button onclick={() => removeLang(lang)}>✕</button></span>
      {/each}
      <input
        class="tag-input"
        bind:value={langInput}
        placeholder="Sprache…"
        onkeydown={addLanguage}
      />
      <button class="btn-add-sm" onclick={addLanguage}>+</button>
    </div>

    <h3 style="margin-top:1rem">Werkzeuge & Fahrzeuge</h3>
    <div class="tag-editor">
      {#each tools as tool}
        <span class="tag">{tool}<button onclick={() => removeTool(tool)}>✕</button></span>
      {/each}
      <input
        class="tag-input"
        bind:value={toolInput}
        placeholder="Werkzeug…"
        onkeydown={addTool}
      />
      <button class="btn-add-sm" onclick={addTool}>+</button>
    </div>
  </section>

  <!-- ── Währung ─── -->
  <section>
    <h3>Währung</h3>
    <div class="currency-row">
      {#each [['km','Kupfer'],['sm','Silber'],['em','Elektrum'],['gm','Gold'],['pm','Platin']] as [key, label]}
        <label class="coin-label">
          {label}
          <input
            class="coin-input"
            value={(currency as any)[key]}
            oninput={(e) => ((currency as any)[key] = (e.target as HTMLInputElement).value)}
          />
        </label>
      {/each}
    </div>
  </section>

  <!-- ── Inventar ─── -->
  <section>
    <h3>Inventar</h3>
    <table class="inv-table">
      <thead><tr><th>Gegenstand</th><th>Anz.</th><th>Gew. (kg)</th><th></th></tr></thead>
      <tbody>
        {#each inventory as item, i}
          <tr>
            <td><input bind:value={item.name} placeholder="Seil (15m)" /></td>
            <td><input bind:value={item.count} placeholder="1" /></td>
            <td><input bind:value={item.weight} placeholder="2" /></td>
            <td><button class="remove-btn" onclick={() => removeInventoryItem(i)}>✕</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
    <button class="btn-add" onclick={addInventoryItem}>+ Gegenstand</button>
    <label style="display:block; margin-top:0.5rem">
      Notizen
      <textarea class="ta-small" bind:value={inventoryNotes}></textarea>
    </label>
  </section>

  <!-- ── Zauber ─── -->
  <section>
    <h3>Zauberwirken</h3>
    <div class="grid-3">
      <label>Zauberklasse<input bind:value={spellClass} placeholder="Zauberer" /></label>
      <label>Fähigkeit<input bind:value={spellAbility} placeholder="INT" /></label>
      <label>Zauber-SG<input type="number" min="0" bind:value={spellSaveDC} /></label>
      <label>Angriffsbonus<input type="number" bind:value={spellAttackBonus} /></label>
    </div>

    <h3 style="margin-top:0.75rem">Slots je Stufe</h3>
    <div class="slot-edit-row">
      {#each slotTotals as _, i}
        <label class="slot-label">S{i + 1}<input type="number" min="0" max="9" bind:value={slotTotals[i]} /></label>
      {/each}
    </div>

    <h3 style="margin-top:0.75rem">Zaubertricks</h3>
    <div class="tag-editor">
      {#each cantrips as c}
        <span class="tag" style="color:{spellColor(c) || 'inherit'}">{c}<button onclick={() => { cantrips = cantrips.filter(x => x !== c); }}>✕</button></span>
      {/each}
      <div class="autocomplete-wrap">
        <input class="tag-input" bind:value={cantripInput} placeholder="Zaubertrick…"
          onkeydown={onCantripKey}
          onblur={() => setTimeout(() => { cantripSuggestions = []; }, 150)} />
        {#if cantripSuggestions.length > 0}
          <ul class="suggestions">
            {#each cantripSuggestions as sug, i}
              <li class:active={i === cantripSugIndex} class:out-of-class={!sug.inClass}
                onmousedown={() => selectCantripSuggestion(sug.spell.name)}>
                <span style={sug.inClass ? `color:${SCHOOL_COLORS[sug.spell.school] ?? 'inherit'}` : ''}>{sug.spell.name}</span>
                {#if !sug.inClass}<span class="sug-hint">nicht in Klasse</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <button class="btn-add-sm" onclick={() => addCantrip()}>+</button>
    </div>

    <h3 style="margin-top:0.75rem">Zauber hinzufügen</h3>
    <div class="spell-add-row">
      <select bind:value={spellInputLvl} class="spell-level-select">
        {#each ['1','2','3','4','5','6','7','8','9'] as lvl}
          <option value={lvl}>Stufe {lvl}</option>
        {/each}
      </select>
      <div class="autocomplete-wrap spell-autocomplete">
        <input class="spell-name-input" bind:value={spellInput} placeholder="Zauber-Name…"
          onkeydown={onSpellKey}
          onblur={() => setTimeout(() => { spellSuggestions = []; }, 150)} />
        {#if spellSuggestions.length > 0}
          <ul class="suggestions">
            {#each spellSuggestions as sug, i}
              <li class:active={i === spellSugIndex} class:out-of-class={!sug.inClass}
                onmousedown={() => selectSpellSuggestion(sug.spell.name)}>
                <span style={sug.inClass ? `color:${SCHOOL_COLORS[sug.spell.school] ?? 'inherit'}` : ''}>{sug.spell.name}</span>
                {#if !sug.inClass}<span class="sug-hint">nicht in Klasse</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <label class="prep-check"><input type="checkbox" bind:checked={spellInputPrepared} /> Vorb.</label>
      <button class="btn-add-sm" onclick={addSpell}>+</button>
    </div>

    {#each ['1','2','3','4','5','6','7','8','9'] as lvl}
      {@const spells = spellsByLevel[lvl] ?? []}
      {#if spells.length || slotTotals[Number(lvl) - 1] > 0}
        <div class="spell-level-block">
          <span class="spell-level-label">Stufe {lvl} ({slotTotals[Number(lvl) - 1]} Slots)</span>
          {#each spells as spell, i}
            <div class="spell-edit-row">
              <button class="prep-toggle" title={spell.prepared ? 'Vorbereitet' : 'Nicht vorbereitet'}
                onclick={() => { spells[i] = { ...spell, prepared: !spell.prepared }; spellsByLevel[lvl] = [...spells]; }}>
                {spell.prepared ? '●' : '○'}
              </button>
              <span class="spell-item-name" class:prepared={spell.prepared}
                style="color:{spellColor(spell.name) || 'inherit'}">{spell.name}</span>
              <button class="remove-btn" onclick={() => { spellsByLevel[lvl] = spells.filter((_, j) => j !== i); }}>✕</button>
            </div>
          {/each}
        </div>
      {/if}
    {/each}
  </section>

  <!-- ── Toolbar (unten) ─── -->
  <div class="toolbar toolbar-bottom">
    <button class="btn-save" onclick={handleSave}>Speichern</button>
    <button class="btn-cancel" onclick={onCancel}>Abbrechen</button>
  </div>
</div>

<style>
  .edit-form {
    padding: 1rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0;
    color: #cdd6f4;
    font-size: 0.85rem;
  }

  .toolbar {
    display: flex;
    gap: 0.5rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #313244;
    margin-bottom: 0.75rem;
    position: sticky;
    top: 0;
    background: #1e1e2e;
    z-index: 10;
    padding-top: 0.25rem;
  }
  .toolbar-bottom {
    position: static;
    border-top: 1px solid #313244;
    border-bottom: none;
    margin-top: 1rem;
    padding-top: 0.75rem;
    padding-bottom: 0;
    margin-bottom: 0;
  }

  .btn-save {
    background: #a6e3a1;
    color: #1e1e2e;
    border: none;
    border-radius: 4px;
    padding: 0.3rem 0.9rem;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-cancel {
    background: none;
    border: none;
    color: #6c7086;
    cursor: pointer;
    font-size: 0.82rem;
    padding: 0.3rem 0.5rem;
  }

  section {
    margin-bottom: 1.25rem;
  }

  h3 {
    margin: 0 0 0.5rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6c7086;
    border-bottom: 1px solid #313244;
    padding-bottom: 0.2rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.75rem;
    color: #a6adc8;
  }

  input, textarea, select {
    background: #313244;
    border: 1px solid #45475a;
    border-radius: 4px;
    color: #cdd6f4;
    padding: 0.25rem 0.4rem;
    font-size: 0.82rem;
    outline: none;
    font-family: inherit;
  }
  input:focus, textarea:focus { border-color: #cba6f7; }
  input[type="number"] { width: 4rem; }
  input[type="checkbox"] { width: auto; }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .grid-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.5rem;
  }

  /* Attribute */
  .attr-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .attr-box {
    background: #313244;
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    min-width: 58px;
  }
  .attr-mod-display {
    font-size: 1.1rem;
    font-weight: 700;
    color: #cba6f7;
  }
  .attr-label {
    font-size: 0.65rem;
    color: #6c7086;
    text-transform: uppercase;
  }
  .attr-input {
    width: 3rem !important;
    text-align: center;
    padding: 0.15rem;
  }

  /* Rettungswürfe */
  .save-checks {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.25rem 0.5rem;
  }
  .check-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.82rem;
    color: #cdd6f4;
  }
  .check-label { flex: 1; }
  .check-val { font-weight: 600; min-width: 2rem; text-align: right; color: #a6adc8; }
  .alleskoenner { margin-bottom: 0.5rem; }

  /* Fertigkeiten */
  .skill-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.15rem 0.5rem;
  }
  .skill-edit-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.8rem;
  }
  .skill-name { flex: 1; color: #a6adc8; }
  .skill-name.proficient { color: #a6e3a1; }
  .skill-name.expertise { color: #89dceb; }
  .skill-val { font-weight: 600; min-width: 2rem; text-align: right; }

  /* Angriffe */
  .attack-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0.4rem;
    font-size: 0.8rem;
  }
  .attack-table th {
    text-align: left;
    color: #6c7086;
    font-weight: 400;
    padding: 0.1rem 0.3rem;
    border-bottom: 1px solid #313244;
  }
  .attack-table td {
    padding: 0.15rem 0.2rem;
  }
  .attack-table input {
    width: 100%;
    min-width: 40px;
  }

  /* Tags */
  .tag-editor {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    align-items: center;
  }
  .tag {
    background: #313244;
    border-radius: 4px;
    padding: 0.1rem 0.3rem 0.1rem 0.5rem;
    font-size: 0.78rem;
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }
  .tag button {
    background: none;
    border: none;
    cursor: pointer;
    color: #45475a;
    font-size: 0.7rem;
    padding: 0;
    line-height: 1;
  }
  .tag button:hover { color: #f38ba8; }
  .tag-input {
    flex: 1;
    min-width: 80px;
    max-width: 120px;
  }

  /* Währung */
  .currency-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .coin-label {
    flex-direction: column;
    font-size: 0.72rem;
    color: #6c7086;
  }
  .coin-input {
    width: 4rem;
    text-align: center;
  }

  /* Inventar */
  .inv-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0.4rem;
    font-size: 0.8rem;
  }
  .inv-table th {
    text-align: left;
    color: #6c7086;
    font-weight: 400;
    padding: 0.1rem 0.3rem;
    border-bottom: 1px solid #313244;
  }
  .inv-table td { padding: 0.15rem 0.2rem; }
  .inv-table input { width: 100%; min-width: 40px; }

  .ta-large {
    width: 100%;
    min-height: 80px;
    resize: vertical;
  }
  .ta-small {
    width: 100%;
    min-height: 50px;
    resize: vertical;
  }
  section label textarea { resize: vertical; min-height: 50px; }

  .remove-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: #45475a;
    font-size: 0.75rem;
    padding: 0.1rem 0.2rem;
  }
  .remove-btn:hover { color: #f38ba8; }

  .btn-add {
    background: #313244;
    color: #cdd6f4;
    border: none;
    border-radius: 4px;
    padding: 0.2rem 0.6rem;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .btn-add:hover { background: #45475a; }

  .btn-add-sm {
    background: #313244;
    color: #cdd6f4;
    border: none;
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.82rem;
    cursor: pointer;
    line-height: 1.4;
  }

  /* ── Zauber ── */
  .slot-edit-row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .slot-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 0.7rem;
    color: #6c7086;
    gap: 0.1rem;
  }
  .slot-label input { width: 2.8rem; text-align: center; }

  .spell-add-row {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }
  .spell-level-select {
    background: #313244;
    color: #cdd6f4;
    border: 1px solid #45475a;
    border-radius: 4px;
    padding: 0.2rem 0.3rem;
    font-size: 0.8rem;
    font-family: inherit;
  }
  .spell-name-input {
    flex: 1;
    min-width: 100px;
    width: 100%;
  }
  .autocomplete-wrap {
    position: relative;
    flex: 1;
    min-width: 100px;
  }
  .spell-autocomplete {
    flex: 1;
  }
  .suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 100;
    background: #1e1e2e;
    border: 1px solid #45475a;
    border-top: none;
    border-radius: 0 0 6px 6px;
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 220px;
    overflow-y: auto;
    box-shadow: 0 6px 16px rgba(0,0,0,0.5);
  }
  .suggestions li {
    padding: 0.3rem 0.6rem;
    cursor: pointer;
    font-size: 0.82rem;
    color: #cdd6f4;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: space-between;
  }
  .suggestions li:hover,
  .suggestions li.active {
    background: #313244;
  }
  .suggestions li.out-of-class {
    color: #585b70;
  }
  .suggestions li.out-of-class:hover,
  .suggestions li.out-of-class.active {
    background: #2a2b3d;
    color: #7f849c;
  }
  .sug-hint {
    font-size: 0.7rem;
    color: #45475a;
    white-space: nowrap;
  }
  .prep-check {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.78rem;
    color: #a6adc8;
    cursor: pointer;
  }

  .spell-level-block {
    margin: 0.4rem 0 0.2rem;
  }
  .spell-level-label {
    display: block;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6c7086;
    margin-bottom: 0.2rem;
  }
  .spell-edit-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.82rem;
    padding: 0.05rem 0;
  }
  .spell-item-name { flex: 1; color: #a6adc8; }
  .spell-item-name.prepared { font-weight: 600; }

  .prep-toggle {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.62rem;
    color: #45475a;
    padding: 0;
    width: 0.9rem;
  }
  .spell-edit-row .prep-toggle:hover { color: #a6e3a1; }
</style>
