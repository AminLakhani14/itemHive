export type MenuBlock = {
    id: string;
    type: 'title' | 'section' | 'heading' | 'label' | 'image';
    /** For pictures, this is the picture's description. */
    text: string;
    imageUrl?: string;
    /** A decorative photo attached to this section, independent of item photos. */
    sectionImage?: import('./sectionImages').SectionImage;
    /** Links editable items to their printed area on an original menu picture. */
    source?: PictureSectionSource;
    headingStyle?: PictureHeadingStyle;
    fontSize: number;
    color: string;
    align: 'left' | 'center' | 'right';
    productIds: string[];
    page?: number;
    span?: 2 | 3 | 6;
};

export type PictureBox = [number, number, number, number]; // top, left, bottom, right; 0–1000
export type PictureHeadingStyle = { backgroundColor: string; color: string; align: 'left' | 'center' | 'right' };
export type PictureSectionSource = {
    imageId: string; box: PictureBox; headingBox?: PictureBox; originalText: string;
    originalProductIds: string[]; originalPrices: number[]; pricePrefix?: string;
    /** New section borrowing this printed section's visual style, without a second printed copy. */
    templateOnly?: boolean;
};

export type MenuProduct = { id: string; name: string; category?: string; salePrice?: number; price?: number; imageUrl?: string; description?: string };
export type MenuPrices = Record<string, number>;
export const menuItemPrice = (product: MenuProduct, prices: MenuPrices = {}) => Object.hasOwn(prices, product.id) ? prices[product.id] : product.salePrice ?? product.price ?? 0;

export const newMenuBlock = (type: MenuBlock['type'], color: string, text?: string): MenuBlock => ({
    id: crypto.randomUUID(), type, text: text ?? (type === 'section' ? 'New section' : type === 'heading' ? 'New heading' : 'Your text label'),
    fontSize: type === 'title' ? 40 : type === 'label' ? 16 : 28, color, align: 'left', productIds: [], page: 1, span: type === 'section' ? 2 : 6,
});

export const menuPageCount = (content: MenuBlock[], count = 1) => Math.max(count, ...content.map(block => block.page ?? 1));

export const ensureMenuTitle = (content: MenuBlock[], name: string, color: string): MenuBlock[] => content.some(block => block.type === 'title') ? content : [{ ...newMenuBlock('title', color, name || 'Your menu name') }, ...content];

export const reorderMenuBlock = (content: MenuBlock[], sourceId: string, targetId: string, after = false) => {
    if (sourceId === targetId) return content;
    const source = content.find(block => block.id === sourceId);
    const target = content.find(block => block.id === targetId);
    if (!source || !target) return content;
    const next = content.filter(block => block.id !== sourceId);
    next.splice(next.findIndex(block => block.id === targetId) + (after ? 1 : 0), 0, { ...source, page: target.page ?? 1 });
    return next;
};

export const moveMenuBlock = <T,>(values: T[], index: number, delta: number): T[] => {
    const target = index + delta;
    if (target < 0 || target >= values.length) return values;
    const next = [...values];
    const [value] = next.splice(index, 1);
    next.splice(target, 0, value);
    return next;
};

export const sectionProducts = (block: MenuBlock, products: MenuProduct[]) => block.productIds.flatMap(id => {
    const product = products.find(item => item.id === id);
    return product ? [product] : [];
});

export const unsectionedProducts = (content: MenuBlock[], products: MenuProduct[]) => {
    const assigned = new Set(content.flatMap(block => block.type === 'section' ? block.productIds : []));
    return products.filter(product => !assigned.has(product.id));
};

export const continueSectionOnPage = (content: MenuBlock[], sectionId: string, productId: string, pageCount: number, newPageBlocks: MenuBlock[] = []) => {
    const source = content.find(block => block.id === sectionId && block.type === 'section');
    const index = source?.productIds.indexOf(productId) ?? -1;
    if (!source || index < 0 || (source.page ?? 1) >= 20) return null;
    const page = (source.page ?? 1) + 1;
    const next = [...content, ...(page > pageCount ? newPageBlocks : [])];
    let target = next.find(block => block.type === 'section' && (block.page ?? 1) === page && block.text === source.text);
    if (!target) {
        target = { ...source, source: undefined, id: crypto.randomUUID(), page, productIds: [] };
        next.push(target);
    }
    if (next.length > 100) return null;
    const moving = source.productIds.slice(index);
    return { page, pageCount: Math.max(pageCount, page), content: next.map(block => block.id === source.id ? { ...block, productIds: source.productIds.slice(0, index) } : block.id === target.id ? { ...block, productIds: [...moving, ...block.productIds] } : block) };
};
