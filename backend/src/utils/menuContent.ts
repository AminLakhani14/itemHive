export interface MenuBlock {
    id: string;
    type: 'title' | 'section' | 'heading' | 'label' | 'image';
    text: string;
    imageUrl?: string;
    sectionImage?: { url: string; alt: string };
    source?: PictureSectionSource;
    headingStyle?: { backgroundColor: string; color: string; align: 'left' | 'center' | 'right' };
    fontSize: number;
    color: string;
    align: 'left' | 'center' | 'right';
    productIds: string[];
    page?: number;
    span?: 2 | 3 | 6;
}

export type PictureBox = [number, number, number, number];
export type PictureSectionSource = { imageId: string; box: PictureBox; headingBox?: PictureBox; originalText: string; originalProductIds: string[]; originalPrices: number[]; pricePrefix?: string; templateOnly?: boolean };
export const validPictureBox = (value: unknown): value is PictureBox => Array.isArray(value) && value.length === 4 && value.every(edge => typeof edge === 'number' && Number.isFinite(edge) && edge >= 0 && edge <= 1000) && value[2] > value[0] && value[3] > value[1];

function parsePictureSource(value: unknown): PictureSectionSource | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const source = value as Record<string, unknown>;
    if (typeof source.imageId !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(source.imageId) || !validPictureBox(source.box)) return null;
    if (source.headingBox !== undefined && !validPictureBox(source.headingBox)) return null;
    if (typeof source.originalText !== 'string' || source.originalText.length > 160) return null;
    if (!Array.isArray(source.originalProductIds) || !Array.isArray(source.originalPrices) || source.originalProductIds.length > 200 || source.originalProductIds.length !== source.originalPrices.length) return null;
    if (source.originalProductIds.some(id => typeof id !== 'string' || !id || id.length > 160) || new Set(source.originalProductIds).size !== source.originalProductIds.length || source.originalPrices.some(price => typeof price !== 'number' || !Number.isFinite(price * 100) || price < 0)) return null;
    if (source.pricePrefix !== undefined && (typeof source.pricePrefix !== 'string' || source.pricePrefix.length > 8)) return null;
    if (source.templateOnly !== undefined && typeof source.templateOnly !== 'boolean') return null;
    return { imageId: source.imageId, box: source.box, originalText: source.originalText, originalProductIds: source.originalProductIds as string[], originalPrices: source.originalPrices as number[], ...(source.headingBox ? { headingBox: source.headingBox as PictureBox } : {}), ...(source.pricePrefix !== undefined ? { pricePrefix: source.pricePrefix as string } : {}), ...(source.templateOnly !== undefined ? { templateOnly: source.templateOnly as boolean } : {}) };
}

// A picture block shows an uploaded menu page as-is; its text is the picture's description.
export const MAX_MENU_PICTURE_LENGTH = 1_100_000;
export const MAX_MENU_PICTURES = 2;
const MENU_PICTURE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const MAX_SECTION_IMAGE_LENGTH = 200_000;
export const MAX_MENU_IMAGE_LENGTH = 2_400_000;
export function parseSectionImage(input: unknown): MenuBlock['sectionImage'] | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const image = input as Record<string, unknown>;
    if (typeof image.url !== 'string' || image.url.length > MAX_SECTION_IMAGE_LENGTH || !(MENU_PICTURE.test(image.url) || /^\/menu-images\/(main-course|appetizers|drinks|desserts)\.webp$/.test(image.url))) return null;
    if (typeof image.alt !== 'string' || !image.alt.trim() || image.alt.length > 160) return null;
    return { url: image.url, alt: image.alt.trim() };
}

export const parseMenuPageCount = (value: unknown): number | undefined | null => value === undefined ? undefined : typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 20 ? value : null;

