import { readFileSync, writeFileSync } from 'node:fs';

const sourceUrl = new URL('../docs/PAYROLL_FINANCE_USER_MANUAL.md', import.meta.url);
const source = readFileSync(sourceUrl, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const topics = [];
let topic = 0;
// The guide deliberately uses only headings, paragraphs and flat lists so it
// remains readable as Markdown, in the app, and as a standalone print document.
const content = source.trim().split(/\n\s*\n/).map(block => {
    const heading = /^(#{1,3}) (.+)$/.exec(block);
    if (heading) {
        const level = heading[1].length;
        const title = heading[2];
        const id = level === 2 ? `topic-${++topic}` : '';
        if (id) topics.push({ id, title });
        return `<h${level}${id ? ` id="${id}"` : ''}>${escape(title)}</h${level}>`;
    }
    const lines = block.split('\n');
    if (lines.every(line => /^- /.test(line))) return `<ul>${lines.map(line => `<li>${escape(line.slice(2))}</li>`).join('')}</ul>`;
    if (lines.every(line => /^\d+\. /.test(line))) return `<ol start="${Number.parseInt(lines[0])}">${lines.map(line => `<li>${escape(line.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`;
    return `<p>${escape(block.replaceAll('\n', ' '))}</p>`;
}).join('\n');
if (topics.length !== 31) throw new Error(`Expected 31 manual chapters; found ${topics.length}. Review the contents before publishing.`);
const firstChapter = content.indexOf('<h2 ');
const introduction = content.slice(0, firstChapter);
const chapters = content.slice(firstChapter);
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Detailed ItemHive user procedures for Payroll, Expenses, Finance and My Payroll.">
<title>ItemHive - Payroll, Expenses, Finance and My Payroll User Manual</title>
<style>
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:80px}body{margin:0;background:#f4f7f8;color:#172332;font:16px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.toolbar{position:sticky;top:0;z-index:1;background:#fff;border-bottom:1px solid #dbe5e7;padding:12px 24px;display:flex;gap:16px;justify-content:space-between;align-items:center}.brand{font-size:18px;font-weight:800;color:#087c7c}button{font:inherit;background:#087c7c;color:white;border:0;border-radius:6px;padding:8px 16px;cursor:pointer}main{max-width:980px;margin:32px auto;background:white;padding:40px 56px;border:1px solid #dbe5e7;border-radius:12px}h1{font-size:32px;line-height:1.22;color:#075d5d;margin:0 0 20px}h2{font-size:24px;line-height:1.3;margin:44px 0 18px;border-bottom:2px solid #daeeee;padding-bottom:12px;color:#075d5d}h3{font-size:18px;line-height:1.4;margin:24px 0 10px}p{margin:0 0 14px}ul,ol{padding-left:26px;margin:10px 0 20px}li{padding-left:4px;margin:6px 0}a{color:#075f67;text-decoration:none}a:hover{text-decoration:underline}.contents{background:#f0f8f8;padding:20px 24px;border:1px solid #d7eaea;border-radius:8px;margin-bottom:32px}.contents summary{font-size:18px;font-weight:700;cursor:pointer}.contents ol{columns:2;column-gap:32px;list-style:none;padding:0;margin-bottom:0}.contents li{break-inside:avoid;font-size:14px;margin:8px 0}.end{margin-top:40px;padding-top:20px;border-top:1px solid #dbe5e7;color:#5b6876;font-size:13px}
@media(max-width:650px){body{font-size:15px}main{margin:12px;padding:24px 20px;border-radius:8px}h1{font-size:27px}h2{font-size:22px}.toolbar{padding:10px 14px}.contents{padding:16px}.contents ol{columns:1}button{font-size:14px;padding:8px 10px}}
@media print{@page{size:A4;margin:17mm 16mm}body{background:#fff;color:#111;font-size:10.5pt;line-height:1.5}.toolbar{display:none}main{max-width:none;margin:0;padding:0;border:0;border-radius:0}h1{font-size:25pt}h2{font-size:17pt;margin-top:24pt}h3{font-size:12pt}h1,h2,h3{break-after:avoid}p,li{orphans:3;widows:3}li{break-inside:avoid}a{color:inherit;text-decoration:none}.contents{background:#fff;border:1px solid #bbb;break-after:page}.contents summary{display:block}.contents ol{columns:2}.end{font-size:9pt}}
</style></head><body>
<div class="toolbar"><span class="brand">ItemHive user guide</span><button type="button" onclick="window.print()">Print / Save PDF</button></div>
<main>${introduction}<details class="contents" open><summary>Contents - 31 chapters</summary><ol>${topics.map(t => `<li><a href="#${t.id}">${escape(t.title)}</a></li>`).join('')}</ol></details>
${chapters}
<p class="end">ItemHive | Payroll, Expenses, Finance and My Payroll | Edition 20 October 2026</p></main></body></html>`;
writeFileSync(new URL('../docs/PAYROLL_FINANCE_USER_MANUAL.html', import.meta.url), html, 'utf8');
console.log(`Built printable manual: ${topics.length} chapters, ${source.trim().split(/\s+/).length.toLocaleString('en-US')} words.`);
