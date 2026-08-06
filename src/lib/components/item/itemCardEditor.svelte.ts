/**
 * Editor-Zustand einer Gegenstands-Karte: `CardEditor`-Draft plus die Text-Spiegel der
 * Listen-/Objektfelder, die im Formular Freitext, im Draft aber Struktur sind.
 */
import { createCardEditor, type CardEditor } from '$lib/editor/cardEditor.svelte';
import { ITEMS_PATH, dirOf, invalidateItemCache } from '$lib/itemLibrary';
import { CATEGORY_LABELS, CATEGORY_TO_DIR, PROPERTY_LABELS, PROPERTY_INDEX_BY_LABEL, rarityColor } from '$lib/itemLabels';
import { translateItem } from '$lib/services/aiActions/translateAction';
import type { ItemTranslation } from '$lib/schemas/translation';
import { convertDistances } from '$lib/utils/distanceText';
import { normalizeItem } from '$lib/utils/schemaValidation';
import { slugKeepUmlauts } from '$lib/utils/text';
import { invalidateVault } from '$lib/stores/campaign';
import type { Item } from '$lib/types';

const categoryKeyOf = dirOf;

function parseItem(content: string): Item | null {
  try { return normalizeItem(JSON.parse(content)); } catch { return null; }
}

function dirOfPath(path: string): string {
  return path.split('/').at(-2) ?? '';
}

export class ItemCardEditor {
  ed: CardEditor<Item>;

  draftDescText = $state('');
  draftDescDeText = $state('');
  draftPropsText = $state('');
  draftRarityName = $state('');

  #mirrored: Item | null = null;

  constructor() {
    this.ed = createCardEditor<Item>({
      type: 'item',
      label: 'Gegenstand',
      parse: parseItem,
      serialize: (d) => this.merged(d, 2),
      snapshot: (d) => this.merged(d),
      defaultName: (d) => slugKeepUmlauts(d.name || d.name_de || 'gegenstand'),
      location: {
        // Ein Kategoriewechsel im Editor verschiebt die Datei.
        bucketLabel: 'Kategorie',
        bucketOf: (d) => CATEGORY_TO_DIR[categoryKeyOf(d)],
        buckets: () => Object.entries(CATEGORY_LABELS)
          .map(([key, label]) => ({ value: CATEGORY_TO_DIR[key] ?? key, label })),
        resolvePath: (d, name, bucket) =>
          `${ITEMS_PATH}/${bucket ?? CATEGORY_TO_DIR[categoryKeyOf(d)] ?? 'other'}/${name}.json`,
      },
      onSaved: (path, { moved, oldPath }) => {
        invalidateItemCache(dirOfPath(oldPath ?? path));
        if (moved) invalidateItemCache(dirOfPath(path));
        invalidateVault();
      },
    });

    // Der Editor ersetzt den Draft bei Laden, Verwerfen, JSON-Übernahme und Neuanlage;
    // die Spiegel gehören zum Inhalt und müssen jedes Mal mitziehen.
    $effect(() => { if (this.ed.draft !== this.#mirrored) this.syncMirrors(this.ed.draft); });
  }

  /** Kopie mit eingearbeiteten Text-Spiegeln — Basis für Speichern UND Dirty-Check. */
  mergeDraftFields(base: Item): Item {
    const d = JSON.parse(JSON.stringify(base)) as Item;
    d.desc    = this.draftDescText.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
    d.desc_de = this.draftDescDeText ? this.draftDescDeText.split(/\n\n+/).map(s => s.trim()).filter(Boolean) : undefined;
    d.rarity  = this.draftRarityName ? { name: this.draftRarityName } : undefined;
    if (this.draftPropsText.trim()) {
      d.properties = this.draftPropsText.split(',').map(s => s.trim()).filter(Boolean)
        .map(label => {
          const index = PROPERTY_INDEX_BY_LABEL[label.toLowerCase()] ?? label.toLowerCase().replace(/\s+/g, '-');
          const name  = PROPERTY_LABELS[index] ?? label;  // englischer Name für JSON
          return { index, name };
        });
    } else {
      d.properties = undefined;
    }
    return d;
  }

  merged(draft: Item, indent?: number): string {
    return JSON.stringify(this.mergeDraftFields($state.snapshot(draft) as Item), null, indent);
  }

  syncMirrors(item: Item | null) {
    this.#mirrored = item;
    this.draftDescText   = (item?.desc    ?? []).join('\n\n');
    this.draftDescDeText = (item?.desc_de ?? []).join('\n\n');
    this.draftPropsText  = (item?.properties ?? []).map(p => PROPERTY_LABELS[p.index] ?? p.name).join(', ');
    this.draftRarityName = item?.rarity?.name ?? '';
    this.ed.captureBaseline();
  }

  // Die Karte zeigt den gespeicherten Stand; ein ungespeicherter Neuanlage-Draft hat keinen.
  saved = $derived.by((): { item: Item | null; parseError: string | null } => {
    if (this.ed.isNew) return { item: this.ed.draft, parseError: null };
    if (!this.ed.lastSavedContent) return { item: null, parseError: null };
    try {
      return { item: normalizeItem(JSON.parse(this.ed.lastSavedContent)), parseError: null };
    } catch (e) {
      return { item: null, parseError: e instanceof Error ? e.message : String(e) };
    }
  });
  item = $derived(this.saved.item);
  color = $derived(rarityColor(this.item?.rarity));

  applyImport(imported: Item) {
    if (!this.ed.draft) return;
    Object.assign(this.ed.draft, imported);
    this.draftDescText   = imported.desc.join('\n\n');
    this.draftDescDeText = '';
    this.draftPropsText  = (imported.properties ?? []).map((p) => PROPERTY_LABELS[p.index] ?? p.name).join(', ');
    this.draftRarityName = imported.rarity?.name ?? '';
  }

  buildTranslationRun() {
    if (!this.ed.draft) return null;
    const toTranslate: Record<string, unknown> = {};
    if (this.ed.draft.name) toTranslate.name = this.ed.draft.name;
    const desc = this.draftDescText.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
    if (desc.length) toTranslate.desc = desc;
    if (Object.keys(toTranslate).length === 0) return null;
    return translateItem(toTranslate);
  }

  /** Leere Felder bedeuten „nicht übersetzt" und bleiben unangetastet. */
  applyTranslation(t: ItemTranslation) {
    if (!this.ed.draft) return;
    if (t.name_de) this.ed.draft.name_de = convertDistances(t.name_de);
    if (t.desc_de.length) {
      const de = t.desc_de.map(convertDistances);
      this.ed.draft.desc_de = de;
      this.draftDescDeText = de.join('\n\n');
    }
  }

  applyAiResult(result: Item) {
    if (!this.ed.draft) return;
    Object.assign(this.ed.draft, result);
    this.draftDescText   = (result.desc ?? []).join('\n\n');
    this.draftDescDeText = (result.desc_de ?? []).join('\n\n');
    this.draftPropsText  = (result.properties ?? []).map((p) => PROPERTY_LABELS[p.index] ?? p.name).join(', ');
    this.draftRarityName = result.rarity?.name ?? '';
  }
}

export function createItemCardEditor(): ItemCardEditor {
  return new ItemCardEditor();
}
