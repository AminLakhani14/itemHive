/**
 * Minimal, dependency-free PDF writer for customer documents.
 *
 * It renders the same letterhead the screen shows - uploaded banner, shop
 * contact block, meta column, line-item table, totals and amount in words -
 * and embeds the banner as a JPEG XObject so the file is self-contained.
 */

export interface InvoicePdfColumn {
    label: string;
    /** Share of the table width; the columns are normalised against the total. */
    width: number;
    align?: 'left' | 'right';
}

export interface InvoicePdfInput {
    title: string;
    bannerDataUrl?: string;
    shop: { name: string; address?: string; phone?: string };
    billToLabel?: string;
    billTo?: string;
    billToSubtitle?: string;
    meta?: Array<{ label: string; value: string }>;
    columns: InvoicePdfColumn[];
    rows: string[][];
    totals?: Array<{ label: string; value: string; strong?: boolean }>;
    amountInWords?: string;
    footer?: string;
    /** Split long tables into pages, repeating document details and column headings. */
    rowsPerPage?: number;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN;

// ── Helvetica metrics (AFM widths / 1000) for alignment ──────────────
const HELVETICA: Record<string, number> = {
    ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
    '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
    ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
    A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
    K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
    U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
    '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
    a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
    k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
    u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
    '{': 334, '|': 260, '}': 334, '~': 584,
};

const HELVETICA_BOLD: Record<string, number> = {
    ...HELVETICA,
    '"': 474, "'": 238, '&': 722, A: 722, B: 722, D: 722, J: 556, K: 722, L: 611,
    '?': 611, '@': 975, a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611,
    h: 611, i: 278, j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611,
    r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
    ':': 333, ';': 333, '{': 389, '|': 280, '}': 389, '*': 389,
};

/** WinAnsi cannot encode ₨/₹; spell those out instead of dropping them. */
const sanitize = (text: string) => String(text ?? '')
    .replace(/[₨₹]/g, 'Rs')
    .replace(/﷼/g, 'SAR')
    .replace(/[^\x20-\xFF]/g, '?');

const textWidth = (text: string, size: number, bold = false) => {
    const table = bold ? HELVETICA_BOLD : HELVETICA;
    let total = 0;
    for (const char of sanitize(text)) total += table[char] ?? 556;
    return (total * size) / 1000;
};

const truncate = (text: string, size: number, bold: boolean, maxWidth: number) => {
    const clean = sanitize(text);
    if (textWidth(clean, size, bold) <= maxWidth) return clean;
    let result = clean;
    while (result.length > 1 && textWidth(`${result}...`, size, bold) > maxWidth) {
        result = result.slice(0, -1);
    }
    return `${result}...`;
};

const escapePdf = (text: string) => sanitize(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

// ── Content stream builder ───────────────────────────────────────────
class Canvas {
    private ops: string[] = [];

    text(
        x: number,
        yFromTop: number,
        value: string,
        options: { size?: number; bold?: boolean; align?: 'left' | 'right'; gray?: number; maxWidth?: number } = {}
    ) {
        const { size = 10, bold = false, align = 'left', gray = 0, maxWidth } = options;
        const shown = maxWidth ? truncate(value, size, bold, maxWidth) : sanitize(value);
        if (!shown) return;
        const drawX = align === 'right' ? x - textWidth(shown, size, bold) : x;
        this.ops.push(
            'BT',
            `${gray} g`,
            `/${bold ? 'F2' : 'F1'} ${size} Tf`,
            `${drawX.toFixed(2)} ${(PAGE_HEIGHT - yFromTop).toFixed(2)} Td`,
            `(${escapePdf(shown)}) Tj`,
            'ET'
        );
    }

    line(x1: number, y1FromTop: number, x2: number, y2FromTop: number, gray = 0.55) {
        this.ops.push(
            `${gray} G`,
            '0.7 w',
            `${x1.toFixed(2)} ${(PAGE_HEIGHT - y1FromTop).toFixed(2)} m`,
            `${x2.toFixed(2)} ${(PAGE_HEIGHT - y2FromTop).toFixed(2)} l`,
            'S'
        );
    }

    fillRect(x: number, yFromTop: number, width: number, height: number, gray = 0.92) {
        this.ops.push(
            `${gray} g`,
            `${x.toFixed(2)} ${(PAGE_HEIGHT - yFromTop - height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re`,
            'f'
        );
    }

    image(x: number, yFromTop: number, width: number, height: number) {
        this.ops.push(
            'q',
            `${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${(PAGE_HEIGHT - yFromTop - height).toFixed(2)} cm`,
            '/Im1 Do',
            'Q'
        );
    }

    toString() {
        return this.ops.join('\n');
    }
}

// ── Banner rasterisation ─────────────────────────────────────────────
interface JpegAsset {
    bytes: Uint8Array;
    width: number;
    height: number;
}

/** Flattens any banner (PNG/SVG/WEBP, possibly transparent) onto white JPEG bytes. */
const toJpegAsset = (dataUrl: string): Promise<JpegAsset> => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
        try {
            const maxWidth = 900;
            const scale = Math.min(1, maxWidth / (image.naturalWidth || image.width || maxWidth));
            const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
            const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas unavailable');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, width, height);
            context.drawImage(image, 0, 0, width, height);

            const base64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1] || '';
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
            resolve({ bytes, width, height });
        } catch (error) {
            reject(error);
        }
    };
    image.onerror = () => reject(new Error('Banner image could not be loaded'));
    image.src = dataUrl;
});

