<script lang="ts">
  /**
   * Klassen & Stufen: strukturierte Zeilen (multiclass-fähig) mit Bibliotheks-Link je
   * Grundklasse und Subklassen-Dropdown. Der Anzeige-String wird daraus abgeleitet.
   */
  import { activeFile } from '../../stores/campaign';
  import { confirmNavigation } from '../../stores/navigationGuard';
  import { classDisplayName, searchClasses, type ClassInfo } from '../../classLibrary';
  import { formatClassLevel, totalLevel } from '../../schemas/classLevelText';
  import type { CharacterClass } from '../../schemas/characterSchema';
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import LibraryRefPicker from './LibraryRefPicker.svelte';
  import './form.css';

  let {
    classes,
    classIndex,
    diff,
    fixLabel,
    onfix,
    editingRow,
    oneditingRow,
  }: {
    classes: CharacterClass[];
    classIndex: ClassInfo[];
    diff: DiffDir;
    /** Text des Altformat-Angebots; fehlt es, gibt es nichts nachzuziehen. */
    fixLabel?: string;
    onfix: () => void;
    editingRow: number;
    oneditingRow: (row: number) => void;
  } = $props();

  const preview = $derived(formatClassLevel(classes));
  const total = $derived(totalLevel(classes));
  // Nur Grundklassen (ohne subclassOf) sind vorschlagbar; Subklasse getrennt übers Dropdown.
  const baseClasses = $derived(classIndex.filter((c) => !c.subclassOf));

  function addClass() {
    classes.push({ sourceKey: '', name: '', level: 1 });
    oneditingRow(classes.length - 1);
  }
  function removeClass(i: number) {
    classes.splice(i, 1);
    oneditingRow(-1);
  }

  /** Bibliotheks-Pfad zur GRUNDklasse eines Eintrags, falls verlinkt. */
  function classPath(cls: CharacterClass): string | undefined {
    if (!cls.sourceKey) return undefined;
    return classIndex.find((c) => c.key === cls.sourceKey)?.path;
  }

  async function openClassPage(cls: CharacterClass) {
    const path = classPath(cls);
    if (!path) return;
    if (!(await confirmNavigation())) return; // ungespeicherte Charakter-Änderungen
    activeFile.set({ name: path.split('/').pop()!.replace('.json', ''), path, type: 'class' });
  }

  function subclassesFor(cls: CharacterClass): ClassInfo[] {
    if (!cls.sourceKey) return [];
    return classIndex.filter((c) => c.subclassOf === cls.sourceKey);
  }

  function setSubclass(i: number, key: string) {
    if (!key) { classes[i].subclassKey = undefined; classes[i].subclassName = undefined; return; }
    const info = classIndex.find((c) => c.key === key);
    classes[i].subclassKey = key;
    classes[i].subclassName = info ? classDisplayName(info) : undefined;
  }

  function selectClass(i: number, info: ClassInfo) {
    classes[i].name = classDisplayName(info);
    classes[i].sourceKey = info.key ?? '';
    classes[i].subclassKey = undefined;
    classes[i].subclassName = undefined;
  }
</script>

<div class="ref-block class-block" use:diffMark={diff}>
  <h4>Klassen & Stufen{#if total > 0} <span class="class-total">· Gesamtstufe {total}</span>{/if}</h4>
  {#if fixLabel}
    <div class="legacy-banner">
      <span class="legacy-banner-text">Altes Freitext-Format erkannt: {fixLabel}.</span>
      <button type="button" class="legacy-banner-btn" onclick={onfix}>Aufs neue Format umstellen</button>
    </div>
  {/if}
  <table class="ref-table">
    <thead><tr><th>Klasse</th><th>Stufe</th><th>Subklasse</th><th></th></tr></thead>
    <tbody>
      {#each classes as cls, i}
        {@const subs = subclassesFor(cls)}
        <tr>
          <td>
            <LibraryRefPicker
              name={cls.name}
              linked={!!classPath(cls)}
              editing={editingRow === i}
              placeholder="z.B. Waldläufer"
              editTitle="Klasse ändern"
              search={(q) => searchClasses(baseClasses, q, 8)}
              label={classDisplayName}
              onopen={() => openClassPage(cls)}
              oninput={(v) => (cls.name = v)}
              onselect={(info) => selectClass(i, info)}
              onediting={(v) => oneditingRow(v ? i : -1)}
            />
          </td>
          <td><input class="ref-level" type="number" min="1" max="20" value={cls.level}
            oninput={(e) => { const v = parseInt((e.target as HTMLInputElement).value); cls.level = Number.isNaN(v) ? 1 : Math.min(20, Math.max(1, v)); }} /></td>
          <td>
            {#if subs.length > 0}
              <select value={cls.subclassKey ?? ''} onchange={(e) => setSubclass(i, e.currentTarget.value)}>
                <option value="">— keine —</option>
                {#each subs as sub}
                  <option value={sub.key}>{classDisplayName(sub)}</option>
                {/each}
              </select>
            {:else}
              <span class="subclass-na">—</span>
            {/if}
          </td>
          <td><button class="remove-btn" onclick={() => removeClass(i)}>✕</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
  <button class="btn-add" onclick={addClass}>+ Klasse</button>
  {#if preview}<p class="class-preview">Anzeige: {preview}</p>{/if}
</div>
