import { menuItemPrice, newMenuBlock, type MenuBlock, type MenuProduct, type PictureBox, type PictureHeadingStyle } from './menuContent';

export const pictureBoxValid = (box: unknown): box is PictureBox => Array.isArray(box) && box.length === 4 && box.every(edge => typeof edge === 'number' && Number.isFinite(edge) && edge >= 0 && edge <= 1000) && box[2] > box[0] && box[3] > box[1];
const regionKey = (section: MenuBlock) => section.source!.box.join(',');

export function addPictureSection(content: MenuBlock[], template: MenuBlock, text = template.text === template.text.toUpperCase() ? 'NEW SECTION' : 'New section', headingStyle?: PictureHeadingStyle) {
    if (!template.source || content.length >= 100) return null;
    const source = template.source;
    const section: MenuBlock = { ...newMenuBlock('section', template.color, text), page: template.page ?? 1, span: template.span,
        ...(headingStyle || template.headingStyle ? { headingStyle: headingStyle || template.headingStyle } : {}),
        source: { ...source, box: [...source.box], ...(source.headingBox ? { headingBox: [...source.headingBox] } : {}), originalProductIds: [...source.originalProductIds], originalPrices: [...source.originalPrices], templateOnly: true } };
    if (section.headingStyle) { section.color = section.headingStyle.color; section.align = section.headingStyle.align; }
    const next = [...content]; next.splice(next.findIndex(block => block.id === template.id) + 1, 0, section);
    return { content: next, section };
}

export function movePictureSection(content: MenuBlock[], sourceId: string, targetId: string, after = false) {
    const source = content.find(block => block.id === sourceId), target = content.find(block => block.id === targetId);
    if (!source?.source || !target?.source || sourceId === targetId || source.source.imageId !== target.source.imageId) return content;
    // Keep original columns so the surrounding artwork stays in place.
    if (source.source.box[1] >= target.source.box[3] || source.source.box[3] <= target.source.box[1]) return content;
    const next = content.filter(block => block.id !== sourceId);
    next.splice(next.findIndex(block => block.id === targetId) + (after ? 1 : 0), 0, source);
    return next;
}

export function movePictureItem(content: MenuBlock[], productId: string, targetSectionId: string, targetProductId?: string, after = false) {
    const target = content.find(block => block.id === targetSectionId && block.type === 'section');
    const owner = content.find(block => block.type === 'section' && block.productIds.includes(productId));
    if (!target || !owner || productId === targetProductId) return content;
    const ids = target.productIds.filter(id => id !== productId);
    const index = targetProductId ? ids.indexOf(targetProductId) : ids.length;
    if (index < 0) return content;
    ids.splice(index + (targetProductId && after ? 1 : 0), 0, productId);
    return content.map(block => block.id === target.id ? { ...block, productIds: ids } : block.type === 'section' ? { ...block, productIds: block.productIds.filter(id => id !== productId) } : block);
}

export function pictureMenuLayout(sections: MenuBlock[], products: MenuProduct[], interactive = false) {
    const entries = sections.filter(section => section.source && pictureBoxValid(section.source.box)).map(section => {
        const source = section.source!;
        const items = section.productIds.flatMap(id => { const product = products.find(item => item.id === id); return product ? [product] : []; });
        const edited = Boolean(section.sectionImage) || Boolean(source.templateOnly) || interactive || section.productIds.length !== source.originalProductIds.length || section.productIds.some((id, index) => id !== source.originalProductIds[index] || menuItemPrice(products.find(product => product.id === id) ?? { id, name: '' }) !== source.originalPrices[index]);
        const originalHeight = source.box[2] - source.box[0];
        const row = originalHeight / Math.max(1, source.originalProductIds.length);
        const start = source.headingBox?.[0] ?? Math.max(0, source.box[0] - row * 2);
        const photoHeight = section.sectionImage ? Math.min(220, (source.box[3] - source.box[1]) * .5) : 0;
        return { section, items, edited, row, photoHeight, height: (edited ? Math.max(row, items.length * row) : originalHeight) + photoHeight, top: source.box[0], shift: 0, start, headingTop: start, end: source.box[2], gap: row * 2, unitHeight: 0 };
    });
    const groups: Array<{ left: number; right: number; entries: typeof entries; start: number; end: number; extra: number; changed: boolean }> = [];
    for (const entry of entries) {
        const [, left, , right] = entry.section.source!.box;
        const matching = groups.filter(group => left < group.right && right > group.left);
        if (!matching.length) groups.push({ left, right, entries: [entry], start: entry.start, end: entry.end, extra: 0, changed: false });
        else {
            const group = matching[0];
            group.left = Math.min(left, ...matching.map(value => value.left)); group.right = Math.max(right, ...matching.map(value => value.right));
            group.entries.push(entry, ...matching.slice(1).flatMap(value => value.entries));
            matching.slice(1).forEach(value => groups.splice(groups.indexOf(value), 1));
        }
    }
    for (const group of groups) {
        const originals = group.entries.filter(entry => !entry.section.source!.templateOnly).sort((a, b) => a.start - b.start);
        const templates = [...new Map(group.entries.map(entry => [regionKey(entry.section), entry])).values()].sort((a, b) => a.start - b.start);
        const slots = originals.length ? originals : templates;
        const gaps = slots.slice(0, -1).map((entry, index) => Math.max(12, slots[index + 1].start - entry.section.source!.box[2]));
        const lastGap = gaps.length ? Math.min(...gaps) : slots.at(-1)!.row * 2;
        const boundaries = new Map(slots.map((entry, index) => [regionKey(entry.section), { start: entry.start, end: index + 1 < slots.length ? slots[index + 1].start : Math.min(1000, entry.section.source!.box[2] + lastGap) }]));
        group.start = slots[0].start; group.end = boundaries.get(regionKey(slots.at(-1)!.section))!.end;
        let position = group.start;
        for (const entry of group.entries) {
            const source = entry.section.source!;
            const slot = boundaries.get(regionKey(entry.section));
            entry.end = slot?.end ?? Math.min(1000, source.box[2] + lastGap);
            entry.gap = Math.max(12, entry.end - source.box[2]);
            entry.headingTop = position; entry.top = position + source.box[0] - entry.start;
            entry.shift = position - entry.start;
            entry.unitHeight = source.box[0] - entry.start + entry.height + entry.gap;
            position += entry.unitHeight;
        }
        group.extra = position - group.end;
        group.changed = group.entries.some(entry => entry.edited || entry.shift !== 0 || entry.section.text !== entry.section.source!.originalText);
    }
    return { groups, entries, height: 1000 + Math.max(0, ...groups.map(group => group.extra)) };
}
