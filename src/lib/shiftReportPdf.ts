import type { ShiftReport } from '../types/posShift';

export interface ShiftReportPdfInput {
    report: ShiftReport;
    shopName: string;
    shopAddress?: string;
    shopPhone?: string;
    formatCurrency: (value: number) => string;
    includeInstallments: boolean;
}

interface PdfLine {
    text: string;
    bold?: boolean;
    align?: 'left' | 'center' | 'right';
    size?: number;
    gapBefore?: number;
}

const PAGE_WIDTH = 226.77; // 80mm thermal roll
const MARGIN = 13;
const LINE_HEIGHT = 11;
const TEXT_WIDTH = 39;

const sanitize = (value: unknown) => String(value ?? '')
    .replace(/[₨₹]/g, 'Rs')
    .replace(/﷼/g, 'SAR')
    .replace(/[^\x20-\xFF]/g, '?');

const escapePdf = (value: string) => sanitize(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const truncate = (value: string, length: number) => {
    const clean = sanitize(value);
    if (clean.length <= length) return clean;
    return `${clean.slice(0, Math.max(1, length - 3))}...`;
};

const leftRight = (left: string, right: string, width = TEXT_WIDTH) => {
    const safeRight = truncate(right, Math.floor(width * 0.55));
    const safeLeft = truncate(left, Math.max(1, width - safeRight.length - 1));
    return `${safeLeft}${' '.repeat(Math.max(1, width - safeLeft.length - safeRight.length))}${safeRight}`;
};

const divider = '-'.repeat(TEXT_WIDTH);

const buildLines = ({ report, shopName, shopAddress, shopPhone, formatCurrency: fallbackFormatCurrency, includeInstallments }: ShiftReportPdfInput) => {
    const formatCurrency = (value: number) => report.currency
        ? new Intl.NumberFormat('en', { style: 'currency', currency: report.currency }).format(value)
        : fallbackFormatCurrency(value);
    const lines: PdfLine[] = [];
    const heading = (label: string) => lines.push({ text: label, bold: true, gapBefore: 5 }, { text: divider });
    const pair = (label: string, value: string, bold = false) => lines.push({ text: leftRight(label, value), bold });

    lines.push({ text: shopName || 'ItemHive', bold: true, align: 'center', size: 12 });
    if (shopAddress) lines.push({ text: truncate(shopAddress, TEXT_WIDTH), align: 'center' });
    if (shopPhone) lines.push({ text: truncate(shopPhone, TEXT_WIDTH), align: 'center' });
    lines.push({ text: 'SHIFT CLOSING REPORT', bold: true, align: 'center', size: 10, gapBefore: 5 });
    lines.push({ text: divider });
    pair('Report Date', new Date(report.reportTime).toLocaleString());
    pair('Register', report.registerName);
    pair('Shift', report.shiftCode);
    pair('Open Date', new Date(report.openedAt).toLocaleString());
    pair('Cashier', report.cashierName);

    heading('SALES DETAILS');
    pair('Opening Cash', formatCurrency(report.openingCash));
    pair('Gross Sales', formatCurrency(report.totals.grossSales));
    pair('Discount', `-${formatCurrency(report.totals.discounts)}`);
    pair('Tax Amount', formatCurrency(report.totals.tax));
    pair('Net Sales', formatCurrency(report.totals.netSales), true);
    const totalCollected = report.totals.totalCollected ?? (
        report.totals.cashSales + report.totals.cardSales
        + report.totals.creditCashReceived + report.totals.creditCardReceived
        + report.totals.creditCollectionsCash + report.totals.creditCollectionsCard
        + report.totals.installmentCashAdvance + report.totals.installmentCardAdvance
        + report.totals.installmentCollectionsCash + report.totals.installmentCollectionsCard
    );
    pair('Total Collected', formatCurrency(totalCollected), true);

    heading('INSIGHTS');
    pair('Completed Orders', String(report.totals.completedOrders));
    pair('Items Sold', String(report.totals.itemsSold));

    heading('PAYMENT-WISE SALES');
    lines.push({ text: `${'Method'.padEnd(17)}${'Orders'.padStart(7)}${'Amount'.padStart(15)}`, bold: true });
    const payments = (report.paymentSummary?.length ? report.paymentSummary : [
        { method: 'cash' as const, orderCount: 0, amount: report.totals.cashSales },
        { method: 'card' as const, orderCount: 0, amount: report.totals.cardSales },
        { method: 'credit' as const, orderCount: 0, amount: report.totals.creditSales },
        { method: 'installment' as const, orderCount: 0, amount: report.totals.installmentSales },
    ]).filter((entry) => includeInstallments || entry.method !== 'installment');
    payments.forEach((entry) => lines.push({
        text: `${truncate(entry.method.toUpperCase(), 17).padEnd(17)}${String(entry.orderCount || '-').padStart(7)}${truncate(formatCurrency(entry.amount), 15).padStart(15)}`,
    }));

    if (report.orderTypeSummary?.length) {
        heading('ORDER-TYPE SALES');
        lines.push({ text: `${'Type'.padEnd(17)}${'Orders'.padStart(7)}${'Amount'.padStart(15)}`, bold: true });
        report.orderTypeSummary.forEach((entry) => lines.push({
            text: `${truncate(entry.orderType, 17).padEnd(17)}${String(entry.orderCount).padStart(7)}${truncate(formatCurrency(entry.amount), 15).padStart(15)}`,
        }));
    }

    if (report.soldItems?.length) {
        heading('SOLD ITEM DETAILS');
        lines.push({ text: `${'Item'.padEnd(21)}${'Qty'.padStart(5)}${'Amount'.padStart(13)}`, bold: true });
        report.soldItems.forEach((item) => lines.push({
            text: `${truncate(item.productName, 21).padEnd(21)}${String(item.quantity).padStart(5)}${truncate(formatCurrency(item.amount), 13).padStart(13)}`,
        }));
        lines.push({ text: divider });
        lines.push({ text: `${'TOTAL'.padEnd(21)}${String(report.totals.itemsSold).padStart(5)}${truncate(formatCurrency(report.totals.netSales), 13).padStart(13)}`, bold: true });
    }

    heading('CASH RECONCILIATION');
    pair('Opening Cash', formatCurrency(report.openingCash));
    pair('Expense Paid Out', formatCurrency(report.totals.expensePaidOut || 0));
    pair('Expense Refunds', formatCurrency(report.totals.expenseRefunds || 0));
    pair('Expected Cash', formatCurrency(report.totals.expectedDrawerCash), true);
    if (report.totals.countedCash != null) pair('Counted Cash', formatCurrency(report.totals.countedCash));
    if (report.totals.cashDifference != null) {
        const difference = report.totals.cashDifference;
        pair('Variance', difference > 0 ? `Over ${formatCurrency(difference)}` : difference < 0 ? `Short ${formatCurrency(Math.abs(difference))}` : 'Balanced', true);
    }
    lines.push({ text: divider, gapBefore: 5 });
    lines.push({ text: 'FINAL REPORT - SHIFT CLOSED', bold: true, align: 'center' });
    lines.push({ text: `Downloaded ${new Date().toLocaleString()}`, align: 'center', size: 7.5 });
    return lines;
};

const latin1Bytes = (text: string) => {
    const bytes = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 0xff;
    return bytes;
};

export const buildShiftReportPdfBlob = async (input: ShiftReportPdfInput): Promise<Blob> => {
    const lines = buildLines(input);
    const contentHeight = lines.reduce((height, line) => height + LINE_HEIGHT + (line.gapBefore || 0), 0);
    const pageHeight = Math.max(300, contentHeight + MARGIN * 2);
    let y = pageHeight - MARGIN;
    const operations: string[] = [];

    for (const line of lines) {
        y -= line.gapBefore || 0;
        const size = line.size || 8.5;
        const estimatedWidth = sanitize(line.text).length * size * 0.6;
        const x = line.align === 'center'
            ? Math.max(MARGIN, (PAGE_WIDTH - estimatedWidth) / 2)
            : line.align === 'right'
                ? Math.max(MARGIN, PAGE_WIDTH - MARGIN - estimatedWidth)
                : MARGIN;
        operations.push(`BT /${line.bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdf(line.text)}) Tj ET`);
        y -= LINE_HEIGHT;
    }

    const content = operations.join('\n');
    const contentBytes = latin1Bytes(content);
    const objects: Array<string | Uint8Array> = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>',
        new Uint8Array([...latin1Bytes(`<< /Length ${contentBytes.length} >>\nstream\n`), ...contentBytes, ...latin1Bytes('\nendstream')]),
    ];
    const chunks: Uint8Array[] = [];
    let length = 0;
    const write = (part: string | Uint8Array) => {
        const bytes = typeof part === 'string' ? latin1Bytes(part) : part;
        chunks.push(bytes);
        length += bytes.length;
    };
    write('%PDF-1.4\n');
    const offsets: number[] = [];
    objects.forEach((object, index) => {
        offsets.push(length);
        write(`${index + 1} 0 obj\n`);
        write(object);
        write('\nendobj\n');
    });
    const xref = length;
    write(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
    offsets.forEach((offset) => write(`${String(offset).padStart(10, '0')} 00000 n \n`));
    write(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
};

export const downloadShiftReportPdf = async (input: ShiftReportPdfInput) => {
    const blob = await buildShiftReportPdfBlob(input);
    const date = new Date(input.report.reportTime).toISOString().slice(0, 10);
    const safeShiftCode = input.report.shiftCode.replace(/[^a-z0-9_-]+/gi, '-');
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `shift-closing-report-${date}-${safeShiftCode}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};
