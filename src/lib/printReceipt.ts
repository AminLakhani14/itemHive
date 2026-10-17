import { thermalInvoicePrintCss } from './thermalPrintCss';

const waitForReceiptImages = async (document: Document) => {
    const images = Array.from(document.images);
    await Promise.all(images.map((image) => {
        if (image.complete) return Promise.resolve();

        return new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
        });
    }));
};

/**
 * Prints only the receipt in a detached document. Printing the live POS page
 * makes Chromium lay out every product card and evaluate its print selectors,
 * which becomes noticeably slow for large inventories.
 */
export const printReceipt = async (receipt: HTMLElement, selector = '#pos-receipt', rollWidthMm = 58) => {
    // Use the printer's selected paper. Chromium can center a custom, short
    // thermal page on A4 even when the receipt itself has zero margins.
    await printElement(receipt, thermalInvoicePrintCss(selector, rollWidthMm), rollWidthMm, false);
};

/** Print kitchen and customer copies as separate thermal print jobs. */
export const printCheckoutCopies = async (receipt: HTMLElement, kitchenTicket: HTMLElement) => {
    await printReceipt(kitchenTicket, '#pos-kot');
    await printReceipt(receipt);
};

/**
 * Prints a self-contained element using caller-supplied document styles.
 * Use this for full-page reports; thermal receipts should keep using
 * printReceipt so their content keeps its thermal width on the selected paper.
 */
export const printElement = async (element: HTMLElement, printCss: string, rollWidthMm?: number, fitPageToContent = true) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    // Keep the frame off-screen instead of using visibility:hidden; some
    // browser print engines treat hidden iframe content as non-printable.
    frame.style.cssText = `position:fixed;left:-10000px;top:-10000px;width:${rollWidthMm ? `${rollWidthMm}mm` : '1px'};height:1px;border:0;pointer-events:none;`;
    document.body.appendChild(frame);

    const printDocument = frame.contentDocument;
    const printWindow = frame.contentWindow;
    if (!printDocument || !printWindow) {
        frame.remove();
        throw new Error('The browser could not prepare the receipt for printing.');
    }

    // MUI/Emotion styles are injected as <style> elements. Copy them so the
    // receipt keeps its layout without taking the rest of the POS DOM along.
    const inheritedStyles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map((stylesheet) => {
            // Emotion inserts rules through CSSOM; outerHTML alone can copy
            // an empty style tag and lose item spacing and typography.
            if (stylesheet instanceof HTMLStyleElement && stylesheet.sheet) {
                return `<style>${Array.from(stylesheet.sheet.cssRules, (rule) => rule.cssText).join('\n')}</style>`;
            }
            return stylesheet.outerHTML;
        })
        .join('');

    printDocument.open();
    printDocument.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${inheritedStyles}
<style>${printCss}</style>
</head>
<body>${element.outerHTML}</body>
</html>`);
    printDocument.close();

    await waitForReceiptImages(printDocument);
    await printDocument.fonts.ready;
    if (rollWidthMm && fitPageToContent) {
        // CSS does not accept "58mm auto" as a page size. Measure the slip
        // with its thermal styles applied and supply two explicit lengths.
        const slip = printDocument.body.firstElementChild as HTMLElement | null;
        if (!slip) {
            frame.remove();
            throw new Error('The receipt is empty.');
        }
        const heightPx = Math.max(slip.getBoundingClientRect().height, slip.scrollHeight);
        const heightMm = Math.ceil(heightPx * 25.4 / 96) + 1;
        const pageStyle = printDocument.createElement('style');
        pageStyle.textContent = `@page { size: ${rollWidthMm}mm ${heightMm}mm; margin: 0; }`;
        printDocument.head.appendChild(pageStyle);
    }
    await new Promise<void>((resolve) => {
        let cleanedUp = false;
        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;
            window.setTimeout(() => frame.remove(), 0);
            resolve();
        };

        printWindow.addEventListener('afterprint', cleanup, { once: true });
        printWindow.focus();
        printWindow.print();
        // Some printer drivers do not dispatch afterprint. Do not leave a
        // detached frame behind if that happens.
        window.setTimeout(cleanup, 60_000);
    });
};