// The menu's products are authoritative; layout cannot introduce extra items.
export const parseMenuContent = (value: unknown, productIds: string[], allowEmptyText = false): MenuBlock[] | null => {
    if (!Array.isArray(value) || value.length > 100) return null;
    const result: MenuBlock[] = [];
    const ids = new Set<string>();
    const assignedProducts = new Set<string>();
    const allowedProducts = new Set(productIds);
    let hasTitle = false;
    let pictures = 0;
    let imageLength = 0;
    for (const raw of value) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const block = raw as Record<string, unknown>;
        if (typeof block.id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(block.id) || ids.has(block.id)) return null;
        if (!['title', 'section', 'heading', 'label', 'image'].includes(String(block.type))) return null;
        const source = block.source === undefined ? undefined : block.type === 'section' ? parsePictureSource(block.source) : null;
        if (source === null) return null;
        const sectionImage = block.sectionImage === undefined ? undefined : block.type === 'section' ? parseSectionImage(block.sectionImage) : null;
        if (sectionImage === null) return null;
        imageLength += (typeof block.imageUrl === 'string' ? block.imageUrl.length : 0) + (sectionImage?.url.length ?? 0);
        if (imageLength > MAX_MENU_IMAGE_LENGTH) return null;
        let headingStyle: MenuBlock['headingStyle'];
        if (block.headingStyle !== undefined) {
            const style = block.headingStyle as Record<string, unknown>;
            if (block.type !== 'section' || !style || typeof style !== 'object' || Array.isArray(style) || ![style.backgroundColor, style.color].every(color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) || !['left', 'center', 'right'].includes(String(style.align))) return null;
            headingStyle = { backgroundColor: style.backgroundColor as string, color: style.color as string, align: style.align as 'left' | 'center' | 'right' };
        }
        if (block.type === 'image' ? typeof block.imageUrl !== 'string' || block.imageUrl.length > MAX_MENU_PICTURE_LENGTH || !MENU_PICTURE.test(block.imageUrl) || ++pictures > MAX_MENU_PICTURES : block.imageUrl !== undefined) return null;
        if (block.type === 'title') { if (hasTitle) return null; hasTitle = true; }
        if (typeof block.text !== 'string' || (!allowEmptyText && !block.text.trim()) || block.text.length > (block.type === 'label' ? 500 : 160)) return null;
        if (typeof block.fontSize !== 'number' || !Number.isFinite(block.fontSize) || block.fontSize < 10 || block.fontSize > 96) return null;
        if (typeof block.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(block.color)) return null;
        if (!['left', 'center', 'right'].includes(String(block.align))) return null;
        if (block.page !== undefined && (typeof block.page !== 'number' || !Number.isInteger(block.page) || block.page < 1 || block.page > 20)) return null;
        if (block.span !== undefined && ![2, 3, 6].includes(Number(block.span))) return null;
        if (block.span !== undefined && typeof block.span !== 'number') return null;
        if (!Array.isArray(block.productIds) || block.productIds.length > 1000 || (block.type !== 'section' && block.productIds.length)) return null;
        const items: string[] = [];
        for (const id of block.productIds) {
            if (typeof id !== 'string' || !allowedProducts.has(id) || assignedProducts.has(id)) return null;
            assignedProducts.add(id);
            items.push(id);
        }
        ids.add(block.id);
        result.push({ id: block.id, type: block.type as MenuBlock['type'], text: block.text.trim(), fontSize: block.fontSize, color: block.color, align: block.align as MenuBlock['align'], productIds: items, ...(sectionImage ? { sectionImage } : {}), ...(source ? { source } : {}), ...(headingStyle ? { headingStyle } : {}), ...(block.type === 'image' ? { imageUrl: block.imageUrl as string } : {}), ...(block.page !== undefined ? { page: block.page as number } : {}), ...(block.span !== undefined ? { span: block.span as MenuBlock['span'] } : {}) });
    }
    if (result.some(block => block.source && !result.some(image => image.id === block.source!.imageId && image.type === 'image' && (image.page ?? 1) === (block.page ?? 1)))) return null;
    return result;
};
