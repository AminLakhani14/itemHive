/**
 * Print CSS that turns an on-screen invoice into a thermal slip.
 *
 * Keep the slip at a fixed thermal width and use the printer's selected paper
 * size so A4 print previews place it at the top-left rather than centering a
 * smaller custom page on the sheet.
 * The screen layout puts
 * the letterhead, meta column and shop block side by side and prices the table
 * in five columns; none of that survives 72mm of printable width, so the rules
 * below stack every row and drop the columns that a narrow slip does not need.
 *
 * Only invoices use this. The orders list and the analytics report stay on A4.
 */

/** Default 80mm roll dimensions for the wider invoice screens. */
const DEFAULT_ROLL_WIDTH_MM = 80;

/**
 * @param selector CSS selector of the invoice root, e.g. `#pos-receipt`.
 */
export const thermalInvoicePrintCss = (selector: string, rollWidthMm = DEFAULT_ROLL_WIDTH_MM) => {
    // A 58mm printer has about 48mm of usable print area. Keep a small edge
    // allowance so drivers with a narrower printable width cannot crop totals.
    const slipWidthMm = rollWidthMm - 6;

    return `
    /* Follow the selected paper size, including A4 and thermal rolls. */
    @page { size: auto; margin: 0; }

    html, body {
        display: block !important;
        width: ${rollWidthMm}mm !important;
        min-width: 0 !important;
        height: auto !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
    }

    ${selector} {
        display: block !important;
        width: ${slipWidthMm}mm !important;
        max-width: ${slipWidthMm}mm !important;
        min-width: 0 !important;
        /* Top-left is crucial if a browser/printer falls back to A4. */
        margin: 0 !important;
        padding: 2mm !important;
        box-sizing: border-box !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        overflow: visible !important;
        background: #fff !important;
        color: #000 !important;
        /* Thermal heads render fine strokes poorly; a compact sans holds up. */
        font-family: Arial, Helvetica, sans-serif !important;
        font-size: 9pt !important;
        line-height: 1.25 !important;
    }

    ${selector} * {
        color: #000 !important;
        background: transparent !important;
        box-shadow: none !important;
        max-width: 100% !important;
        min-width: 0 !important;
        overflow: visible !important;
    }

    /* Anything the screen lays out in a row has to stack on a narrow slip. */
    ${selector} .MuiStack-root,
    ${selector} .MuiGrid-container,
    ${selector} .MuiBox-root {
        flex-wrap: wrap !important;
    }

    ${selector} .MuiGrid-root {
        width: 100% !important;
        max-width: 100% !important;
        flex-basis: 100% !important;
    }

    /* Letterhead: title, banner, recipient, meta and shop block in one column,
       each left-aligned so the slip reads top to bottom. */
    ${selector} .invoice-letterhead,
    ${selector} .invoice-letterhead > *,
    ${selector} .invoice-letterhead .MuiBox-root {
        display: block !important;
        width: 100% !important;
        margin-left: 0 !important;
        padding-left: 0 !important;
        text-align: left !important;
        border-left: none !important;
    }

    ${selector} .invoice-letterhead img {
        display: block !important;
        max-width: 46mm !important;
        max-height: 16mm !important;
        margin: 0 0 1.5mm 0 !important;
        object-position: left center !important;
    }

    ${selector} .invoice-letterhead h1,
    ${selector} .invoice-letterhead h2,
    ${selector} .invoice-letterhead h3,
    ${selector} .invoice-letterhead .MuiTypography-h3 {
        font-size: 13pt !important;
        line-height: 1.15 !important;
        margin: 0 0 1mm 0 !important;
    }

    ${selector} .invoice-letterhead .MuiTypography-h6 {
        font-size: 9.5pt !important;
        line-height: 1.2 !important;
    }

    /* The meta column prints as label/value lines rather than a right rail. */
    ${selector} .invoice-letterhead-meta > .MuiBox-root {
        margin-bottom: 0.8mm !important;
    }

    ${selector} .MuiTypography-caption {
        font-size: 7pt !important;
        line-height: 1.2 !important;
    }

    ${selector} .MuiTypography-body2,
    ${selector} .MuiTypography-body1 {
        font-size: 8.5pt !important;
        line-height: 1.25 !important;
    }

    ${selector} .MuiDivider-root {
        margin: 1.5mm 0 !important;
        border-color: #000 !important;
        border-bottom-style: dashed !important;
    }

    /* Narrow rolls have no room for a serial column or per-unit pricing
       beside the total, so keep description, qty and amount only. */
    ${selector} table {
        width: 100% !important;
        table-layout: fixed !important;
        border-collapse: collapse !important;
        margin: 1mm 0 !important;
    }

    ${selector} th,
    ${selector} td {
        border: none !important;
        border-bottom: 1px dotted #000 !important;
        padding: 0.8mm 0 !important;
        font-size: 7.5pt !important;
        line-height: 1.2 !important;
        word-break: break-word !important;
        background: transparent !important;
    }

    ${selector} th {
        border-bottom: 1px solid #000 !important;
        font-weight: 700 !important;
    }

    /* Column 1 is the serial number and column 4 the unit price. */
    ${selector} th:nth-child(1),
    ${selector} td:not([colspan]):nth-child(1),
    ${selector} th:nth-child(4),
    ${selector} td:not([colspan]):nth-child(4) {
        display: none !important;
    }

    ${selector} th:nth-child(2),
    ${selector} td:nth-child(2) { width: 52% !important; }
    ${selector} th:nth-child(3),
    ${selector} td:nth-child(3) { width: 14% !important; }
    ${selector} th:nth-child(5),
    ${selector} td:nth-child(5) { width: 34% !important; }

    ${selector} td.num,
    ${selector} th.num {
        white-space: nowrap !important;
        word-break: normal !important;
    }

    ${selector} .receipt-meta {
        display: block !important;
        width: 100% !important;
        margin: 0 !important;
    }

    ${selector} .receipt-meta-row {
        display: flex !important;
        width: 100% !important;
        justify-content: space-between !important;
        align-items: baseline !important;
        gap: 2mm !important;
        margin: 0 0 0.6mm 0 !important;
        font-size: 8pt !important;
        line-height: 1.2 !important;
    }

    ${selector} .receipt-meta-row > *:first-child {
        color: #333 !important;
        flex: 0 0 auto !important;
    }

    ${selector} .receipt-meta-row > *:last-child {
        text-align: right !important;
        min-width: 0 !important;
        overflow-wrap: anywhere !important;
    }

    /* Legacy screen-only payment-slip markup must never become a second
       receipt in a thermal print frame. */
    ${selector} .legacy-payment-slip {
        display: none !important;
    }

    ${selector} .receipt-powered-by {
        margin-top: 2mm !important;
        padding-top: 1.5mm !important;
        border-top: 1px dashed #000 !important;
        text-align: center !important;
    }

    /* Totals are deliberately outside the table: hidden table columns and
       colspan calculations are unreliable in several thermal print drivers. */
    ${selector} .receipt-totals {
        width: 100% !important;
        max-width: 100% !important;
        margin: 1mm 0 0 !important;
    }

    ${selector} .receipt-total-row {
        display: flex !important;
        width: 100% !important;
        justify-content: space-between !important;
        gap: 2mm !important;
        padding: 0.45mm 0 !important;
        font-size: 8pt !important;
        box-sizing: border-box !important;
    }

    ${selector} .receipt-total-row > *:first-child {
        min-width: 0 !important;
        overflow-wrap: break-word !important;
    }

    ${selector} .receipt-total-row > *:last-child {
        flex: 0 0 auto !important;
        white-space: nowrap !important;
        text-align: right !important;
    }

    ${selector} tbody tr:last-child td {
        border-bottom: none !important;
    }

    /* Kitchen tickets also use this detached thermal layout. Reserve room
       for quantities while allowing long names and delivery details to wrap. */
    ${selector} .MuiTypography-root {
        overflow-wrap: anywhere !important;
    }

    ${selector} .kitchen-ticket-item {
        display: flex !important;
        flex-wrap: nowrap !important;
        align-items: flex-start !important;
        gap: 2mm !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
    }

    ${selector} .kitchen-ticket-item > :first-child {
        flex: 1 1 0 !important;
    }

    ${selector} .kitchen-ticket-item > :last-child {
        flex: 0 0 auto !important;
        white-space: nowrap !important;
    }

    /* Never let a slip break mid-item. */
    ${selector} tr,
    ${selector} table {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
    }
`;
};
