export interface PropertyRow {
  key: string;
  value: string;
  colorSwatch?: string;
}

export interface PropertySection {
  id: string;
  title: string;
  rows: PropertyRow[];
  defaultOpen?: boolean;
}

export type PropertyBuilder = (entity: Record<string, unknown>) => PropertySection[];
