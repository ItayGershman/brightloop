// The Sheet as the run uses it. The Google adapter (google-sheet.ts) is one implementation;
// the tests hold another in memory, so no test touches the network.

export interface SheetStore {
  /** The own-pricing tab's cells, header row first. */
  readOwnPricing(): Promise<unknown[][]>;
  /** The changes tab's cells, header row first. */
  readChanges(): Promise<unknown[][]>;
  appendChanges(rows: string[][]): Promise<void>;
}

export interface SheetKeys {
  /** The service account's JSON key. */
  credentials: string;
  sheetId: string;
}
