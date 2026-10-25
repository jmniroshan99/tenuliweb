export interface CatalogueEntry {
  id: string;
  category: string;
  description: string;
  descriptionSi?: string;
  aliases: string[];
  unit: string;
  active: boolean;
  version?: number;
}
