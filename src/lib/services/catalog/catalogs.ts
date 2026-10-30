import { characterCatalog } from './characterCatalog';
import { featCatalog } from './featCatalog';
import { itemCatalog } from './itemCatalog';
import { monsterCatalog } from './monsterCatalog';
import { spellLevelCatalog, spellSchoolCatalog } from './spellCatalog';
import type { CatalogKind, CatalogSpec } from './catalogTypes';

export const CATALOGS: Record<CatalogKind, CatalogSpec> = {
  monster: monsterCatalog,
  item: itemCatalog,
  feat: featCatalog,
  'spell-school': spellSchoolCatalog,
  'spell-level': spellLevelCatalog,
  character: characterCatalog,
};
