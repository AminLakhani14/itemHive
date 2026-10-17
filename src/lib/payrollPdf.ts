import { drawDocument, type InvoicePdfInput } from "./invoicePdf";

/** Paginated A4 payroll documents. Shared letterhead renderer; no change to sales invoices. */
export async function buildPayrollPdfBlob(
  input: InvoicePdfInput,
): Promise<Blob> {
  const split = (s: string, limit: number) => {
    const words = s.split(/\s+/);
    const rows: string[] = [];
    let line = "";
    for (const word of words) {
      if (line && (line + " " + word).length > limit) {
        rows.push(line);
        line = "";
      }
      line += (line ? " " : "") + word;
    }
    rows.push(line);
    return rows;
  };
  const expanded = input.rows.flatMap((row) => {
    const cells = row.map((cell, i) =>
      split(cell, i === 0 ? 22 : i === row.length - 1 ? 18 : 55),
    );
    return Array.from(
      { length: Math.max(...cells.map((c) => c.length)) },
      (_, i) => cells.map((c) => c[i] || ""),
    );
  });
  const pages: string[] = [];
  const count = Math.max(1, Math.ceil(expanded.length / 12));
  for (let i = 0; i < count; i++)
    pages.push(
      drawDocument(
        {
          ...input,
          bannerDataUrl: undefined,
          title: input.title,
          meta: [
            ...(input.meta || []).slice(0, 3),
            { label: "Page", value: `${i + 1} / ${count}` },
          ],
          rows: expanded.slice(i * 12, (i + 1) * 12),
          totals: i === count - 1 ? input.totals : [],
          amountInWords: i === count - 1 ? input.amountInWords : undefined,
          footer: i === count - 1 ? input.footer : "Continued on next page",
        },
        null,
      ),
    );
  const encode = (s: string) =>
    Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);
  const objects: Array<string | Uint8Array> = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  const kids: string[] = [];
  for (const page of pages) {
    const pageId = objects.length + 1;
    const contentId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    const content = encode(page);
    objects.push(
      new Uint8Array([
        ...encode(`<< /Length ${content.length} >>\nstream\n`),
        ...content,
        ...encode("\nendstream"),
      ]),
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const offsets: number[] = [];
  const write = (v: string | Uint8Array) => {
    const bytes = typeof v === "string" ? encode(v) : v;
    chunks.push(bytes);
    size += bytes.length;
  };
  write("%PDF-1.4\n");
  objects.forEach((o, i) => {
    offsets.push(size);
    write(`${i + 1} 0 obj\n`);
    write(o);
    write("\nendobj\n");
  });
  const xref = size;
  write(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.forEach((o) => write(`${String(o).padStart(10, "0")} 00000 n \n`));
  write(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
  );
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}
