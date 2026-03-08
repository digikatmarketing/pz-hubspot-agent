// ── HubSpot CRM object shapes ────────────────────────────────────────

export interface HubSpotObject {
  id: string;
  properties: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
}

export interface SearchFilter {
  propertyName: string;
  operator: "EQ" | "NEQ" | "LT" | "LTE" | "GT" | "GTE" | "BETWEEN" | "IN" | "NOT_IN" | "HAS_PROPERTY" | "NOT_HAS_PROPERTY" | "CONTAINS_TOKEN" | "NOT_CONTAINS_TOKEN";
  value?: string;
  values?: string[];
  highValue?: string;
}

export interface FilterGroup {
  filters: SearchFilter[];
}

export interface SortRule {
  propertyName: string;
  direction: "ASCENDING" | "DESCENDING";
}

export interface SearchRequest {
  filterGroups?: FilterGroup[];
  properties?: string[];
  limit?: number;
  after?: string;
  sorts?: SortRule[];
  query?: string;
}

export interface SearchResponse {
  total: number;
  results: HubSpotObject[];
  paging?: { next?: { after: string } };
}

export interface BatchReadResponse {
  results: HubSpotObject[];
}

export interface AssociationResult {
  from: { id: string };
  to: Array<{
    toObjectId: string;
    associationTypes: Array<{
      category: string;
      typeId: number;
      label?: string;
    }>;
  }>;
}

export interface AssociationResponse {
  results: AssociationResult[];
  paging?: { next?: { after: string } };
}

// ── Pipeline constants ───────────────────────────────────────────────

export const PIPELINE_ID = "2063105729";

export const STAGES: Record<string, { id: string; label: string; order: number }> = {
  "3271916229":  { id: "3271916229",  label: "Lead",              order: 1 },
  "3271938765":  { id: "3271938765",  label: "Meeting Booked",    order: 2 },
  "3271648990":  { id: "3271648990",  label: "Application",       order: 3 },
  "3271648991":  { id: "3271648991",  label: "Submission Check",  order: 4 },
  "3271648992":  { id: "3271648992",  label: "Consultant",        order: 5 },
  "3271648993":  { id: "3271648993",  label: "Doctor Review",     order: 6 },
  "3271648998":  { id: "3271648998",  label: "Approved by Doctor", order: 7 },
  "3271648995":  { id: "3271648995",  label: "Cancelled",         order: 8 },
};

export function stageName(stageId: string): string {
  return STAGES[stageId]?.label ?? `Unknown (${stageId})`;
}

// ── Association type constants ───────────────────────────────────────

export const ASSOC = {
  LINE_ITEM_TO_DEAL:            { category: "HUBSPOT_DEFINED", typeId: 20  },
  LINE_ITEM_TO_TREATMENT_PLAN:  { category: "USER_DEFINED",    typeId: 112 },
  RX_TO_DEAL:                   { category: "USER_DEFINED",    typeId: 81  },
  RX_TO_CONTACT:                { category: "USER_DEFINED",    typeId: 37  },
  RX_TO_TREATMENT_PLAN:         { category: "USER_DEFINED",    typeId: 110 },
  RX_TO_LINE_ITEM:              { category: "USER_DEFINED",    typeId: 79  },
  DEAL_TO_TREATMENT_PLAN:       { category: "USER_DEFINED",    typeId: 106 },
  DEAL_TO_CONTACT:              { category: "HUBSPOT_DEFINED", typeId: 3   },
  TREATMENT_PLAN_TO_CONTACT:    { category: "USER_DEFINED",    typeId: 104 },
} as const;

export const PRESCRIPTIONS_OBJECT_TYPE = "2-222586633";
export const TREATMENT_PLAN_OBJECT_TYPE = "2-225483975";

export const HUB_ID = "244494098";
export const UI_DOMAIN = "app-na2.hubspot.com";
