import type { OwnPricing, OwnTier } from "../domain/types.ts";
import { OWN_PRICING_COLUMNS } from "./tabs.ts";

// The own-pricing tab, as the Sheet returns it: rows of cells, the first row its header.
// Columns are found by their header names, so Maya can reorder them or add her own. Cell
// values are data: a tier name is kept, a price is read as a number, and an error names the
// row only, never what is in it (the tab is internal data).

const AMOUNT = /^\$?\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)$/;

/** Brightloop's tiers from the tab's cells, and the problems found reading them. */
export function readOwnPricing(values: unknown[][]): { ownPricing: OwnPricing; errors: string[] } {
  const [header = [], ...rows] = values;
  const filled = rows.map((row, index) => ({ row, number: index + 2 })).filter(({ row }) => row.some((cell) => cellText(cell) !== ""));
  if (filled.length === 0) return { ownPricing: { state: "empty" }, errors: [] };

  const names = header.map((cell) => cellText(cell).toLowerCase());
  const tierAt = names.indexOf(OWN_PRICING_COLUMNS.tier.toLowerCase());
  const priceAt = names.indexOf(OWN_PRICING_COLUMNS.monthlyPrice.toLowerCase());
  if (tierAt < 0 || priceAt < 0) {
    return {
      ownPricing: { state: "unreadable" },
      errors: [`own-pricing tab has no "${OWN_PRICING_COLUMNS.tier}" or "${OWN_PRICING_COLUMNS.monthlyPrice}" column, so no comparison is made`],
    };
  }

  const tiers: OwnTier[] = [];
  const errors: string[] = [];
  for (const { row, number } of filled) {
    const name = cellText(row[tierAt]);
    const amount = AMOUNT.exec(cellText(row[priceAt]));
    if (!name) errors.push(`own-pricing tab row ${number} left out: it has no tier name`);
    else if (!amount) errors.push(`own-pricing tab row ${number} left out: its monthly price is not a number`);
    else tiers.push({ name, monthlyUsd: Number(amount[1].replaceAll(",", "")) });
  }
  return { ownPricing: tiers.length > 0 ? { state: "read", tiers } : { state: "unreadable" }, errors };
}

function cellText(cell: unknown): string {
  return typeof cell === "string" || typeof cell === "number" ? String(cell).trim() : "";
}
