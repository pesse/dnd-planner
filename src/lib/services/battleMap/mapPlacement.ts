/** Wohin eine Karte oder Vorlage geschrieben wird: Name, Kampagne und — nur bei Karten — Akt. */
import { promptDialog } from '../../stores/promptDialog';
import type { Campaign } from '../../types';

export interface MapPlacement {
  name: string;
  /** Ordnername der Kampagne unter `vault/campaigns`. */
  campaign: string;
  /** Fehlt bei Vorlagen. */
  act?: string;
}

export interface MapPlacementRequest {
  title: string;
  name: string;
  campaign: string;
  campaigns: Campaign[];
  /** Karten verlangen einen Akt, Vorlagen nicht. */
  withAct: boolean;
  act?: string;
}

const channel = promptDialog<MapPlacementRequest, MapPlacement | null>();

export const mapPlacementPrompt = channel.prompt;
export const askMapPlacement = channel.ask;
