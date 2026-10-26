export interface FinanceAccount { _id: string; code: string; name: string; type: 'asset' | 'liability' | 'equity' | 'income' | 'expense'; parentId?: string; posting: boolean; active: boolean; systemKey?: string; version: number }
export interface FinancePolicy { cutoverDate: string }
export interface JournalLine { accountId: string; code?: string; name?: string; type?: string; debitMinor: number; creditMinor: number }
export interface Journal { _id: string; key: string; dateKey: string; currency: string; description: string; source: string; sourceId?: string; status: string; lines: JournalLine[]; createdBy: string; version: number; reversedBy?: string; reversalOf?: string; openingLinks?: unknown; history: Array<{ action: string; reason: string; at: string }> }
export interface FinanceReportRow { _id: string; code: string; name: string; type: string; openingMinor: number; debitMinor: number; creditMinor: number; balanceMinor: number }
export interface FinanceReport { rows: FinanceReportRow[]; currency: string; policy?: FinancePolicy; ledgerTruncated: boolean; ledger: Array<{ _id: string; key: string; dateKey: string; description: string; source: string; lines: JournalLine }> }