// ── Document layout ──────────────────────────────────────────────────
export const drawDocument = (input: InvoicePdfInput, banner: JpegAsset | null) => {
    const canvas = new Canvas();
    let y = MARGIN + 10;

    let bannerHeight = 0;
    if (banner) {
        const height = Math.min(64, (200 * banner.height) / banner.width);
        const width = (height * banner.width) / banner.height;
        canvas.image(CONTENT_RIGHT - width, y - 6, width, height);
        bannerHeight = height;
    }

    canvas.text(MARGIN, y + 22, input.title, { size: 26, bold: true });
    y += Math.max(bannerHeight, 30) + 34;

    // Recipient
    let leftY = y;
    if (input.billToLabel) {
        canvas.text(MARGIN, leftY, input.billToLabel, { size: 8, gray: 0.45 });
        leftY += 13;
    }
    if (input.billTo) {
        canvas.text(MARGIN, leftY, input.billTo, { size: 13, bold: true, maxWidth: 220 });
        leftY += 15;
    }
    if (input.billToSubtitle) {
        canvas.text(MARGIN, leftY, input.billToSubtitle, { size: 9, gray: 0.4, maxWidth: 220 });
        leftY += 13;
    }

    // Meta column + shop block
    const metaRight = 392;
    const shopLeft = 410;
    let metaY = y;
    for (const entry of input.meta || []) {
        canvas.text(metaRight, metaY, entry.label, { size: 8, gray: 0.45, align: 'right' });
        canvas.text(metaRight, metaY + 12, entry.value, { size: 10, bold: true, align: 'right' });
        metaY += 28;
    }

    let shopY = y;
    canvas.text(shopLeft, shopY, input.shop.name.toUpperCase(), { size: 10, bold: true, maxWidth: 145 });
    shopY += 13;
    for (const line of (input.shop.address || '').split('\n').filter(Boolean)) {
        canvas.text(shopLeft, shopY, line, { size: 9, gray: 0.35, maxWidth: 145 });
        shopY += 12;
    }
    for (const line of (input.shop.phone || '').split('\n').filter(Boolean)) {
        canvas.text(shopLeft, shopY, line, { size: 9, gray: 0.35, maxWidth: 145 });
        shopY += 12;
    }

    const blockBottom = Math.max(leftY, metaY, shopY);
    if ((input.meta || []).length > 0) {
        canvas.line(shopLeft - 12, y - 8, shopLeft - 12, blockBottom - 4, 0.75);
    }
    y = blockBottom + 16;

    // Line-item table
    const tableWidth = CONTENT_RIGHT - MARGIN;
    const totalUnits = input.columns.reduce((sum, column) => sum + column.width, 0) || 1;
    const columnX: number[] = [];
    let cursor = MARGIN;
    for (const column of input.columns) {
        columnX.push(cursor);
        cursor += (column.width / totalUnits) * tableWidth;
    }
    const columnWidth = (index: number) => (input.columns[index].width / totalUnits) * tableWidth;

    const rowHeight = 22;
    canvas.fillRect(MARGIN, y, tableWidth, rowHeight, 0.91);
    input.columns.forEach((column, index) => {
        const alignRight = column.align === 'right';
        const x = alignRight ? columnX[index] + columnWidth(index) - 6 : columnX[index] + 6;
        canvas.text(x, y + 15, column.label, {
            size: 9,
            bold: true,
            align: alignRight ? 'right' : 'left',
            maxWidth: columnWidth(index) - 12,
        });
    });

    let rowY = y + rowHeight;
    for (const row of input.rows) {
        input.columns.forEach((column, index) => {
            const alignRight = column.align === 'right';
            const x = alignRight ? columnX[index] + columnWidth(index) - 6 : columnX[index] + 6;
            canvas.text(x, rowY + 15, row[index] ?? '', {
                size: 9.5,
                align: alignRight ? 'right' : 'left',
                maxWidth: columnWidth(index) - 12,
            });
        });
        rowY += rowHeight;
    }

    // Table grid
    const tableTop = y;
    const tableBottom = rowY;
    canvas.line(MARGIN, tableTop, CONTENT_RIGHT, tableTop);
    canvas.line(MARGIN, tableTop + rowHeight, CONTENT_RIGHT, tableTop + rowHeight);
    canvas.line(MARGIN, tableBottom, CONTENT_RIGHT, tableBottom);
    for (let index = 1; index < input.rows.length; index += 1) {
        canvas.line(MARGIN, tableTop + rowHeight * (index + 1), CONTENT_RIGHT, tableTop + rowHeight * (index + 1), 0.8);
    }
    canvas.line(MARGIN, tableTop, MARGIN, tableBottom);
    canvas.line(CONTENT_RIGHT, tableTop, CONTENT_RIGHT, tableBottom);
    for (let index = 1; index < columnX.length; index += 1) {
        canvas.line(columnX[index], tableTop, columnX[index], tableBottom);
    }

    y = tableBottom + 18;

    // Totals
    for (const total of input.totals || []) {
        canvas.text(CONTENT_RIGHT - 110, y, total.label, { size: 10, bold: total.strong, align: 'right' });
        canvas.text(CONTENT_RIGHT - 6, y, total.value, { size: 10, bold: total.strong, align: 'right' });
        y += 17;
    }

    if (input.amountInWords) {
        y += 10;
        canvas.text(MARGIN, y, 'Total amount in words', { size: 8, gray: 0.45 });
        canvas.text(MARGIN, y + 14, input.amountInWords, { size: 10, maxWidth: tableWidth });
        y += 30;
    }

    if (input.footer) {
        canvas.text(MARGIN, y + 16, input.footer, { size: 9, gray: 0.45, maxWidth: tableWidth });
    }

    return canvas.toString();
};

