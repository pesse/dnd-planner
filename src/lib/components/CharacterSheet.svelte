<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { PDFDocument } from 'pdf-lib';
  import { open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog';
  import { parseCharacterData, emptySpells, SKILL_DEFS, skillSheetKey, type CharacterData, type CharacterJSON } from '../pdf/characterFields';
  import type { SkillName } from '../schemas/shared';
  import { exportCharacterToPdf } from '../pdf/characterExport';
  import { createCardEditor } from '../editor/cardEditor.svelte';
  import { parseCharacter } from '../utils/schemaValidation';
  import { type Character, formatClassLevel, formatSpecies, pendingCharacterUpgrade } from '../schemas/character';
  import { proficiencyBonus } from '../services/classProgression';
  import type { LevelUpChangeSet } from '../schemas/levelUp';
  import type { LevelUpDelta } from '../services/levelUp';
  import EditorPanel from './EditorPanel.svelte';
  import CharacterEditForm from './CharacterEditForm.svelte';
  import LevelUpAssistant from './LevelUpAssistant.svelte';
  import RichTextEditor from './RichTextEditor.svelte';
  import SpellTooltip from './SpellTooltip.svelte';
  import ItemTooltip from './ItemTooltip.svelte';
  import Markdown from './Markdown.svelte';
  import { activeFile, invalidateVault } from '../stores/campaign';
  import { confirmNavigation } from '../stores/navigationGuard';
  import { getSpellLibrary, loadSpellByPath, buildSpellIndex, matchSpell, SCHOOL_COLORS, type SpellInfo } from '../spellLibrary';
  import {
    getItemsByDir, displayName, CATEGORY_COLORS, DIR_TO_CATEGORY,
    buildItemIndex, matchItem, formatRarity, formatDamageDice, structuralType,
    DAMAGE_TYPE_LABELS, MASTERY_INFO, masteryLabel,
    type ItemInfo,
  } from '../itemLibrary';
  import { isMastered, masteredKinds } from '../services/weaponMastery';
  import type { WeaponMastery } from '../schemas/shared';
  import { prepareMultiSpellPrint } from '../utils/printSpell';
  import { lineWeightKg, totalWeightKg, formatKg } from '../utils/inventoryWeight';
  import {
    resolveCharacterFeatures, resolveSpellAccess,
    type ResolvedFeatureGroup, type ResolvedFeature,
  } from '../services/characterFeatures';
  import type { SpellAccessValues } from '../services/spellAccess';
  import type { Spell, Item } from '../types';

  interface Props {
    dirPath: string;   // z.B. "./vault/characters/carric_galanodel"
  }

  let { dirPath }: Props = $props();

  // ─── Merkmals-Auflösung (Karte): Klasse/Volk/Hintergrund/Talente aus den LINKS ───
  // Der Charakter speichert nur Verknüpfungen; die Merkmale/Traits/Vorteile werden zur
  // Laufzeit aus vault/{classes,species,backgrounds,feats} aufgelöst (analog Zauber).
  let classFeatureGroups = $state<ResolvedFeatureGroup[]>([]);
  let speciesTraitGroups = $state<ResolvedFeatureGroup[]>([]);
  let backgroundGroups = $state<ResolvedFeatureGroup[]>([]);
  // Talent-Links und verwaiste Entscheidungen (Klassen-Link getauscht, Key verschoben)
  // — getrennte Blöcke, statt Letztere unter „Talente" einzureihen.
  let featEntries = $state<ResolvedFeature[]>([]);
  let orphanChoices = $state<ResolvedFeature[]>([]);
  // Zauberwerte der merkmals-gewährten Zugänge (Magiekundiger): zur Anzeigezeit gerechnet,
  // damit ein steigender Übungsbonus sie mitnimmt — gespeichert würden sie altern.
  let spellAccessRows = $state<SpellAccessValues[]>([]);
  $effect(() => {
    const c = character;
    if (!c) {
      spellAccessRows = [];
      return;
    }
    void (async () => {
      spellAccessRows = await resolveSpellAccess({
        features: c.features,
        proficiencyBonus: c.proficiencyBonus,
        mods: { str: c.strMod, ges: c.gesMod, kon: c.konMod, int: c.intMod, wei: c.weiMod, cha: c.chaMod },
      });
    })();
  });
  // Ob die „Verknüpfte Merkmale"-Aufklappbox offen ist. Die Auflösung (Bibliotheks-
  // Zugriffe) ist teuer und wird — da die Box meist zu bleibt — erst beim Öffnen
  // ausgeführt. Bei offener Box hält der Effect die Merkmale bei Änderungen aktuell.
  let featuresOpen = $state(false);
  $effect(() => {
    if (!featuresOpen) return;
    const c = character;
    if (!c) return;
    void (async () => {
      const r = await resolveCharacterFeatures(c);
      classFeatureGroups = r.classGroups;
      speciesTraitGroups = r.speciesGroups;
      backgroundGroups = r.backgroundGroups;
      featEntries = r.featEntries;
      orphanChoices = r.orphanChoices;
    })();
  });
  // Günstiger, synchroner Check, ob überhaupt Merkmals-Verknüpfungen existieren —
  // steuert die Sichtbarkeit der Aufklappbox, ohne die Bibliothek anzufassen.
  const hasFeatureRefs = $derived.by(() => {
    const c = character;
    if (!c) return false;
    const hasClass = (c.classes ?? []).some((cl) => cl.name?.trim() || cl.sourceKey);
    const hasSpecies = !!(c.species && (c.species.sourceKey || c.species.name?.trim()));
    const hasBackground = !!(c.backgroundRef && (c.backgroundRef.sourceKey || c.backgroundRef.name?.trim()));
    const hasLedger = (c.features?.length ?? 0) > 0;
    return hasClass || hasSpecies || hasBackground || hasLedger;
  });

  // Karten-Editor-Fundament: besitzt Laden (character.json via activeFile), Dirty-
  // Tracking, Speichern (kein Sprung zur Bogen-Ansicht), JSON-Tab, Navigations-Guard.
  const ed = createCardEditor<Character>({
    type: 'character',
    label: 'Charakter',
    parse: (content) => {
      const r = parseCharacter(JSON.parse(content));
      return r.ok ? r.data : null;
    },
    // Das angenommene Schema-Upgrade ist die einzige Änderung, die den Draft NICHT
    // anfasst (`parse` hat sie beim Laden längst angewandt) — ohne diesen Hook bliebe der
    // Editor sauber und die Speichern-Leiste unerreichbar. Rückgabetyp annotiert, weil
    // `pendingUpgrade` seinerseits `ed.lastSavedContent` liest (Inferenzkreis).
    extraDirty: (): boolean => upgradeAccepted && !!pendingUpgrade,
    onSaved: () => invalidateVault(),
  });
  // Read-only-Sicht auf den Draft für die Bogen-Anzeige.
  // (Der Bearbeiten-Tab bindet ed.draft direkt und mutiert ihn in place.)
  const character = $derived(ed.draft);
  // Zuletzt gespeicherte Version als Baseline für das Diff-Highlighting im
  // Bearbeiten-Formular. Bei neuem/nie gespeichertem Charakter (leerer Content)
  // oder ungültigem JSON → null → keine Hervorhebungen. save() ersetzt ed.draft
  // nicht, setzt aber lastSavedContent neu → dieser Derived rechnet neu → alle
  // Highlights verschwinden in-place.
  const savedCharacter = $derived.by<Character | null>(() => {
    if (!ed.lastSavedContent) return null;
    try {
      const r = parseCharacter(JSON.parse(ed.lastSavedContent));
      return r.ok ? r.data : null;
    } catch {
      return null;
    }
  });
  // Quelle der PDF-Import-Metadaten (nicht editierbar).
  const pdfName = $derived(character?._importedFrom ?? '');

  // ─── Schema-Upgrade der Datei (Hinweis im Bearbeiten-Tab) ──────────────────
  // Gegen den ROHEN Dateiinhalt geprüft, nicht gegen den Draft: `parseCharacter`
  // zieht beim Laden ohnehin die Pipeline durch, veraltet ist nur die Datei.
  const pendingUpgrade = $derived.by(() => {
    if (!ed.lastSavedContent) return null;
    try {
      return pendingCharacterUpgrade(JSON.parse(ed.lastSavedContent));
    } catch {
      return null; // ungültiges JSON — dafür meldet sich bereits der Lade-Fehler
    }
  });
  // Angebot angenommen → `extraDirty` greift, geschrieben wird über die Speichern-Leiste.
  let upgradeAccepted = $state(false);
  // Beim Dateiwechsel zurücksetzen, sonst wirkt der nächste Charakter ungespeichert.
  $effect(() => {
    void ed.lastSavedContent;
    upgradeAccepted = false;
  });

  // ─── Stufenaufstieg-Assistent ──────────────────────────────────────────────
  let showLevelUp = $state(false);

  /**
   * Wendet den KI-Vorschlag ADDITIV auf einen frischen Draft-Klon an und ersetzt
   * `ed.draft` per NEUER Referenz. Der Referenz-Swap ist tragend: er löst
   * `{#key ed.draft}` (Formular-Remount → Diff-Highlighting) und `ed.dirty` aus.
   * Numerische Werte werden addiert, damit item-gewährte Boni erhalten bleiben.
   */
  function applyLevelUp(changeSet: LevelUpChangeSet, delta: LevelUpDelta) {
    if (!ed.draft) return;
    const next = structuredClone($state.snapshot(ed.draft)) as Character;

    // Struktur (Identität, aus delta — kein additives Delta): Klassenstufe / Multiclass.
    if (delta.isNewClass) {
      next.classes.push({ sourceKey: delta.sourceKey, name: delta.klasseName, level: delta.toLevel });
    } else {
      const cls = next.classes[delta.classIndex];
      if (cls) cls.level = delta.toLevel;
    }
    // Übungsbonus deterministisch aus Gesamtstufe (Sicherheitsnetz; changeSet setzt ihn ebenso).
    next.proficiencyBonus = proficiencyBonus(delta.newTotalLevel);

    // Alle übrigen Änderungen additiv/settend aus dem gemeinsamen Format anwenden.
    for (const c of changeSet.changes) {
      switch (c.target) {
        case 'hpMax': // Freitext-Zahl additiv (bewahrt item-/manuelle Boni)
          next.hpMax = String((parseInt(next.hpMax, 10) || 0) + c.value);
          break;
        case 'hitDice':
          next.hitDice = c.value;
          break;
        case 'proficiencyBonus':
          next.proficiencyBonus = c.value;
          break;
        case 'spellSlot': { // additiv — bewahrt item-/manuell gewährte Slots
          const slots = next.spells?.slots ?? [];
          const i = c.level - 1;
          if (slots[i]) slots[i].total += c.value;
          break;
        }
        case 'cantrip':
          if (!next.spells.cantrips.some((e) => e.name === c.name)) {
            const key = resolveSpell({ name: c.name })?.key;
            next.spells.cantrips = [...next.spells.cantrips, { name: c.name, ...(key ? { sourceKey: key } : {}) }];
          }
          break;
        case 'spellcastingClass':
          if (!next.spells.spellcastingClass) next.spells.spellcastingClass = c.value;
          break;
        case 'ability': { // additiv + Modifikator neu berechnen
          const score = (next[c.ability] ?? 10) + c.value;
          next[c.ability] = score;
          (next as unknown as Record<string, number>)[`${c.ability}Mod`] = Math.floor((score - 10) / 2);
          break;
        }
        case 'preparedSpell': { // → spells.byLevel (Dedup je Grad)
          if (!c.name.trim()) break;
          const lvl = String(c.level);
          const arr = next.spells.byLevel[lvl] ?? [];
          if (!arr.some((e) => e.name === c.name)) {
            const key = resolveSpell({ name: c.name })?.key;
            arr.push({ name: c.name, prepared: c.prepared, ...(key ? { sourceKey: key } : {}) });
          }
          next.spells.byLevel[lvl] = arr;
          break;
        }
        case 'feat': // Talent-Link → Merkmals-Ledger
          next.features = [...next.features, { sourceKey: c.sourceKey, name: c.name, choice: '', choiceDe: '', gainedAt: c.gainedAt, desc: '' }];
          break;
        // Der Change trägt den ENGLISCHEN SRD-Namen (geschlossenes Vokabular aus dem
        // Rider-Schema); der Bogen ist deutsch geschlüsselt → hier übersetzen. Vorher
        // schlug die Zuweisung still fehl, weil „Animal Handling" nie auf
        // „MitTierenUmgehen" traf.
        case 'expertise': {
          const key = skillSheetKey(c.skill as SkillName);
          if (next.skills[key]) next.skills[key].exp = true;
          break;
        }
        case 'proficiency': {
          const key = skillSheetKey(c.skill as SkillName);
          if (next.skills[key]) next.skills[key].prof = true;
          break;
        }
        case 'subclass': { // an der (ggf. gerade angehängten) Klasse setzen
          const cls = delta.isNewClass ? next.classes[next.classes.length - 1] : next.classes[delta.classIndex];
          if (cls && c.key) { cls.subclassKey = c.key; cls.subclassName = c.name; }
          break;
        }
        case 'classFeaturesText': // KI-Volltext ersetzen ODER Freitext anhängen (inkl. Kampfstil)
          if (c.mode === 'replace') next.classFeatures = c.value;
          else next.classFeatures = [next.classFeatures, c.value].filter((s) => s && s.trim()).join('\n');
          break;
        case 'featureChoice': {
          // Upsert über (Merkmal, Stufe): dieselbe Stufe erneut zu durchlaufen ersetzt den
          // Eintrag, eine zweite Vergabe desselben Merkmals (Expertise 1 und 6) legt einen an.
          if (!c.sourceKey) break;
          const i = next.features.findIndex((e) => e.sourceKey === c.sourceKey && e.gainedAt === c.gainedAt);
          const entry = { sourceKey: c.sourceKey, name: '', choice: c.choice, choiceDe: c.choiceDe, gainedAt: c.gainedAt, desc: '' };
          if (i >= 0) next.features[i] = entry;
          else next.features = [...next.features, entry];
          break;
        }
        case 'featureGained':
          break; // Info-Eintrag — keine Anwendung (Klassen-/Subklassen-Merkmale aus Link abgeleitet)
        case 'note':
          break; // Info-Eintrag (Protokoll des Fragebogens) — kein Ziel am Charakter
      }
    }
    next.classLevel = formatClassLevel(next.classes);

    // Referenz-Swap → {#key ed.draft} remountet das Formular; parseCharacter normalisiert.
    const r = parseCharacter(next);
    ed.draft = r.ok ? r.data : next;
  }

  let gmNotes = $state('');
  let gmNotesSaving = $state<'saved' | 'saving' | 'unsaved'>('saved');
  let freitext = $state('');
  let freitextSaving = $state<'saved' | 'saving' | 'unsaved'>('saved');
  let error = $state('');
  let importingPdf = $state(false);
  let exportingPdf = $state(false);
  let portraitUrl = $state('');
  let spellLibrary = $state<SpellInfo[]>([]);
  let itemLoadedByDir = $state<Record<string, ItemInfo[]>>({});

  $effect(() => {
    const file = character?.portraitFile;
    if (!file) { portraitUrl = ''; return; }
    invoke<string>('read_file_base64', { path: `${dirPath}/${file}` })
      .then(b64 => {
        const mime = file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        portraitUrl = `data:${mime};base64,${b64}`;
      })
      .catch(() => { portraitUrl = ''; });
  });

  $effect(() => { getSpellLibrary().then(lib => { spellLibrary = lib; }); });

  $effect(() => {
    Promise.all(
      Object.keys(DIR_TO_CATEGORY).map(dir =>
        getItemsByDir(dir).then(items => ({ dir, items }))
      )
    ).then(results => {
      const map: Record<string, ItemInfo[]> = {};
      for (const { dir, items } of results) map[dir] = items;
      itemLoadedByDir = map;
    });
  });

  const itemIndex = $derived(buildItemIndex(itemLoadedByDir));

  /**
   * Waffenbeherrschung (5e 2024) eines Angriffs bzw. einer Waffe: die Eigenschaft
   * hängt am Item (`mastery`), die Erlaubnis an `character.masteries`. Aufgelöst wird
   * über Name und Waffenart — dieselbe Brücke wie beim Inventar. Ein Tausch der
   * beherrschten Waffen wirkt deshalb sofort auf alle Angriffe, ohne dass etwas
   * zurückgeschrieben werden müsste (`attacks[]` bleibt unberührt).
   */
  const masteredWeaponKinds = $derived(
    masteredKinds(character?.masteries ?? [], (n) => matchItem(itemIndex, { name: n })),
  );

  function masteryOf(name: string): WeaponMastery | undefined {
    const lib = matchItem(itemIndex, { name });
    if (!lib?.mastery) return undefined;
    return isMastered(masteredWeaponKinds, lib) ? lib.mastery : undefined;
  }

  /**
   * Beherrschte Waffen als „Name (Eigenschaft)". Namen, die die Bibliothek nicht (mehr)
   * kennt, bleiben bewusst STEHEN — sonst zeigte der Bogen weniger als die Datei
   * enthält; der Editor markiert sie dort als Überhang.
   */
  const masteryChips = $derived(
    (character?.masteries ?? []).map((n) => ({ name: n, mastery: matchItem(itemIndex, { name: n })?.mastery })),
  );

  // ─── Item-Volldata-Cache + Tooltip ──────────────────────
  let itemDataRecord = $state<Record<string, Item | null>>({});
  let tooltipItem = $state<Item | null>(null);
  let tooltipX = $state(0);
  let tooltipY = $state(0);

  $effect(() => {
    if (!character) return;
    for (const invItem of character.inventory) {
      const libItem = matchItem(itemIndex, invItem);
      if (libItem && !(libItem.path in itemDataRecord)) {
        itemDataRecord[libItem.path] = null;
        invoke<string>('read_file_content', { path: libItem.path })
          .then(content => { itemDataRecord[libItem.path] = JSON.parse(content) as Item; })
          .catch(() => {});
      }
    }
  });

  function showItemTooltip(e: MouseEvent, libItem: ItemInfo) {
    const data = itemDataRecord[libItem.path];
    if (!data) return;
    tooltipItem = data;
    updateTooltipPos(e);
  }
  function updateTooltipPos(e: MouseEvent) {
    tooltipX = e.clientX + 14;
    tooltipY = e.clientY + 14;
  }
  function hideItemTooltip() { tooltipItem = null; }

  async function openItemPage(libItem: ItemInfo) {
    if (!(await confirmNavigation())) return; // ungespeicherte Charakter-Änderungen
    const name = libItem.path.split('/').pop()?.replace('.json', '') ?? libItem.name;
    activeFile.set({ name, path: libItem.path, type: 'item' });
  }

  async function openSpellPage(ref: { name: string; sourceKey?: string }) {
    const info = resolveSpell(ref);
    if (!info?.path) return;
    if (!(await confirmNavigation())) return; // ungespeicherte Charakter-Änderungen
    const name = info.path.split('/').pop()?.replace('.json', '') ?? ref.name;
    activeFile.set({ name, path: info.path, type: 'spell' });
  }

  function inlineWeaponInfo(item: Item): string {
    if (!item.damage) return '';
    const dice = formatDamageDice(item.damage.damage_dice);
    const typeKey = item.damage.damage_type.index;
    const typeLabel = (DAMAGE_TYPE_LABELS[typeKey] ?? item.damage.damage_type.name).replace('schaden', '');
    let s = `${dice} ${typeLabel}`;
    if (item.two_handed_damage) {
      const d2 = formatDamageDice(item.two_handed_damage.damage_dice);
      s += ` / ${d2}`;
    }
    return s;
  }

  // Zauber werden per Key (Fallback Name) an die Bibliothek gebunden — wie Items.
  const spellIndex = $derived(buildSpellIndex(spellLibrary));
  const resolveSpell = (ref: { name: string; sourceKey?: string }): SpellInfo | undefined =>
    matchSpell(spellIndex, ref);
  function spellColor(ref: { name: string; sourceKey?: string }): string {
    const school = resolveSpell(ref)?.school;
    return school ? (SCHOOL_COLORS[school] ?? '') : '';
  }

  // ─── Zauber-Daten-Cache + Hover-Tooltip (analog Item-Tooltip) ────────
  let spellDataCache = $state(new Map<string, Spell | null>());
  let spellTooltip = $state<Spell | null>(null);

  // Alle Zauber des Charakters vorab laden, damit beim Hover sofort ein
  // Tooltip erscheint (kein Toggle, kein Ladezustand).
  $effect(() => {
    const spells = character?.spells;
    if (!spells) return;
    const refs = [
      ...(spells.cantrips ?? []),
      ...['1','2','3','4','5','6','7','8','9'].flatMap(
        lvl => spells.byLevel[lvl] ?? []
      ),
    ];
    for (const ref of refs) {
      const name = ref.name;
      if (spellDataCache.has(name)) continue;
      const info = resolveSpell(ref);
      if (!info?.path) continue;
      spellDataCache.set(name, null);  // als „in Arbeit" markieren
      spellDataCache = new Map(spellDataCache);
      loadSpellByPath(info.path).then(data => {
        spellDataCache.set(name, data);
        spellDataCache = new Map(spellDataCache);
      });
    }
  });

  function showSpellTooltip(e: MouseEvent, name: string) {
    const data = spellDataCache.get(name);
    if (!data) return;
    spellTooltip = data;
    updateTooltipPos(e);
  }
  function hideSpellTooltip() { spellTooltip = null; }

  const SCHOOL_LABELS: Record<string, string> = {
    abjuration: 'Bannmagie', conjuration: 'Beschwörung', divination: 'Erkenntnismagie',
    enchantment: 'Verzauberung', evocation: 'Hervorrufung', illusion: 'Illusionsmagie',
    necromancy: 'Nekromantie', transmutation: 'Verwandlung',
  };

  let printingSpells = $state(false);

  async function printSpellList() {
    const char = character;
    const spells = char?.spells;
    if (!spells) return;
    printingSpells = true;

    try {
      // Alle Zauber-Verweise sammeln: Zaubertricks + Stufe 1-9
      const refs = [
        ...(spells.cantrips ?? []),
        ...(['1','2','3','4','5','6','7','8','9'].flatMap(
          lvl => spells.byLevel[lvl] ?? []
        )),
      ];

      // Für jeden Verweis: Pfad aus Index (Key/Name), dann Daten laden (Cache nutzen)
      const spellObjects: Spell[] = [];
      for (const ref of refs) {
        let data = spellDataCache.get(ref.name) ?? null;
        if (!data) {
          const info = resolveSpell(ref);
          if (info?.path) {
            data = await loadSpellByPath(info.path);
            spellDataCache.set(ref.name, data);
            spellDataCache = new Map(spellDataCache);
          }
        }
        if (data) spellObjects.push(data);
      }

      if (!spellObjects.length) return;

      const html = prepareMultiSpellPrint(spellObjects, document);
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument!;
      doc.open(); doc.write(html); doc.close();
      const charName = char.name || 'Charakter';
      setTimeout(() => {
        const prev = document.title;
        document.title = `${charName} – Zauberkarten`;
        iframe.contentWindow!.focus();
        iframe.contentWindow!.print();
        document.title = prev;
        setTimeout(() => document.body.removeChild(iframe), 2000);
      }, 0);
    } finally {
      printingSpells = false;
    }
  }

  const gmNotesPath = $derived(`${dirPath}/gm-notes.md`);
  const detailsPath = $derived(`${dirPath}/details.md`);
  const legacyDetailsPath = $derived(`${dirPath}/freitext.md`);  // Migration: altes Format
  const jsonPath = $derived(`${dirPath}/character.json`);

  // GM-Notizen & Details laden, wenn der Charakter (dirPath) wechselt.
  // character.json selbst lädt der Karten-Editor (ed) über activeFile.
  $effect(() => {
    const dir = dirPath;
    if (!dir) return;
    if (freitextTimer) { clearTimeout(freitextTimer); freitextTimer = null; }
    if (gmNotesTimer) { clearTimeout(gmNotesTimer); gmNotesTimer = null; }
    error = '';
    loadSideFiles();
  });

  async function loadSideFiles() {
    // GM-Notizen laden (oder aus Template anlegen).
    try {
      gmNotes = await invoke<string>('read_file_content', { path: gmNotesPath });
    } catch {
      let tmpl = '';
      try {
        tmpl = await invoke<string>('read_file_content', { path: './vault/templates/character.md' });
      } catch { /* kein Template */ }
      gmNotes = `# GM-Notizen: ${character?.name ?? ''}\n\n` + (tmpl || `## Hintergrund\n\n## Geheimnisse & Hooks\n\n## Verbindungen\n\n## Entwicklung\n\n## DM-Notizen\n`);
      await invoke('write_file_content', { path: gmNotesPath, content: gmNotes });
    }

    // Details laden (optional — leer, wenn noch nicht vorhanden).
    // Migration: alte freitext.md weiterlesen, solange noch keine details.md existiert.
    try {
      freitext = await invoke<string>('read_file_content', { path: detailsPath });
    } catch {
      try {
        freitext = await invoke<string>('read_file_content', { path: legacyDetailsPath });
      } catch {
        freitext = '';
      }
    }
    freitextSaving = 'saved';
    gmNotesSaving = 'saved';
  }

  async function importPdfIntoExisting() {
    if (!character) return;
    const defaultPath = await invoke<string>('get_absolute_path', { path: dirPath }).catch(() => undefined);
    const selected = await openFileDialog({
      multiple: false,
      defaultPath,
      filters: [{ name: 'PDF Charakterbogen', extensions: ['pdf'] }],
    });
    if (!selected) return;

    importingPdf = true;
    error = '';
    try {
      const path = selected as string;
      const base64 = await invoke<string>('read_file_base64', { path });
      const bytes = base64ToBytes(base64);
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const form = pdf.getForm();

      const fields: Record<string, string> = {};
      for (const field of form.getFields()) {
        const n = field.getName();
        try { fields[n] = form.getTextField(n).getText() ?? ''; }
        catch { try { fields[n] = form.getCheckBox(n).isChecked() ? 'On' : 'Off'; } catch { fields[n] = ''; } }
      }

      const imported = parseCharacterData(fields);
      // Zauber aus dem aktuellen Charakter behalten (manuell gepflegt)
      imported.spells = character?.spells ?? emptySpells();

      const pdfFilename = (selected as string).split(/[/\\]/).pop() ?? '';
      const json: CharacterJSON = {
        ...imported,
        // BEWUSST v1: PDF-Felder sind Freitext (Klasse/Volk/Hintergrund). Die
        // Upgrade-Pipeline (schemas/character.ts) strukturiert sie beim ersten Laden.
        _version: 1,
        _importedFrom: pdfFilename,
        _importedAt: new Date().toISOString(),
      };
      const content = JSON.stringify(json, null, 2);
      await invoke('write_file_content', { path: jsonPath, content });
      // In den Editor übernehmen (Draft + Baseline → nicht „dirty").
      ed.applyContent(content);
    } catch (e) {
      error = `PDF-Import fehlgeschlagen: ${e}`;
    } finally {
      importingPdf = false;
    }
  }

  async function exportToPdf() {
    if (!character) return;
    exportingPdf = true;
    error = '';
    try {
      const templateB64 = await invoke<string>('read_file_base64', { path: './vault/templates/ataendler_v2.8.2.pdf' });
      const templateBytes = base64ToBytes(templateB64);
      const json = {
        _version: 1 as const,
        _importedFrom: pdfName || undefined,
        _importedAt: new Date().toISOString(),
        ...character,
      };

      // Portrait laden, falls vorhanden
      let portrait: { bytes: Uint8Array; format: 'png' | 'jpg' } | undefined;
      if (character.portraitFile) {
        try {
          const portraitB64 = await invoke<string>('read_file_base64', {
            path: `${dirPath}/${character.portraitFile}`,
          });
          portrait = {
            bytes: base64ToBytes(portraitB64),
            format: character.portraitFile.toLowerCase().endsWith('.png') ? 'png' : 'jpg',
          };
        } catch { /* Portrait nicht ladbar → ohne weitermachen */ }
      }

      // Derselbe Resolver wie für die Pille in der Angriffstabelle — PDF und Bogen
      // zeigen damit garantiert dieselbe Eigenschaft.
      const pdfBytes = await exportCharacterToPdf(json, templateBytes, {
        portrait,
        freitext,
        masteryOf: (n) => { const m = masteryOf(n); return m ? masteryLabel(m) : undefined; },
      });
      const b64 = bytesToBase64(pdfBytes);
      const safeName = character.name.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_') || 'charakter';
      // Ziel per Datei-Speichern-Dialog wählen.
      const target = await saveFileDialog({
        defaultPath: `${safeName}-export.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!target) return;
      await invoke('write_file_base64', { path: target, data: b64 });
    } catch (e) {
      error = `PDF-Export fehlgeschlagen: ${e}`;
    } finally {
      exportingPdf = false;
    }
  }

  // ─── GM-Notizen (auto-save mit Debounce, wie Details) ─────────────────────
  let gmNotesTimer: ReturnType<typeof setTimeout> | null = null;

  async function writeGmNotes(path: string, content: string) {
    try {
      gmNotesSaving = 'saving';
      await invoke('write_file_content', { path, content });
      gmNotesSaving = 'saved';
    } catch {
      gmNotesSaving = 'unsaved';
    }
  }

  function onGmNotesChange(md: string) {
    gmNotes = md;
    gmNotesSaving = 'unsaved';
    const path = gmNotesPath;
    if (gmNotesTimer) clearTimeout(gmNotesTimer);
    gmNotesTimer = setTimeout(() => writeGmNotes(path, md), 800);
  }

  // ─── Freitext (auto-save mit Debounce, wie der Kampagnen-Editor) ──────────
  let freitextTimer: ReturnType<typeof setTimeout> | null = null;

  // Pfad beim Planen festhalten, damit ein noch laufender Timer nach einem
  // Charakterwechsel nicht den falschen Charakter überschreibt.
  async function writeFreitext(path: string, content: string) {
    try {
      freitextSaving = 'saving';
      await invoke('write_file_content', { path, content });
      freitextSaving = 'saved';
    } catch {
      freitextSaving = 'unsaved';
    }
  }

  function onFreitextChange(md: string) {
    freitext = md;
    freitextSaving = 'unsaved';
    const path = detailsPath;
    if (freitextTimer) clearTimeout(freitextTimer);
    freitextTimer = setTimeout(() => writeFreitext(path, md), 800);
  }

  function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function bytesToBase64(bytes: Uint8Array): string {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  function sign(n: number): string {
    return n >= 0 ? `+${n}` : `${n}`;
  }

  const ATTR_LABEL: Record<string, string> = { str: 'STR', ges: 'GES', kon: 'KON', int: 'INT', wei: 'WEI', cha: 'CHA' };
  // Bogen-Schlüssel → Attribut/Label. Bewusst `Map<string, …>`: die Schlüssel kommen aus
  // `character.skills` (offener Record) und können auch Fremd-/Altbestand enthalten.
  const skillAttrMap = new Map<string, string>(SKILL_DEFS.map(s => [s.key, s.attr]));
  const skillLabelMap = new Map<string, string>(SKILL_DEFS.map(s => [s.key, s.label]));

  function row(label: string, val: string | number): string {
    const v = typeof val === 'number' ? sign(val) : val;
    return `<span class="tip-row"><span class="tip-lbl">${label}</span><span class="tip-val">${v}</span></span>`;
  }
  function divider(): string { return `<span class="tip-div"></span>`; }
  function total(val: string | number): string {
    const v = typeof val === 'number' ? sign(val) : val;
    return `<span class="tip-row tip-total"><span class="tip-lbl"></span><span class="tip-val">${v}</span></span>`;
  }
  function step(label: string): string { return `<span class="tip-step">${label}</span>`; }

  function attrModTip(attr: string, score: number): string {
    const m = Math.floor((score - 10) / 2);
    return row(attr, String(score)) + step('− 10') + step('÷ 2') + divider() + total(m);
  }

  function saveTip(modKey: string, attrLabel: string, proficient: boolean): string {
    if (!character) return '';
    const attrMod = (character as any)[modKey] as number;
    const pb = character.proficiencyBonus;
    if (proficient) return row(`${attrLabel}-Mod`, attrMod) + row('Übungsbonus', pb) + divider() + total(attrMod + pb);
    return row(`${attrLabel}-Mod`, attrMod) + divider() + total(attrMod);
  }

  function skillTip(name: string, skill: { value: number; prof: boolean; exp: boolean }): string {
    if (!character) return '';
    const attr = skillAttrMap.get(name);
    if (!attr) return '';
    const attrLabel = ATTR_LABEL[attr] ?? attr.toUpperCase();
    const attrMod = (character as any)[`${attr}Mod`] as number;
    const pb = character.proficiencyBonus;
    if (skill.exp) return row(`${attrLabel}-Mod`, attrMod) + row('2× Übungsbonus', pb * 2) + divider() + total(skill.value);
    if (skill.prof) return row(`${attrLabel}-Mod`, attrMod) + row('Übungsbonus', pb) + divider() + total(skill.value);
    if (character.alleskoenner) return row(`${attrLabel}-Mod`, attrMod) + row('½ Übungsbonus', Math.floor(pb / 2)) + divider() + total(skill.value);
    return row(`${attrLabel}-Mod`, attrMod) + divider() + total(attrMod);
  }

  function attackBonusTip(bonus: string): string {
    return row('Angriffswurf', '1W20 + ' + bonus) + row('gegen', 'RK des Ziels');
  }
  function attackDamageTip(damage: string, type: string): string {
    return row('Schaden', damage) + (type ? row('Typ', type) : '');
  }

  const ATTRS = [
    { key: 'str', label: 'STR', mod: 'strMod' },
    { key: 'ges', label: 'GES', mod: 'gesMod' },
    { key: 'kon', label: 'KON', mod: 'konMod' },
    { key: 'int', label: 'INT', mod: 'intMod' },
    { key: 'wei', label: 'WEI', mod: 'weiMod' },
    { key: 'cha', label: 'CHA', mod: 'chaMod' },
  ] as const;

  const SAVES = [
    { label: 'STR', modKey: 'strMod', profKey: 'strSaveProf' },
    { label: 'GES', modKey: 'gesMod', profKey: 'gesSaveProf' },
    { label: 'KON', modKey: 'konMod', profKey: 'konSaveProf' },
    { label: 'INT', modKey: 'intMod', profKey: 'intSaveProf' },
    { label: 'WEI', modKey: 'weiMod', profKey: 'weiSaveProf' },
    { label: 'CHA', modKey: 'chaMod', profKey: 'chaSaveProf' },
  ] as const;

  const LEVEL_LABEL: Record<string, string> = {
    '1': 'Stufe 1', '2': 'Stufe 2', '3': 'Stufe 3', '4': 'Stufe 4', '5': 'Stufe 5',
    '6': 'Stufe 6', '7': 'Stufe 7', '8': 'Stufe 8', '9': 'Stufe 9',
  };
</script>

<div class="sheet">
  {#if error}
    <div class="error">{error}</div>
  {:else if character}
    <!-- Header (bleibt über allen Tabs sichtbar) -->
    <div class="header">
      {#if portraitUrl}
        <img class="portrait-thumb" src={portraitUrl} alt="Portrait von {character.name}" />
      {/if}
      <div class="name-block">
        <h1>{character.name}</h1>
        <span class="sub">{character.classLevel} · {character.race || formatSpecies(character.species)}</span>
      </div>
      <div class="header-meta">
        <span>Spieler: <strong>{character.playerName}</strong></span>
        <span>Hintergrund: <strong>{character.background}</strong></span>
        <span>EP: <strong>{character.xp}</strong></span>
      </div>
      <div class="header-actions">
        {#snippet pdfIcon()}
          <svg viewBox="0 0 24 24" width="16" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/>
            <text x="11.5" y="18.5" font-size="6.5" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle" font-family="sans-serif">PDF</text>
          </svg>
        {/snippet}
        <button class="icon-btn import" class:busy={importingPdf} onclick={importPdfIntoExisting} disabled={importingPdf}
                aria-label="PDF importieren" title="PDF importieren, aktuelle Werte überschreiben">
          <span class="arrow">&rarr;</span>{@render pdfIcon()}
        </button>
        <button class="icon-btn export" class:busy={exportingPdf} onclick={exportToPdf} disabled={exportingPdf}
                aria-label="Als PDF exportieren" title="Ausgefülltes ATaendler-PDF exportieren">
          {@render pdfIcon()}<span class="arrow">&rarr;</span>
        </button>
        <button class="icon-btn levelup" onclick={() => (showLevelUp = true)}
                aria-label="Stufenaufstieg" title="Stufenaufstieg (KI-gestützt)">⬆</button>
      </div>
    </div>

    {#if showLevelUp && ed.draft}
      <LevelUpAssistant character={ed.draft} onApply={applyLevelUp} onclose={() => (showLevelUp = false)} />
    {/if}

    <EditorPanel
      bind:tab={ed.tab}
      dirty={ed.dirty}
      saveError={ed.saveError}
      onsave={() => ed.save()}
      ondiscard={() => { upgradeAccepted = false; ed.discard(); }}
      onsavejson={(json) => ed.saveJson(json)}
      getJson={() => ed.draft ? JSON.stringify(ed.draft, null, 2) : ed.lastSavedContent}
      extraTabs={[{ id: 'details', label: 'Details' }, { id: 'notes', label: 'GM-Notizen' }]}
      style="--ep-accent: var(--arcane)"
    >
      {#snippet karte()}
      <div class="content">
        <!-- Attribute -->
        <div class="section attributes">
          {#each ATTRS as attr}
            <div class="attr-box">
              <div class="attr-label">{attr.label}</div>
              <div class="has-tip attr-mod">
                {sign((character as any)[attr.mod])}
                <span class="tip">{@html attrModTip(attr.label, (character as any)[attr.key])}</span>
              </div>
              <div class="attr-score">{(character as any)[attr.key]}</div>
            </div>
          {/each}
        </div>

        <div class="two-col">
          <!-- Kampfwerte -->
          <div class="section">
            <h3>Kampf</h3>
            <div class="stats-grid">
              <div class="stat"><span class="sl">RK</span><span class="sv">{character.ac}</span></div>
              <div class="stat"><span class="sl">Initiative</span><span class="sv">{character.initiative}</span></div>
              <div class="stat"><span class="sl">Bewegung</span><span class="sv">{character.speed}m</span></div>
              <div class="stat"><span class="sl">TP max</span><span class="sv">{character.hpMax}</span></div>
              <div class="stat"><span class="sl">TP aktuell</span><span class="sv">{character.hpCurrent || '—'}</span></div>
              <div class="stat"><span class="sl">Temp. TP</span><span class="sv">{character.hpTemp || '—'}</span></div>
              <div class="stat"><span class="sl">Trefferwürfel</span><span class="sv">{character.hitDice}</span></div>
              <div class="stat"><span class="sl">Übungsbonus</span><span class="sv">{sign(character.proficiencyBonus)}</span></div>
              <div class="stat"><span class="sl">Passiv Wahr.</span><span class="sv">{character.passivePerception}</span></div>
            </div>

            {#if character.attacks.length}
              <h3>Angriffe</h3>
              <table class="attack-table">
                <thead><tr><th>Waffe</th><th>Bonus</th><th>Schaden</th><th>RW</th></tr></thead>
                <tbody>
                  {#each character.attacks as atk}
                    {@const atkMastery = masteryOf(atk.name)}
                    <tr>
                      <td>
                        {atk.name}
                        {#if atkMastery}
                          <span class="mastery-tag" title={MASTERY_INFO[atkMastery].descDe}>{masteryLabel(atkMastery)}</span>
                        {/if}
                      </td>
                      <td class="has-tip">
                        {atk.bonus}
                        <span class="tip tip-left">{@html attackBonusTip(atk.bonus)}</span>
                      </td>
                      <td class="has-tip">
                        {atk.damage} {atk.type}
                        <span class="tip tip-left">{@html attackDamageTip(atk.damage, atk.type)}</span>
                      </td>
                      <td>{atk.range || '—'}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </div>

          <!-- Rettungswürfe -->
          <div class="section">
            <h3>Rettungswürfe</h3>
            <div class="save-list">
              {#each SAVES as save}
                {@const proficient = (character as any)[save.profKey]}
                {@const value = (character as any)[save.modKey] + (proficient ? character.proficiencyBonus : 0)}
                <div class="save-row has-tip" class:proficient>
                  <span class="prof-dot">{proficient ? '●' : '○'}</span>
                  <span class="save-label">{save.label}</span>
                  <span class="save-val">{sign(value)}</span>
                  <span class="tip tip-left">{@html saveTip(save.modKey, save.label, proficient)}</span>
                </div>
              {/each}
            </div>

            <h3>Sprachen</h3>
            <div class="tag-list">
              {#each character.languages as lang}<span class="tag">{lang}</span>{/each}
            </div>

            {#if character.tools.length}
              <h3>Werkzeuge</h3>
              <div class="tag-list">
                {#each character.tools as tool}<span class="tag">{tool}</span>{/each}
              </div>
            {/if}

            {#if character.proficiencies}
              {@const pf = character.proficiencies}
              {@const anyProf = pf.simpleWeapons || pf.martialWeapons || pf.lightArmor || pf.mediumArmor || pf.heavyArmor || pf.shields || (pf.otherWeapons && pf.otherWeapons.trim())}
              {#if anyProf}
                <h3>Übungen &amp; Rüstungsausbildung</h3>
                <div class="tag-list">
                  {#if pf.simpleWeapons}<span class="tag">Einfache Waffen</span>{/if}
                  {#if pf.martialWeapons}<span class="tag">Kriegswaffen</span>{/if}
                  {#if pf.lightArmor}<span class="tag">Leichte Rüstung</span>{/if}
                  {#if pf.mediumArmor}<span class="tag">Mittlere Rüstung</span>{/if}
                  {#if pf.heavyArmor}<span class="tag">Schwere Rüstung</span>{/if}
                  {#if pf.shields}<span class="tag">Schilde</span>{/if}
                </div>
                {#if pf.otherWeapons && pf.otherWeapons.trim()}
                  <p class="prof-extra"><strong>Weitere Waffen:</strong> {pf.otherWeapons}</p>
                {/if}
              {/if}
            {/if}

            <!-- Waffenbeherrschung: die Wahl selbst; die Eigenschaft kommt aus der
                 Bibliothek, der Regeltext hängt im Tooltip. -->
            {#if masteryChips.length}
              <h3>Waffenbeherrschung</h3>
              <div class="tag-list">
                {#each masteryChips as chip}
                  {#if chip.mastery}
                    <span class="tag mastery-tag-full" title={MASTERY_INFO[chip.mastery].descDe}>
                      {chip.name} <span class="mastery-prop">({masteryLabel(chip.mastery)})</span>
                    </span>
                  {:else}
                    <span class="tag" title="Waffe nicht in der Bibliothek — Eigenschaft unbekannt">
                      {chip.name} <span class="mastery-unknown">(?)</span>
                    </span>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <!-- Fertigkeiten -->
        <div class="section">
          <h3>Fertigkeiten {character.alleskoenner ? '<small>(Alleskönner)</small>' : ''}</h3>
          <div class="skill-grid">
            {#each Object.entries(character.skills) as [name, skill]}
              <div class="skill-row has-tip" class:proficient={skill.prof} class:expertise={skill.exp}>
                <span class="prof-dot">{skill.exp ? '★' : skill.prof ? '●' : '○'}</span>
                <span class="skill-name">{skillLabelMap.get(name) ?? name}</span>
                <span class="skill-val">{sign(skill.value)}</span>
                <span class="tip">{@html skillTip(name, skill)}</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- Persönlichkeit & Klassenmerkmale -->
        <div class="two-col">
          <div class="section">
            <h3>Persönlichkeit</h3>
            {#if character.traits}<p><strong>Merkmale:</strong> {character.traits}</p>{/if}
            {#if character.ideals}<p><strong>Ideale:</strong> {character.ideals}</p>{/if}
            {#if character.bonds}<p><strong>Bindungen:</strong> {character.bonds}</p>{/if}
            {#if character.flaws}<p><strong>Makel:</strong> {character.flaws}</p>{/if}
          </div>
          <div class="section">
            <h3>Klassenmerkmale</h3>
            <p class="preformatted">{character.classFeatures}</p>
          </div>
        </div>

        <!-- Persönliches -->
        {#if character.personal}
          {@const p = character.personal}
          {@const hasAnyPersonal = p.alter || p.geschlecht || p.sizeCat || p.koerpergroesse || p.gewicht || p.gesinnung || p.glaube || p.lebensstil || p.taeglicheKosten || p.augenfarbe || p.haarfarbe || p.hautfarbe || p.aussehen || p.rassenmerkmale}
          {#if hasAnyPersonal}
            <div class="two-col">
              <div class="section">
                <h3>Persönliches</h3>
                <div class="personal-stats">
                  {#if p.alter}<div class="stat"><span class="sl">Alter</span><span class="sv">{p.alter}</span></div>{/if}
                  {#if p.geschlecht}<div class="stat"><span class="sl">Geschlecht</span><span class="sv">{p.geschlecht}</span></div>{/if}
                  {#if p.gesinnung}<div class="stat"><span class="sl">Gesinnung</span><span class="sv">{p.gesinnung}</span></div>{/if}
                  {#if p.glaube}<div class="stat"><span class="sl">Glaube</span><span class="sv">{p.glaube}</span></div>{/if}
                  {#if p.sizeCat}<div class="stat"><span class="sl">Größe</span><span class="sv">{p.sizeCat}</span></div>{/if}
                  {#if p.koerpergroesse}<div class="stat"><span class="sl">Körpergröße</span><span class="sv">{p.koerpergroesse}</span></div>{/if}
                  {#if p.gewicht}<div class="stat"><span class="sl">Gewicht</span><span class="sv">{p.gewicht}</span></div>{/if}
                  {#if p.augenfarbe}<div class="stat"><span class="sl">Augen</span><span class="sv">{p.augenfarbe}</span></div>{/if}
                  {#if p.haarfarbe}<div class="stat"><span class="sl">Haar</span><span class="sv">{p.haarfarbe}</span></div>{/if}
                  {#if p.hautfarbe}<div class="stat"><span class="sl">Haut</span><span class="sv">{p.hautfarbe}</span></div>{/if}
                  {#if p.lebensstil}<div class="stat"><span class="sl">Lebensstil</span><span class="sv">{p.lebensstil}</span></div>{/if}
                  {#if p.taeglicheKosten}<div class="stat"><span class="sl">Tägl. Kosten</span><span class="sv">{p.taeglicheKosten}</span></div>{/if}
                </div>
                {#if p.aussehen}<p class="preformatted"><strong>Aussehen:</strong> {p.aussehen}</p>{/if}
              </div>
              {#if p.rassenmerkmale}
                <div class="section">
                  <h3>Volksmerkmale</h3>
                  <p class="preformatted">{p.rassenmerkmale}</p>
                </div>
              {/if}
            </div>
          {/if}
        {/if}

        <!-- Verknüpfte Merkmale (aus der Bibliothek aufgelöst, read-only) -->
        {#snippet featureList(feature: ResolvedFeature)}
          <li>
            <div class="ref-view-head">
              <span class="ref-view-name">{feature.name}</span>
              {#if feature.gainedAt}<span class="ref-view-level">Stufe {feature.gainedAt}</span>{/if}
              {#if feature.choice}<span class="ref-view-choice">Entscheidung: {feature.choice}</span>{/if}
            </div>
            {#if feature.desc}<div class="ref-view-desc"><Markdown source={feature.desc} /></div>{/if}
          </li>
        {/snippet}
        {#snippet groupBlock(group: ResolvedFeatureGroup)}
          <div class="section">
            <h3>{group.title}</h3>
            {#if group.unresolved}
              <p class="ref-unresolved">Nicht in der Bibliothek verlinkt – im Editor zuordnen oder anlegen.</p>
            {:else if group.features.length}
              <ul class="ref-view-list">
                {#each group.features as feature}{@render featureList(feature)}{/each}
              </ul>
            {/if}
          </div>
        {/snippet}
        {#if hasFeatureRefs}
          <details class="ref-view" bind:open={featuresOpen}>
            <summary>Verknüpfte Merkmale (Klasse, Volk, Hintergrund, Talente)</summary>
            <div class="ref-view-body">
              {#each classFeatureGroups as group}{@render groupBlock(group)}{/each}
              {#each speciesTraitGroups as group}{@render groupBlock(group)}{/each}
              {#each backgroundGroups as group}{@render groupBlock(group)}{/each}
              {#if featEntries.length}
                <div class="section">
                  <h3>Talente</h3>
                  <ul class="ref-view-list">
                    {#each featEntries as feature}{@render featureList(feature)}{/each}
                  </ul>
                </div>
              {/if}
              {#if orphanChoices.length}
                <div class="section">
                  <h3>Entscheidungen ohne zugeordnetes Merkmal</h3>
                  <p class="ref-unresolved">Verlinkung prüfen – das Merkmal steckt in keiner Klasse, keinem Volk und keinem Hintergrund dieses Charakters.</p>
                  <ul class="ref-view-list">
                    {#each orphanChoices as feature}{@render featureList(feature)}{/each}
                  </ul>
                </div>
              {/if}
            </div>
          </details>
        {/if}

        <!-- Inventar -->
        <div class="section">
          <h3>Inventar</h3>
          <div class="currency-row">
            {#each [['KM','Kupfer'],['SM','Silber'],['EM','Elektrum'],['GM','Gold'],['PM','Platin']] as [key, label]}
              {@const val = (character.currency as any)[key.toLowerCase()]}
              <div class="coin" class:empty={!val}>
                <span class="coin-val">{val || '—'}</span>
                <span class="coin-lbl">{key}</span>
              </div>
            {/each}
          </div>

          {#if character.inventory.length}
            <table class="inv-table">
              <thead><tr><th>Gegenstand</th><th>Anz.</th><th>Gew.</th></tr></thead>
              <tbody>
                {#each character.inventory as item}
                  {@const libItem = matchItem(itemIndex, item)}
                  {@const fullItem = libItem ? itemDataRecord[libItem.path] : null}
                  <tr
                    class:inv-linked={!!libItem}
                    onclick={() => libItem && openItemPage(libItem)}
                    onmouseenter={(e) => libItem && showItemTooltip(e, libItem)}
                    onmousemove={(e) => tooltipItem && updateTooltipPos(e)}
                    onmouseleave={hideItemTooltip}
                  >
                    <td>
                      {#if libItem}
                        <span class="inv-dot" style="background:{CATEGORY_COLORS[libItem.category] ?? 'var(--border-strong)'}"></span>
                      {/if}
                      {libItem ? displayName(libItem) : item.name}
                      {#if fullItem && structuralType(fullItem) === 'weapon' && fullItem.damage}
                        <span class="inv-weapon-info">{inlineWeaponInfo(fullItem)}</span>
                      {:else if fullItem && structuralType(fullItem) === 'armor' && fullItem.armor_class}
                        <span class="inv-weapon-info">RK {fullItem.armor_class.base}{fullItem.armor_class.dex_bonus ? '+GES' : ''}</span>
                      {:else if fullItem?.rarity}
                        <span class="inv-weapon-info">{formatRarity(fullItem.rarity)}</span>
                      {/if}
                    </td>
                    <td class="num">{item.count || '—'}</td>
                    <td class="num">{lineWeightKg(item) > 0 ? formatKg(lineWeightKg(item)) + ' kg' : '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
            {#if totalWeightKg(character.inventory) > 0}
              <div class="weight-total">Gesamtlast: <strong>{formatKg(totalWeightKg(character.inventory))} kg</strong></div>
            {/if}
          {:else}
            <span class="empty-hint">Kein Inventar eingetragen</span>
          {/if}

          {#if character.inventoryNotes}
            <p class="preformatted" style="margin-top: 0.5rem">{character.inventoryNotes}</p>
          {/if}
        </div>

        <!-- Zauber -->
        {#if character.spells?.cantrips.length || Object.keys(character.spells?.byLevel ?? {}).length || character.spells?.spellcastingClass}
          <div class="section">
            <div class="section-head-row">
              <h3>Zauberwirken</h3>
              <button class="btn-spell-pdf" onclick={printSpellList} disabled={printingSpells}
                title="Alle Zauber als druckbare Karten (A6, 9/Seite)">
                {printingSpells ? '…' : '🖨 PDF'}
              </button>
            </div>
            {#if character.spells.spellcastingClass || character.spells.saveDC}
              <div class="stats-grid" style="margin-bottom:0.6rem">
                {#if character.spells.spellcastingClass}<div class="stat"><span class="sl">Klasse</span><span class="sv">{character.spells.spellcastingClass}</span></div>{/if}
                {#if character.spells.spellcastingAbility}<div class="stat"><span class="sl">Fähigkeit</span><span class="sv">{character.spells.spellcastingAbility}</span></div>{/if}
                {#if character.spells.saveDC}<div class="stat"><span class="sl">Zauber-SG</span><span class="sv">{character.spells.saveDC}</span></div>{/if}
                {#if character.spells.attackBonus}<div class="stat"><span class="sl">Angriffsbonus</span><span class="sv">{sign(character.spells.attackBonus)}</span></div>{/if}
              </div>
            {/if}
            {#each spellAccessRows as acc}
              <div class="stats-grid spell-access" style="margin-bottom:0.6rem">
                <div class="stat"><span class="sl">Merkmal</span><span class="sv">{acc.featureDe}</span></div>
                <div class="stat"><span class="sl">Fähigkeit</span><span class="sv">{acc.abilityDe}</span></div>
                <div class="stat"><span class="sl">Zauber-SG</span><span class="sv">{acc.saveDC}</span></div>
                <div class="stat"><span class="sl">Angriffsbonus</span><span class="sv">{sign(acc.attackBonus)}</span></div>
              </div>
            {/each}

            {#if character.spells.cantrips.length}
              <div class="spell-level-header"><span>Zaubertricks</span></div>
              <div class="spell-cards">
                {#each character.spells.cantrips as c}
                  {@const info = resolveSpell(c)}
                  {@const color = spellColor(c)}
                  <div class="scard" class:scard-linked={!!info?.path}
                    style="--sc:{color || 'var(--border-strong)'}"
                    role="button" tabindex="0"
                    onclick={() => openSpellPage(c)}
                    onkeydown={(e) => e.key === 'Enter' && openSpellPage(c)}
                    onmouseenter={(e) => showSpellTooltip(e, c.name)}
                    onmousemove={(e) => spellTooltip && updateTooltipPos(e)}
                    onmouseleave={hideSpellTooltip}>
                    <div class="scard-head">
                      <span class="scard-name">{c.name}</span>
                      <span class="scard-badges">
                        {#if info?.school}<span class="scard-school">{SCHOOL_LABELS[info.school] ?? info.school}</span>{/if}
                      </span>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#each ['1','2','3','4','5','6','7','8','9'] as lvl}
              {@const slots = character.spells.slots[Number(lvl) - 1]}
              {@const lvlSpells = character.spells.byLevel[lvl] ?? []}
              {#if lvlSpells.length || (slots?.total ?? 0) > 0}
                <div class="spell-level-header">
                  <span>{LEVEL_LABEL[lvl]}</span>
                  {#if slots?.total}
                    <span class="slot-badge">{slots.total} Slots</span>
                  {/if}
                </div>
                <div class="spell-cards">
                  {#each lvlSpells as spell}
                    {@const info = resolveSpell(spell)}
                    {@const color = spellColor(spell)}
                    <div class="scard" class:prepared={spell.prepared} class:scard-linked={!!info?.path}
                      style="--sc:{color || 'var(--border-strong)'}"
                      role="button" tabindex="0"
                      onclick={() => openSpellPage(spell)}
                      onkeydown={(e) => e.key === 'Enter' && openSpellPage(spell)}
                      onmouseenter={(e) => showSpellTooltip(e, spell.name)}
                      onmousemove={(e) => spellTooltip && updateTooltipPos(e)}
                      onmouseleave={hideSpellTooltip}>
                      <div class="scard-head">
                        <span class="scard-prep">{spell.prepared ? '●' : '○'}</span>
                        <span class="scard-name">{spell.name}</span>
                        <span class="scard-badges">
                          {#if info?.school}<span class="scard-school">{SCHOOL_LABELS[info.school] ?? info.school}</span>{/if}
                        </span>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
      {/snippet}

      {#snippet bearbeiten()}
        <!-- ─── Bearbeiten-Tab ──────────────────────────────────── -->
        <!-- Bei Last-/Verwerfen-Wechsel des Drafts neu aufsetzen, damit das Formular
             frisch aus dem Draft initialisiert (es mutiert ed.draft in place). -->
        {#if ed.draft}
          {#key ed.draft}
            <div class="edit-wrapper" style="width:100%">
              <!-- Das Formular zeigt den Schema-Rückstand der Datei zusammen mit allem
                   Nachverlinkbaren in EINEM Angebot — es kennt die Bibliotheks-Treffer. -->
              <CharacterEditForm bind:character={ed.draft} {dirPath} saved={savedCharacter}
                {pendingUpgrade} {upgradeAccepted} onAcceptUpgrade={() => (upgradeAccepted = true)} />
            </div>
          {/key}
        {/if}
      {/snippet}

      {#snippet extra(id)}
      {#if id === 'notes'}
      <!-- GM-Notizen Tab -->
      <div class="freetext-area">
        <div class="freetext-hint">
          <span>Nur für den Spielleiter — wird nicht ans PDF angehängt.</span>
          <span class="freetext-status" class:unsaved={gmNotesSaving === 'unsaved'} class:saving={gmNotesSaving === 'saving'}>
            {gmNotesSaving === 'saving' ? 'Speichert…' : gmNotesSaving === 'unsaved' ? '● ungespeichert' : 'Gespeichert'}
          </span>
        </div>
        <RichTextEditor value={gmNotes} onChange={onGmNotesChange} placeholder="Hintergrund, Geheimnisse, Hooks, Verbindungen, DM-Notizen …" />
      </div>

    {:else}
      <!-- Details Tab (Freitext) — wird beim PDF-Export als weitere Seite(n) angehängt -->
      <div class="freetext-area">
        <div class="freetext-hint">
          <span>Wird beim PDF-Export als zusätzliche Seite(n) angehängt.</span>
          <span class="freetext-status" class:unsaved={freitextSaving === 'unsaved'} class:saving={freitextSaving === 'saving'}>
            {freitextSaving === 'saving' ? 'Speichert…' : freitextSaving === 'unsaved' ? '● ungespeichert' : 'Gespeichert'}
          </span>
        </div>
        <RichTextEditor value={freitext} onChange={onFreitextChange} placeholder="Hintergrundgeschichte, Tagebuch, Notizen … – wird ans PDF angehängt." />
      </div>
      {/if}
      {/snippet}
    </EditorPanel>
  {:else}
    <div class="loading">Lade Charakterbogen…</div>
  {/if}
</div>

<ItemTooltip item={tooltipItem} x={tooltipX} y={tooltipY} />

<SpellTooltip spell={spellTooltip} x={tooltipX} y={tooltipY} />

<style>
  .sheet {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--ink);
    font-size: 0.9rem;
  }

  .loading, .error {
    padding: 2rem;
    color: var(--ink-muted);
    text-align: center;
  }
  .error { color: var(--danger); }

  .header {
    padding: 1rem 1.5rem 0;
    border-bottom: 1px solid var(--surface);
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 1rem;
  }

  .portrait-thumb {
    width: 64px;
    height: 80px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg);
  }

  .name-block h1 {
    margin: 0;
    font-size: 1.4rem;
    color: var(--arcane);
  }

  .sub { color: var(--ink-muted); font-size: 0.85rem; }

  .header-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.8rem;
    color: var(--ink-soft);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.3rem;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    font-size: 0.9rem;
    font-family: inherit;
    white-space: nowrap;
    cursor: pointer;
  }
  .icon-btn .arrow { font-size: 0.95rem; line-height: 1; }
  .icon-btn:disabled { opacity: 0.6; cursor: default; }
  .icon-btn.import:hover { border-color: var(--arcane); color: var(--arcane); }
  .icon-btn.export:hover { border-color: var(--green); color: var(--green); }
  .icon-btn.levelup { justify-content: center; font-weight: 700; }
  .icon-btn.levelup:hover { border-color: var(--arcane); color: var(--arcane); }
  .icon-btn.busy { animation: icon-pulse 1s ease-in-out infinite; }

  @keyframes icon-pulse {
    0%, 100% { opacity: 0.4; }
    50%      { opacity: 1; }
  }

  .edit-wrapper {
    min-height: 0;
  }


  .content {
    width: 100%;
    box-sizing: border-box;
    padding: 1rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .attributes {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .attr-box {
    background: var(--surface);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    text-align: center;
    min-width: 52px;
  }

  .attr-label { font-size: 0.7rem; color: var(--ink-muted); text-transform: uppercase; }
  .attr-mod { font-size: 1.2rem; font-weight: 700; color: var(--arcane); }
  .attr-score { font-size: 0.75rem; color: var(--ink-soft); }

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .section h3 {
    margin: 0 0 0.4rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
    border-bottom: 1px solid var(--surface);
    padding-bottom: 0.2rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .slot-badge {
    font-size: 0.7rem;
    background: var(--surface);
    color: var(--red);
    border-radius: 4px;
    padding: 0.05rem 0.4rem;
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.2rem 0.5rem;
    margin-bottom: 0.75rem;
  }

  /* Zweiter Zauberblock: abgesetzt, damit er nicht als Klassen-Zauberwirken gelesen wird. */
  .spell-access {
    border-left: 2px solid var(--copper);
    padding-left: 0.5rem;
  }

  .personal-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.2rem 0.5rem;
    margin-bottom: 0.75rem;
  }

  .stat { display: flex; justify-content: space-between; }
  .sl { color: var(--ink-muted); font-size: 0.8rem; }
  .sv { font-weight: 600; color: var(--ink); }

  .attack-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  .attack-table th {
    text-align: left;
    color: var(--ink-muted);
    font-weight: 400;
    padding: 0.15rem 0.3rem;
    border-bottom: 1px solid var(--surface);
  }
  .attack-table td { padding: 0.15rem 0.3rem; color: var(--ink); }

  .save-list { display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.75rem; }
  .save-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; }
  .save-row.proficient .save-val { color: var(--green); }
  .save-label { flex: 1; color: var(--ink-soft); }
  .save-val { font-weight: 600; }

  .skill-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.1rem 0.5rem;
  }
  .skill-row { display: flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; }
  .skill-row.proficient .skill-val { color: var(--green); }
  .skill-row.expertise .skill-val { color: var(--steel); }
  .skill-name { color: var(--ink-soft); }
  .skill-val { font-weight: 600; }

  .prof-dot { font-size: 0.65rem; color: var(--ink-muted); width: 0.8rem; }
  .proficient .prof-dot, .expertise .prof-dot { color: var(--green); }

  .tag-list { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }
  .prof-extra { font-size: 0.8rem; color: var(--ink-soft); margin: 0.2rem 0 0.4rem; }
  .tag {
    background: var(--surface);
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.75rem;
    color: var(--ink);
  }

  /* Waffenbeherrschung: kleine Pille hinter dem Angriffsnamen bzw. eigener Chip. */
  .mastery-tag {
    display: inline-block; margin-left: 0.3rem;
    border: 1px solid color-mix(in srgb, var(--copper) 45%, transparent);
    border-radius: 99px; padding: 0 0.35rem;
    font-size: 0.65rem; color: var(--copper); cursor: help; vertical-align: middle;
  }
  .mastery-tag-full { cursor: help; }
  .mastery-prop { color: var(--copper); }
  .mastery-unknown { color: var(--ink-muted); cursor: help; }

  .preformatted { white-space: pre-wrap; font-size: 0.82rem; color: var(--ink-soft); }

  /* ─── Referenzen (strukturiert, read-only) ───────────── */
  .ref-view { margin: 0.6rem 0; }
  .ref-view summary {
    cursor: pointer;
    user-select: none;
    list-style: none;
    font-weight: 600;
    color: var(--ink-muted);
    font-size: 0.85rem;
  }
  .ref-view summary::-webkit-details-marker { display: none; }
  .ref-view summary::before { content: '› '; color: var(--border); }
  .ref-view[open] summary::before { content: '▾ '; }
  .ref-view-body { display: flex; flex-direction: column; gap: 1rem; margin-top: 0.5rem; }
  .ref-view-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .ref-view-list li {
    margin: 0; padding: 0.4rem 0.55rem;
    border: 1px solid var(--border); border-radius: 5px;
    background: color-mix(in srgb, var(--surface) 40%, transparent);
  }
  .ref-view-head { display: flex; align-items: baseline; gap: 0.5rem; }
  .ref-view-name { font-weight: 700; font-variant: small-caps; color: var(--ink); }
  .ref-view-level { color: var(--ink-muted); font-size: 0.72rem; font-style: italic; }
  .ref-view-choice {
    color: var(--gold); font-size: 0.72rem; font-weight: 600;
    border: 1px solid var(--border); border-radius: 999px; padding: 0.02rem 0.4rem;
    background: color-mix(in srgb, var(--surface) 60%, transparent);
  }
  .ref-view-desc { color: var(--ink-soft); font-size: 0.78rem; line-height: 1.5; margin-top: 0.15rem; }
  .ref-unresolved { color: var(--ink-muted); font-size: 0.78rem; font-style: italic; }

  /* ─── Zauber (Anzeige im Bogen) ──────────────────────── */
  .spell-level-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
    border-bottom: 1px solid var(--surface);
    padding-bottom: 0.2rem;
    margin: 0.5rem 0 0.25rem;
  }

  .spell-list {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    margin-bottom: 0.2rem;
  }

  .spell-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.82rem;
  }

  .spell-name { flex: 1; }

  .prep-dot { font-size: 0.62rem; color: var(--border); width: 0.8rem; }
  .spell-row.prepared .prep-dot { color: var(--green); }

  .section-head-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0;
  }
  .section-head-row h3 { margin-bottom: 0; }

  .btn-spell-pdf {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--ink-soft);
    border-radius: 5px;
    padding: 0.2rem 0.6rem;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-spell-pdf:hover:not(:disabled) { color: var(--red); border-color: var(--red); }
  .btn-spell-pdf:disabled { opacity: 0.5; cursor: default; }

  /* ── Zauberkarten ─────────────────────────────────────── */
  .spell-cards {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.3rem;
  }

  .scard {
    border-left: 3px solid var(--sc);
    background: var(--bg);
    border-radius: 0 5px 5px 0;
    cursor: help;
    user-select: none;
    transition: background 0.1s;
  }
  .scard.scard-linked { cursor: pointer; }
  .scard:hover { background: var(--bg-raised); }

  .scard-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.5rem 0.3rem 0.6rem;
    font-size: 0.83rem;
  }

  .scard-prep { font-size: 0.6rem; color: var(--border); flex-shrink: 0; }
  .scard.prepared .scard-prep { color: var(--green); }

  .scard-name { flex: 1; color: var(--sc); font-weight: 500; }

  .scard-badges { display: flex; gap: 0.3rem; align-items: center; }
  .scard-school {
    font-size: 0.68rem;
    color: var(--border);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* Freitext */
  .freetext-area {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: calc(100% - 80px);
  }
  .freetext-hint {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.4rem 1.5rem;
    border-bottom: 1px solid var(--surface);
    font-size: 0.75rem;
    color: var(--ink-muted);
  }
  .freetext-status { color: var(--ink-muted); white-space: nowrap; }
  .freetext-status.unsaved { color: var(--danger); }
  .freetext-status.saving  { color: var(--ink-soft); }

  /* ── Tooltips ─────────────────────────────── */
  .has-tip {
    position: relative;
    cursor: help;
  }

  .tip {
    display: none;
    flex-direction: column;
    gap: 0.18rem;
    position: absolute;
    bottom: calc(100% + 7px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.45rem 0.7rem;
    font-size: 0.75rem;
    font-weight: 400;
    white-space: nowrap;
    color: var(--ink-soft);
    z-index: 50;
    pointer-events: none;
    box-shadow: 0 4px 14px rgba(0,0,0,0.5);
  }

  .tip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: var(--border);
  }

  .tip.tip-left {
    left: 0;
    transform: none;
  }
  .tip.tip-left::after {
    left: 1rem;
    transform: none;
  }

  .has-tip:hover > .tip {
    display: flex;
  }

  .tip :global(.tip-row) {
    display: flex;
    justify-content: space-between;
    gap: 1.5rem;
  }
  .tip :global(.tip-lbl) { color: var(--ink-muted); }
  .tip :global(.tip-val) {
    font-weight: 600;
    color: var(--arcane);
    text-align: right;
  }
  .tip :global(.tip-div) {
    display: block;
    border-top: 1px solid var(--border);
    margin: 0.1rem 0;
  }
  .tip :global(.tip-total .tip-val) {
    color: var(--ink);
    font-size: 0.85rem;
  }
  .tip :global(.tip-step) {
    display: block;
    color: var(--ink-muted);
    font-size: 0.72rem;
    padding-left: 0.15rem;
  }

  /* ── Inventar ─────────────────────────────── */
  .currency-row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .coin {
    background: var(--surface);
    border-radius: 6px;
    padding: 0.3rem 0.6rem;
    text-align: center;
    min-width: 46px;
  }
  .coin.empty { opacity: 0.4; }
  .coin-val { display: block; font-weight: 700; font-size: 0.95rem; color: var(--gold); }
  .coin-lbl { display: block; font-size: 0.65rem; color: var(--ink-muted); text-transform: uppercase; }

  .inv-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    margin-bottom: 0.4rem;
  }
  .inv-table th {
    text-align: left;
    color: var(--ink-muted);
    font-weight: 400;
    padding: 0.15rem 0.4rem 0.15rem 0;
    border-bottom: 1px solid var(--surface);
  }
  .inv-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-right: 0.3rem;
    vertical-align: middle;
    flex-shrink: 0;
  }

  .inv-linked { cursor: pointer; }
  .inv-linked:hover td { background: var(--bg); filter: brightness(1.15); }

  .inv-weapon-info {
    margin-left: 0.4rem;
    font-size: 0.74rem;
    color: var(--ink-muted);
    font-style: italic;
  }

  .inv-table td {
    padding: 0.2rem 0.4rem 0.2rem 0;
    color: var(--ink);
    border-bottom: 1px solid var(--bg);
  }
  .inv-table td.num { color: var(--ink-soft); text-align: right; padding-right: 0.75rem; }

  .weight-total {
    font-size: 0.78rem;
    color: var(--ink-muted);
    text-align: right;
    margin-top: 0.2rem;
  }
  .weight-total strong { color: var(--ink-soft); }

  .empty-hint {
    font-size: 0.8rem;
    color: var(--border);
    font-style: italic;
  }
</style>
