export interface ShiftReportTotals {
    completedOrders: number;
    itemsSold: number;
    grossSales: number;
    discounts: number;
    tax: number;
    netSales: number;
    cashSales: number;
    cardSales: number;
    creditSales: number;
    creditCashReceived: number;
    creditCardReceived: number;
    creditCollectionsCash: number;
    creditCollectionsCard: number;
    installmentSales: number;
    installmentCashAdvance: number;
    installmentCardAdvance: number;
    installmentCollectionsCash: number;
    installmentCollectionsCard: number;
    totalCollected?: number;
    expectedDrawerCash: number;
    expensePaidOut?: number;
    expenseRefunds?: number;
    countedCash?: number;
    cashDifference?: number;
}

export interface ShiftPaymentSummary {
    method: 'cash' | 'card' | 'credit' | 'installment';
    orderCount: number;
    amount: number;
}

export interface ShiftOrderTypeSummary {
    orderType: string;
    orderCount: number;
    amount: number;
}

export interface ShiftSoldItemSummary {
    productId: string;
    productName: string;
    quantity: number;
    amount: number;
}

export interface ShiftReport {
    currency?: string;
    shiftCode: string;
    registerName: string;
    cashierName: string;
    openingCash: number;
    openedAt: string;
    reportTime: string;
    status: 'open' | 'closed';
    totals: ShiftReportTotals;
    paymentSummary?: ShiftPaymentSummary[];
    orderTypeSummary?: ShiftOrderTypeSummary[];
    soldItems?: ShiftSoldItemSummary[];
}

export interface POSShift {
    currency?: string;
    _id: string;
    shiftCode: string;
    registerName: string;
    openingCash: number;
    status: 'open' | 'closed';
    openedByName: string;
    openedAt: string;
    closedByName?: string;
    closedAt?: string;
    countedCash?: number;
    cashDifference?: number;
    finalReport?: ShiftReport;
}
