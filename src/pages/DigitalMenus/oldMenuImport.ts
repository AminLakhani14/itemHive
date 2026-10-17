import { menuItemPrice, newMenuBlock, type MenuBlock, type MenuPrices, type MenuProduct, type PictureBox } from './menuContent';
import { createTemplatePage } from './menuLayouts';
import { PLAIN_MENU_DESIGN, type MenuDesign } from './menuTemplates';
import type { Product } from '../../features/inventory/inventorySlice';

export type ExtractedMenuStyle = Pick<MenuDesign, 'backgroundColor' | 'textColor' | 'accentColor' | 'surfaceColor' | 'fontStyle'> & {
    visualStyle: NonNullable<MenuDesign['visualStyle']>; decoration: NonNullable<MenuDesign['decoration']>; titleAlign: MenuBlock['align'];
};
// Older servers return only names, prices and pages, so the copied look and details are optional.
export type ExtractedMenu = {
    name: string; notes: string; tagline?: string; footer?: string; style?: ExtractedMenuStyle; picture?: string; pricePrefix?: string;
    sections: Array<{ name: string; page: number; span?: 2 | 3 | 6; itemsBox?: PictureBox; headingBox?: PictureBox; items: Array<{ name: string; price: number | null; description?: string; image?: string }> }>;
};
export type ImportItem = { id: string; name: string; description: string; image: string; productId: string; price: string; selected: boolean; priceMissing: boolean };
export type ImportSection = { id: string; name: string; page: number; span?: 2 | 3 | 6; selected: boolean; itemsBox?: PictureBox; headingBox?: PictureBox; items: ImportItem[] };
export type ReviewedMenuImport = {
    name: string; sections: ImportSection[]; mode: 'replace' | 'append'; copyLook?: boolean; style?: ExtractedMenuStyle; tagline?: string; footer?: string;
    // keepPicture opens the uploaded picture as-is; listItems adds the read items after it for ordering.
    picture?: string; keepPicture?: boolean; listItems?: boolean; editPicture?: boolean; pricePrefix?: string;
};
const listsItems = (review: ReviewedMenuImport) => !(review.keepPicture && review.picture) || review.listItems !== false;

const normalizeName = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
export function matchImportedItem(name: string, products: MenuProduct[]) {
    const matches = products.filter(product => normalizeName(product.name) === normalizeName(name));
    // Ambiguous variants must be selected by the user rather than guessed.
    return matches.length === 1 ? matches[0] : undefined;
}
export function reviewImportedMenu(source: ExtractedMenu, products: MenuProduct[], prices: MenuPrices): ImportSection[] {
    return source.sections.map(section => ({ ...section, id: crypto.randomUUID(), selected: true, items: section.items.map(item => {
        const match = matchImportedItem(item.name, products);
        return { id: crypto.randomUUID(), name: item.name, description: item.description ?? '', image: item.image ?? '', productId: match?.id ?? '', selected: true, priceMissing: item.price === null, price: item.price === null ? match ? String(menuItemPrice(match, prices)) : '' : String(item.price) };
    }) }));
}
// An item without an inventory match becomes a new inventory item when the user may create products.
export function validateReviewedImport(sections: ImportSection[], products: MenuProduct[], allowNew = false) {
    const seen = new Set<string>();
    let count = 0;
    for (const section of sections.filter(value => value.selected)) {
        if (!section.name.trim() || section.name.trim().length > 160 || !Number.isInteger(section.page) || section.page < 1 || section.page > 20) return 'Enter a section name and a page from 1 to 20.';
        for (const item of section.items.filter(value => value.selected)) {
            if (!item.productId && allowNew) {
                if (!item.name.trim() || item.name.trim().length > 160) return 'Enter a name for every new item.';
            } else if (!products.some(product => product.id === item.productId)) return 'Match every selected item to inventory, or untick items you want to leave out.';
            else if (seen.has(item.productId)) return 'The same inventory item is selected more than once. Choose another item or untick the duplicate.';
            if (!item.price.trim() || !Number.isFinite(Number(item.price) * 100) || Number(item.price) < 0) return 'Enter a valid menu price for every selected item.';
            if (item.productId) seen.add(item.productId);
            count++;
        }
    }
    if (!count) return 'Select at least one item to import.';
}

