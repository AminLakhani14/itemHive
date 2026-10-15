import * as XLSX from 'xlsx';
import { buildInvoicePdfBlob } from './invoicePdf';

export interface RequestVendor { id: string; name: string; phone: string; cnic?: string; address: string; version?: number; archived?: boolean }
export interface RequestItem { productId?: string; productName?: string; name: string; category?: string; sku?: string; quantity: number; receivedQuantity?: number; sizeId?: string; unit: string; vendorId: string; remarks: string }
export interface RequestReceiptLine {
    itemIndex: number; name: string; vendorId: string; vendorName: string; unit: string; orderedQuantity: number;
    quantity: number; totalReceived: number; remaining: number; productId?: string; productName?: string; sku?: string;
    stockAction: 'product_updated' | 'record_only' | 'previously_recorded';
}
export interface RequestReceipt {
    _id: string; kind: 'delivery' | 'opening_balance'; occurredAt?: string; createdAt: string;
    receivedByName: string; reference?: string; note?: string; deliveryStatus?: string; items: RequestReceiptLine[];
}
export interface StockRequestData {
    _id: string; createdAt: string; status: string; requestedByName: string; requestedByEmail: string;
    vendors?: RequestVendor[]; items?: RequestItem[]; decisionNote?: string;
    __v?: number; deliveryStatus?: 'not_received' | 'partial' | 'complete'; receivedAt?: string; receivedByName?: string;
}

// Continuation rows keep long vendor details and remarks readable in the PDF.
const wrapPdfRows = (rows: string[][]) => rows.flatMap(row => {
    const cells = row.map((value, index) => {
        // Fit even wide uppercase characters inside the PDF's fixed columns.
        const width = [12, 5, 20, 12][index];
        const lines: string[] = [];
        let line = '';
        for (const word of value.trim().split(/\s+/).filter(Boolean)) {
            if (line && line.length + word.length + 1 > width) { lines.push(line); line = ''; }
            const characters = Array.from(word);
            while (characters.length > width) { lines.push(characters.splice(0, width).join('')); }
            const remainder = characters.join('');
            if (remainder) line = line ? `${line} ${remainder}` : remainder;
        }
        if (line) lines.push(line);
        return lines;
    });
    return Array.from({ length: Math.max(1, ...cells.map(cell => cell.length)) }, (_, index) => cells.map(cell => cell[index] || ''));
});

export async function downloadStockRequest(request: StockRequestData, format: 'pdf' | 'xlsx') {
    const vendors = request.vendors || [];
    const rows = (request.items || []).map(item => [item.name, item.sku || '', String(item.quantity), item.unit, vendors.find(vendor => vendor.id === item.vendorId)?.name || '', item.remarks]);
    const filename = `inventory_request_${request._id}`;
    if (format === 'xlsx') {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
            ['Request', request._id], ['Date', new Date(request.createdAt).toLocaleString()], ['Status', request.status],
            ['Requested by', request.requestedByName], ['Email', request.requestedByEmail], ['Decision note', request.decisionNote || ''],
            ['Delivery status', request.deliveryStatus || 'not_received'], ['Last received', request.receivedAt ? new Date(request.receivedAt).toLocaleString() : ''], ['Received by', request.receivedByName || ''],
        ]), 'Request');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Vendor', 'Phone', 'Address', 'CNIC'], ...vendors.map(vendor => [vendor.name, vendor.phone, vendor.address, vendor.cnic || ''])]), 'Vendors');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Item', 'SKU', 'Required quantity', 'Unit', 'Vendor', 'Remarks', 'Received', 'Remaining', 'Category'], ...rows.map((row, index) => [...row.map((value, column) => column === 2 ? request.items![index].quantity : value), request.items![index].receivedQuantity || 0, Number((request.items![index].quantity - (request.items![index].receivedQuantity || 0)).toPrecision(15)), request.items![index].category || ''])]), 'Required Stock');
        XLSX.writeFile(workbook, `${filename}.xlsx`);
        return;
    }
    const blob = await buildInvoicePdfBlob({
        title: 'Inventory Stock Request', shop: { name: 'ItemHive' },
        billToLabel: 'Requested by', billTo: request.requestedByName, billToSubtitle: request.requestedByEmail,
        meta: [{ label: 'Request', value: request._id }, { label: 'Date', value: new Date(request.createdAt).toLocaleString() }, { label: 'Status', value: request.status }, { label: 'Delivery', value: request.deliveryStatus || 'not_received' }],
        columns: [{ label: 'Item / SKU', width: 2 }, { label: 'Qty / Unit', width: 1 }, { label: 'Vendor / Contact / Address', width: 3 }, { label: 'Remarks', width: 2 }],
        rowsPerPage: 17,
        rows: wrapPdfRows([
            ...vendors.map(vendor => ['Vendor details', '', [vendor.name, vendor.phone, vendor.address, vendor.cnic ? `CNIC: ${vendor.cnic}` : ''].filter(Boolean).join(' | '), '']),
            ...(request.items || []).map(item => [[item.name, item.category, item.sku].filter(Boolean).join(' / '), `${item.quantity} ${item.unit}`, vendors.find(vendor => vendor.id === item.vendorId)?.name || '', [item.remarks, `Received: ${item.receivedQuantity || 0}`, `Missing: ${Number((item.quantity - (item.receivedQuantity || 0)).toPrecision(15))}`].filter(Boolean).join(' | ')]),
        ]),
        footer: [request.decisionNote, 'Approval authorizes procurement. Stock is updated when goods are received.'].filter(Boolean).join(' | '),
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${filename}.pdf`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

