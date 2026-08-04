<script lang="ts">
  /**
   * Freitext-Notausgang neben dem Bibliotheks-Picker: Alt-Zauber ohne Link und
   * Homebrew, das (noch) nicht in `vault/spells` liegt, bleiben so eintragbar.
   * Eine Instanz je Kontingent (Zaubertrick/Zauber) statt einer eigenen Komponente je Seite.
   */
  import { searchSpells, SCHOOL_COLORS, type SpellInfo, type SpellSuggestion } from '../../spellLibrary';
  import { createSuggestNav } from '../../utils/suggestNav.svelte';
  import { dropdownPlacement } from '../../utils/dropdownPlacement';
  import './form.css';

  let { library, spellClass, level, placeholder, onadd }: {
    library: SpellInfo[];
    spellClass: string;
    /** 0 = Zaubertrick; null = der Grad wird in dieser Zeile per Select gewählt. */
    level: 0 | null;
    placeholder: string;
    onadd: (entry: { name: string; sourceKey?: string; level: number; prepared: boolean }) => void;
  } = $props();

  let query = $state('');
  let lvl = $state('1');
  let prepared = $state(false);
  let suggestions = $state<SpellSuggestion[]>([]);

  const effectiveLevel = $derived(level ?? Number(lvl));

  $effect(() => {
    suggestions = query.length > 0 ? searchSpells(library, query, effectiveLevel, spellClass) : [];
    nav.reset();
  });

  function select(sug: SpellSuggestion) {
    onadd({ name: sug.spell.name, ...(sug.spell.key ? { sourceKey: sug.spell.key } : {}), level: effectiveLevel, prepared });
    query = '';
    suggestions = [];
  }

  function addFree() {
    const v = query.trim();
    if (!v) return;
    // Ohne Key — der Aufrufer löst später über den Namen auf (`matchSpell`).
    onadd({ name: v, level: effectiveLevel, prepared });
    query = '';
    suggestions = [];
  }

  const nav = createSuggestNav<SpellSuggestion>({
    items: () => suggestions,
    pick: select,
    enter: addFree,
    escape: () => { suggestions = []; },
  });
</script>

<div class="spell-add-row">
  {#if level === null}
    <select bind:value={lvl} class="spell-level-select">
      {#each Array.from({ length: 9 }, (_, i) => String(i + 1)) as l}
        <option value={l}>Stufe {l}</option>
      {/each}
    </select>
  {/if}
  <div class="autocomplete-wrap spell-autocomplete">
    <input class="spell-name-input" bind:value={query} {placeholder}
      onkeydown={nav.onkeydown}
      onblur={() => setTimeout(() => { suggestions = []; }, 150)} />
    {#if suggestions.length > 0}
      <ul class="suggestions" use:dropdownPlacement>
        {#each suggestions as sug, i}
          <li class:active={i === nav.index} class:out-of-class={!sug.inClass}
            onmousedown={() => select(sug)}>
            <span style={sug.inClass ? `color:${SCHOOL_COLORS[sug.spell.school] ?? 'inherit'}` : ''}>{sug.spell.name}</span>
            {#if !sug.inClass}<span class="sug-hint">nicht in Klasse</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  {#if level === null}
    <label class="prep-check"><input type="checkbox" bind:checked={prepared} /> Vorb.</label>
  {/if}
  <button class="btn-add-sm" onclick={addFree}>+</button>
</div>
