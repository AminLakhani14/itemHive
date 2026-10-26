export interface ExpensePayment {
  _id: string; key: string; amountMinor: number; dateKey: string; method: string; reference: string;
  actorName: string; reversedAt?: string; reversalReason?: string; shiftId?: string; reversalShiftId?: string;
}
export interface Expense {
  accountId?: string; journalEntryId?: string; accountingOrigin?: 'approval' | 'opening'; postingDateKey?: string;
  _id: string; title: string; category: string; dateKey: string; payee: string; reference: string; notes: string;
  currency: string; amountMinor: number; paidMinor: number; outstandingMinor: number; paymentStatus: string;
  status: string; version: number; createdBy: string; createdByName: string; approvedAt?: string;
  receipt?: { fileName: string; data?: string } | null;
  payments: ExpensePayment[]; history?: Array<{ action: string; actorName: string; reason: string; at: string }>;
}
export interface ExpenseMeta {
  create: boolean; reverse: boolean; void: boolean; financePolicy?: { cutoverDate: string } | null; accounts?: Array<{ _id: string; code: string; name: string; systemKey?: string }>;
  viewAll: boolean; approve: boolean; pay: boolean; currency: string; currencies: string[]; categories: string[];
  shift?: { _id: string; shiftCode: string; currency?: string } | null;
}
export interface ExpenseList {
  rows: Expense[]; total: number;
  totals: Array<{ currency: string; approvedMinor: number; paidMinor: number; pendingMinor: number; outstandingMinor: number }>;
}