// New inventory items carry the old menu's name, section, price, description and photo.
// Stock and cost are unknown, so they start at zero for the merchant to complete in Inventory.
export function prepareImportProducts(review: ReviewedMenuImport, createId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`) {
    const products: Product[] = [];
    if (!listsItems(review)) return { review, products };
    const sections = review.sections.map(section => !section.selected ? section : { ...section, items: section.items.map(item => {
        if (!item.selected || item.productId) return item;
        const id = `${createId()}${products.length}`;
        const price = Math.round(Number(item.price) * 100) / 100;
        products.push({ id, sku: `MENU-${id}`.toUpperCase(), name: item.name.trim(), category: section.name.trim(), purchasePrice: 0, salePrice: price, price, stock: 0, minStock: 0, description: item.description.trim(), ...(item.image ? { imageUrl: item.image } : {}) });
        return { ...item, productId: id };
    }) });
    return { review: { ...review, sections }, products };
}

export function importedMenuDesign(style: ExtractedMenuStyle, current: MenuDesign, sections: Pick<ImportSection, 'span'>[]): MenuDesign {
    const spans = sections.map(section => section.span ?? 6);
    const span = ([6, 3, 2] as const).reduce((best, value) => spans.filter(item => item === value).length > spans.filter(item => item === best).length ? value : best, 6 as 2 | 3 | 6);
    return {
        ...PLAIN_MENU_DESIGN, pageSize: current.pageSize, orientation: current.orientation,
        backgroundColor: style.backgroundColor, textColor: style.textColor, accentColor: style.accentColor, surfaceColor: style.surfaceColor, headerColor: style.accentColor,
        fontStyle: style.fontStyle, visualStyle: style.visualStyle, decoration: style.decoration, sectionColumns: (6 / span) as 1 | 2 | 3,
    };
}

export function buildImportedMenu(review: ReviewedMenuImport, design: MenuDesign, existing: { name: string; content: MenuBlock[]; productIds: string[]; productPrices: MenuPrices; pageCount: number }, products: MenuProduct[]) {
    const listItems = listsItems(review);
    const error = listItems ? validateReviewedImport(review.sections, products) : undefined;
    if (error) throw new Error(error);
    const name = (review.mode === 'append' ? existing.name.trim() || review.name.trim() : review.name.trim()) || 'Untitled menu';
    if (name.length > 100) throw new Error('Use a menu name up to 100 characters.');
    const offset = review.mode === 'append' ? existing.pageCount : 0;
    const picture = review.keepPicture ? review.picture : undefined;
    if (picture && review.editPicture && listItems) {
        const sections = review.sections.filter(section => section.selected && section.items.some(item => item.selected));
        if (sections.some(section => !section.itemsBox)) throw new Error('Mark the item area for each section on the original picture before importing.');
        const image = { ...newMenuBlock('image', design.textColor, name), imageUrl: picture, page: offset + 1, span: 6 as const };
        const nextDesign = review.mode === 'replace' && review.style ? importedMenuDesign(review.style, design, sections) : design;
        const blocks: MenuBlock[] = [image, ...(review.mode === 'replace' ? [{ ...newMenuBlock('title', nextDesign.textColor, name), page: offset + 1 }] : [])];
        const prices: MenuPrices = review.mode === 'append' ? { ...existing.productPrices } : {};
        const importedIds: string[] = [];
        for (const section of sections) {
            const items = section.items.filter(item => item.selected);
            const ids = items.map(item => item.productId);
            const values = items.map(item => Math.round(Number(item.price) * 100) / 100);
            ids.forEach((id, index) => { prices[id] = values[index]; importedIds.push(id); });
            blocks.push({ ...newMenuBlock('section', nextDesign.accentColor, section.name.trim()), page: offset + 1, span: 6, productIds: ids,
                source: { imageId: image.id, box: [...section.itemsBox!] as PictureBox, ...(section.headingBox ? { headingBox: [...section.headingBox] as PictureBox } : {}), originalText: section.name.trim(), originalProductIds: [...ids], originalPrices: [...values], pricePrefix: review.pricePrefix ?? '' } });
        }
        const previous = review.mode === 'append' ? existing.content.map(block => ({ ...block, productIds: block.productIds.filter(id => !importedIds.includes(id)) })) : [];
        if (previous.length + blocks.length > 100 || offset + 1 > 20) throw new Error('This import exceeds the 20-page or 100-element limit.');
        return { name, content: [...previous, ...blocks], design: { ...nextDesign, decoration: 'none' as const }, pageCount: offset + 1, productIds: [...new Set([...(review.mode === 'append' ? existing.productIds : []), ...importedIds])], productPrices: prices };
    }
    // The picture fills its own page, so listed items start on the next one.
    const shift = picture ? 1 : 0;
    const titlePage = review.mode === 'replace' ? 1 + shift : 0;
    const tooManyPages = 'This import needs more than 20 pages. Import fewer sections or items.';
    if (offset + 1 > 20) throw new Error(tooManyPages);
    const prices: MenuPrices = review.mode === 'append' ? { ...existing.productPrices } : {};
    const sections = !listItems ? [] : review.sections.filter(section => section.selected).map(section => ({ ...section, items: section.items.filter(item => item.selected) })).filter(section => section.items.length);
    const importedIds = sections.flatMap(section => section.items.map(item => item.productId));
    for (const section of sections) for (const item of section.items) prices[item.productId] = Math.round(Number(item.price) * 100) / 100;
    const blocks: MenuBlock[] = [];
    let count = offset + 1;
    let nextDesign = design;
    if (picture) blocks.push({ ...newMenuBlock('image', design.textColor, name), fontSize: 16, align: 'center', span: 6, page: offset + 1, imageUrl: picture });
    if (review.mode === 'replace' && review.style && (review.copyLook || picture)) {
        // Recreate the original page by page: its sections, widths, item order and printed copy.
        const style = review.style;
        nextDesign = importedMenuDesign(style, design, sections);
        const text = (type: MenuBlock['type'], value: string, fontSize: number, page: number, align: MenuBlock['align']): MenuBlock => ({ ...newMenuBlock(type, style.textColor, value), fontSize, align, span: 6, page });
        if (!picture) {
            blocks.push(text('title', name, 40, 1, style.titleAlign));
            if (review.tagline?.trim()) blocks.push(text('label', review.tagline.trim().slice(0, 500), 16, 1, style.titleAlign));
        } else if (sections.length) blocks.push(text('title', name, 40, Math.min(...sections.map(section => section.page)) + shift, style.titleAlign));
        for (const section of sections) {
            const page = section.page + shift;
            if (page > 20) throw new Error(tooManyPages);
            blocks.push({ ...newMenuBlock('section', style.accentColor, section.name.trim()), fontSize: 26, span: section.span ?? 6, page, productIds: section.items.map(item => item.productId) });
            count = Math.max(count, page);
        }
        if (!picture && review.footer?.trim()) blocks.push(text('label', review.footer.trim().slice(0, 500), 14, count, 'center'));
    } else {
        for (const section of sections) {
            const items = section.items;
            for (let start = 0; start < items.length; start += 15) {
                const page = section.page + offset + shift + Math.floor(start / 15);
                if (page > 20) throw new Error(tooManyPages);
                const preset = createTemplatePage(design, name, page).filter(block => block.type === 'section');
                const style = preset.find(block => normalizeName(block.text) === normalizeName(section.name)) ?? preset[0];
                blocks.push({ ...newMenuBlock('section', design.accentColor), ...(style ? { fontSize: style.fontSize, color: style.color, align: style.align, span: style.span } : { span: 6 as const }), text: start ? `${section.name.trim().slice(0, 148)} (continued)` : section.name.trim(), page, productIds: items.slice(start, start + 15).map(item => item.productId) });
                count = Math.max(count, page);
            }
        }
        const first = offset + shift + 1;
        blocks.unshift(...Array.from({ length: Math.max(0, count - first + 1) }, (_, index) => {
            const page = first + index;
            const template = createTemplatePage(design, name, page === titlePage ? 1 : 2).filter(block => block.type !== 'section').map(block => ({ ...block, page }));
            return template.length ? template : [{ ...newMenuBlock(page === titlePage ? 'title' : 'heading', design.textColor, page === titlePage ? name : 'More from our menu'), page, align: 'center' as const, span: 6 as const }];
        }).flat());
    }
    // A picture-only menu keeps its editable title just below the picture.
    if (review.mode === 'replace' && !blocks.some(block => block.type === 'title')) blocks.push({ ...newMenuBlock('title', nextDesign.textColor, name), fontSize: 32, align: 'center', span: 6, page: offset + 1 });
    // The old menu's photos and descriptions stay visible after import.
    const items = sections.flatMap(section => section.items);
    nextDesign = { ...nextDesign, showImages: nextDesign.showImages || items.some(item => item.image), showDescriptions: nextDesign.showDescriptions || items.some(item => item.description.trim()) };
    const previous = review.mode === 'append' ? existing.content.map(block => ({ ...block, productIds: block.productIds.filter(id => !importedIds.includes(id)) })) : [];
    const content = [...previous, ...blocks].sort((a, b) => (a.page ?? 1) - (b.page ?? 1));
    if (content.length > 100) throw new Error('This import exceeds the 100-element limit. Choose fewer sections or pages.');
    return { name, content, design: nextDesign, pageCount: count, productIds: [...new Set([...(review.mode === 'append' ? existing.productIds : []), ...importedIds])], productPrices: prices };
}
