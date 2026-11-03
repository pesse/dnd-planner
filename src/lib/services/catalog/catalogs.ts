import { characterCatalog } from './characterCatalog';
import { featCatalog } from './featCatalog';
import { itemCatalog } from './itemCatalog';
import { monsterCatalog } from './monsterCatalog';
import { backgroundCatalog, classCatalog, speciesCatalog } from './originCatalogs';
import { trapCatalog } from './trapCatalog';
import { spellLevelCatalog, spellSchoolCatalog } from './spellCatalog';
import type { CatalogKind, CatalogSpec } from './catalogTypes';

export const CATALOGS: Record<CatalogKind, CatalogSpec> = {
  monster: monsterCatalog,
  item: itemCatalog,
  feat: featCatalog,
  'spell-school': spellSchoolCatalog,
  'spell-level': spellLevelCatalog,
  character: characterCatalog,
  class: classCatalog,
  species: speciesCatalog,
  background: backgroundCatalog,
  trap: trapCatalog,
};
