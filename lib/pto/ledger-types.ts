/**
 * Shared types + label map for the PTO ledger surface.
 *
 * Lives in `lib/` (NOT in a server-action file) so both the server action
 * `app/actions/pto-ledger.ts` and the client `pto-ledger-view.tsx` can
 * import these without violating the "`"use server"` files can only export
 * async functions" rule.
 */

/** Friendly labels surfaced in the UI table. Keep keys aligned with the DB enum. */
export const LEDGER_TYPE_LABELS: Record<string, string> = {
  annual_grant: "Annual Grant",
  usage: "Approved Time Off",
  adjustment: "Manual Adjustment",
  forfeit: "Forfeited",
  payout: "Vacation Cash-Out",
  termination_payout: "Termination Payout",
  termination_forfeit: "Termination Forfeit",
  opening_balance: "Opening Balance",
};

export type PtoLedgerBucket = "vacation" | "sick";
export type PtoLedgerEntryType = keyof typeof LEDGER_TYPE_LABELS;

export type PtoLedgerEntry = {
  id: string;
  bucket: PtoLedgerBucket;
  type: PtoLedgerEntryType;
  /** Friendly display label derived from `type`. */
  typeLabel: string;
  /** Hours delta. Positive = earned/added, negative = used/forfeited. */
  changeAmount: number;
  description: string;
  effectiveAt: string;
  createdAt: string;
};

export function isLedgerType(s: string): s is PtoLedgerEntryType {
  return Object.prototype.hasOwnProperty.call(LEDGER_TYPE_LABELS, s);
}

export function isPtoBucket(s: string): s is PtoLedgerBucket {
  return s === "vacation" || s === "sick";
}