// ── File assembly ────────────────────────────────────────────────────
const latin1Bytes = (text: string) => {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
    return bytes;
};

export const buildInvoicePdfBlob = async (input: InvoicePdfInput): Promise<Blob> => {
    let banner: JpegAsset | null = null;
    if (input.bannerDataUrl) {
        try {
            banner = await toJpegAsset(input.bannerDataUrl);
        } catch {
            banner = null; // A broken banner must never block the document.
        }
    }

    const pageSize = input.rowsPerPage ? Math.max(1, Math.floor(input.rowsPerPage)) : Math.max(1, input.rows.length);
    const pageInputs: InvoicePdfInput[] = [];
    for (let start = 0; start < Math.max(1, input.rows.length); start += pageSize) {
        const last = start + pageSize >= input.rows.length;
        pageInputs.push({ ...input, rows: input.rows.slice(start, start + pageSize), totals: last ? input.totals : [], amountInWords: last ? input.amountInWords : undefined, footer: last ? input.footer : undefined });
    }

    const objects: Array<Uint8Array | string> = [];
    const push = (body: Uint8Array | string) => {
        objects.push(body);
        return objects.length; // 1-based object number
    };

    const catalogId = push('<< /Type /Catalog /Pages 2 0 R >>');
    const pagesId = push('');
    const fontId = push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fontBoldId = push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    let imageId = 0;
    if (banner) {
        const imageHeader = `<< /Type /XObject /Subtype /Image /Width ${banner.width} /Height ${banner.height} `
            + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${banner.bytes.length} >>\nstream\n`;
        imageId = push(new Uint8Array([
            ...latin1Bytes(imageHeader),
            ...banner.bytes,
            ...latin1Bytes('\nendstream'),
        ]));
    }

    const pageIds = pageInputs.map(pageInput => {
        const contentBytes = latin1Bytes(drawDocument(pageInput, banner));
        const contentId = push(new Uint8Array([
            ...latin1Bytes(`<< /Length ${contentBytes.length} >>\nstream\n`),
            ...contentBytes, ...latin1Bytes('\nendstream'),
        ]));
        return push(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] `
        + `/Resources << /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >>`
        + `${imageId ? ` /XObject << /Im1 ${imageId} 0 R >>` : ''} >> /Contents ${contentId} 0 R >>`);
    });
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

    const chunks: Uint8Array[] = [];
    let length = 0;
    const write = (part: Uint8Array | string) => {
        const bytes = typeof part === 'string' ? latin1Bytes(part) : part;
        chunks.push(bytes);
        length += bytes.length;
    };

    write('%PDF-1.4\n');
    const offsets: number[] = [];
    objects.forEach((body, index) => {
        offsets[index] = length;
        write(`${index + 1} 0 obj\n`);
        write(body);
        write('\nendobj\n');
    });

    const xrefStart = length;
    write(`xref\n0 ${objects.length + 1}\n`);
    write('0000000000 65535 f \n');
    for (const offset of offsets) {
        write(`${String(offset).padStart(10, '0')} 00000 n \n`);
    }
    write(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

    return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
};

/**
 * Hands the PDF to the OS share sheet when the browser supports file sharing,
 * otherwise downloads it. Returns which path was taken so callers can inform
 * the user honestly.
 */
export const shareOrDownloadPdf = async (
    blob: Blob,
    fileName: string,
    title?: string
): Promise<'shared' | 'downloaded'> => {
    const file = new File([blob], fileName, { type: 'application/pdf' });

    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: title || fileName });
            return 'shared';
        } catch (error) {
            // A cancelled share must not fall through to a surprise download.
            if (error instanceof DOMException && error.name === 'AbortError') throw error;
        }
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return 'downloaded';
};
