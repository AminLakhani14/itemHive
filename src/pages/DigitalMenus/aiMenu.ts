import { ensureMenuTitle, menuPageCount, newMenuBlock, type MenuBlock, type MenuPrices } from './menuContent';
import { createTemplatePage, MENU_LAYOUTS } from './menuLayouts';
import type { MenuDesign } from './menuTemplates';
import type { SectionImage } from './sectionImages';

export type MenuDeal = { id: string; name: string; productIds: string[]; dealPrice: number };
export type PendingMenuDeal = MenuDeal & { reason: string };
export type MenuStyle = Pick<MenuDesign, 'backgroundColor' | 'textColor' | 'accentColor' | 'headerColor' | 'surfaceColor' | 'fontStyle' | 'decoration' | 'visualStyle' | 'sectionColumns'>;
export const MENU_STYLE_KEYS = ['visualStyle', 'sectionColumns', 'backgroundColor', 'textColor', 'accentColor', 'headerColor', 'surfaceColor', 'fontStyle', 'decoration'] as const;
export type MenuStyleKey = typeof MENU_STYLE_KEYS[number];
export const menuAIStyleKeys = (design: MenuDesign): MenuStyleKey[] => MENU_STYLE_KEYS.filter(key => design.templateId === 'custom' || !key.endsWith('Color'));
export type MenuBrand = { name: string; theme: string; logo: string; colors: string[] };
type MenuBrandAppearance = Partial<Record<'themeColor' | 'secondaryColor' | 'backgroundColor' | 'fontColor' | 'headingColor' | 'navbarColor' | 'sidebarColor' | 'logo', string>>;

// The application's default accent is not a restaurant theme. Only saved
// restaurant colors and uploaded logos guide an otherwise blank custom menu.
export function getMenuBrand(settings: { shopName: string; invoiceLogoUrl: string }, user?: { businessName?: string; appearance?: MenuBrandAppearance } | null): MenuBrand {
    const appearance = user?.appearance;
    const fields = [['themeColor', 'accent'], ['secondaryColor', 'secondary accent'], ['backgroundColor', 'background'], ['fontColor', 'text'], ['headingColor', 'headings'], ['navbarColor', 'header'], ['sidebarColor', 'panels']] as const;
    const saved = fields.filter(([key]) => /^#[0-9a-f]{6}$/i.test(appearance?.[key] ?? ''));
    const palette = saved.length === 1 && saved[0][0] === 'themeColor' && appearance?.themeColor?.toLowerCase() === '#0ea5a5' ? [] : saved;
    return {
        name: (settings.shopName === 'Ozor POS' ? user?.businessName || '' : settings.shopName).trim().slice(0, 100),
        theme: palette.length ? `Saved restaurant theme: ${palette.map(([key, label]) => `${label} ${appearance![key]}`).join(', ')}.` : '',
        logo: [settings.invoiceLogoUrl, appearance?.logo].find(logo => logo && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo) && logo.length <= 1398126) || '',
        colors: [...new Set(palette.map(([key]) => appearance![key]!))],
    };
}
export const MENU_STYLE_INCOMPLETE = 'AI did not return a complete menu design. Generate again to get colors, fonts and layout suggestions.';
export function assertCompleteAIMenuStyle(style: AIMenuSuggestion['style'], design: MenuDesign): void {
    if (!style || menuAIStyleKeys(design).some(key => style[key] === undefined || (key.endsWith('Color') && !/^#[0-9a-f]{6}$/i.test(String(style[key]))))) throw new Error(MENU_STYLE_INCOMPLETE);
}
export const MENU_STYLE_UNAVAILABLE = 'The connected backend has not been updated for these menu design suggestions yet. Deploy the updated backend or use the local backend. You can still generate sections and deals below.';
type MenuAIRequest = { productIds: string[]; menuName: string; brief: string; includeDeals: boolean; includeSectionImages?: boolean; existingSections: string[]; productPrices: MenuPrices };

// Keep basic requests compatible with older servers that reject unknown fields.
export const MENU_INSPIRATION_UNAVAILABLE = 'The connected backend has not been updated to use your old menu picture yet. Deploy the updated backend or use the local backend. You can still generate suggestions without it.';
export function buildMenuAIRequest(input: MenuAIRequest, style?: { currentDesign: MenuDesign; brand: MenuBrand }, inspiration?: string) {
    return {
        ...input, menuName: input.menuName.trim(), brief: input.brief.trim(),
        productPrices: Object.fromEntries(Object.entries(input.productPrices).filter(([id]) => input.productIds.includes(id))),
        ...(style ? { includeStyle: true, currentDesign: style.currentDesign, brand: style.brand } : {}),
        ...(inspiration ? { inspiration } : {}),
    };
}
export type AIMenuSuggestion = {
    summary: string;
    sections: Array<{ name: string; reason: string; productIds: string[]; imageKey?: string; sectionImage?: SectionImage }>;
    deals: Array<{ name: string; reason: string; productIds: string[]; dealPrice: number; regularPrice: number }>;
    style?: Partial<MenuStyle> & { reason: string };
    menuName?: string;
    headings?: Array<{ type: 'heading' | 'label'; text: string }>;
};

// Templates retain every chosen color, even if a provider returns color changes.
export function applyAIMenuStyle(content: MenuBlock[], design: MenuDesign, style: Partial<MenuStyle>) {
    return applyMenuStyle(content, design, Object.fromEntries(menuAIStyleKeys(design).filter(key => style[key] !== undefined).map(key => [key, style[key]])));
}

export function applyAIMenuCopy(content: MenuBlock[], design: MenuDesign, name: string, suggestion: Pick<AIMenuSuggestion, 'menuName' | 'headings'>) {
    if (design.templateId !== 'custom') return { content, name };
    const nextName = suggestion.menuName?.trim() || name;
    let next = suggestion.menuName ? ensureMenuTitle(content.map(block => block.type === 'title' ? { ...block, text: nextName } : block), nextName, design.textColor) : [...content];
    const additions = (suggestion.headings ?? []).filter(heading => !next.some(block => block.type === heading.type && block.text.trim().toLocaleLowerCase() === heading.text.trim().toLocaleLowerCase())).map(heading => ({
        ...newMenuBlock(heading.type, heading.type === 'heading' ? design.accentColor : design.textColor, heading.text.trim()), fontSize: heading.type === 'heading' ? 24 : 14, page: 1,
    }));
    if (next.length + additions.length > 100) throw new Error('These suggestions exceed the 100-element limit. Choose fewer headings.');
    const titleIndex = next.findIndex(block => block.type === 'title' && (block.page ?? 1) === 1);
    next = [...next.slice(0, titleIndex + 1), ...additions, ...next.slice(titleIndex + 1)];
    return { content: next, name: nextName };
}

// Only accepted style fields change. Individually colored blocks keep their edits.
export function applyMenuStyle(content: MenuBlock[], design: MenuDesign, style: Partial<MenuStyle>) {
    const accepted = Object.fromEntries(MENU_STYLE_KEYS.filter(key => style[key] !== undefined).map(key => [key, style[key]]));
    const nextDesign = { ...design, ...accepted };
    const next = content.map(block => {
        const key = block.type === 'section' || block.type === 'heading' ? 'accentColor' : 'textColor';
        return { ...block, productIds: [...block.productIds],
            ...(block.type === 'section' && style.sectionColumns ? { span: (6 / style.sectionColumns) as MenuBlock['span'] } : {}),
            color: style[key] && block.color.toLowerCase() === design[key].toLowerCase() ? style[key]! : block.color };
    });
    return { design: nextDesign, content: next };
}

// Pure draft transformation: a failed size check never partially applies a suggestion.
export function applyAISections(content: MenuBlock[], productIds: string[], prices: MenuPrices, pageCount: number, sections: AIMenuSuggestion['sections'], design: MenuDesign, name: string) {
    const selected = sections.flatMap(section => section.productIds);
    if (new Set(selected).size !== selected.length) throw new Error('An item can only belong to one suggested section.');
    let next = content.map(block => ({ ...block, productIds: block.productIds.filter(id => !selected.includes(id)) }));
    let count = menuPageCount(next, pageCount);
    const span = design.sectionColumns ? (6 / design.sectionColumns) as 2 | 3 | 6 : next.find(block => block.type === 'section')?.span ?? MENU_LAYOUTS[design.templateId]?.sections[0].span ?? 6;
    const maxSections = (6 / span) * 2;
    for (const section of sections) {
        const remaining = [...section.productIds];
        let page = 1;
        while (remaining.length) {
            let target = next.find(block => block.type === 'section' && (block.page ?? 1) === page && block.text.trim().toLocaleLowerCase() === section.name.trim().toLocaleLowerCase() && block.productIds.length < 15);
            if (!target) {
                const onPage = next.filter(block => block.type === 'section' && (block.page ?? 1) === page);
                // Keep existing sections intact. A newly seeded template page may reuse an empty slot.
                if (page > pageCount) target = onPage.find(block => !block.productIds.length);
                if (target) target.text = section.name.trim();
                else if (onPage.length < maxSections) {
                    target = { ...newMenuBlock('section', design.accentColor, section.name.trim()), page, span };
                    next.push(target);
                }
            }
            if (target) {
                // Only accepted images replace a photo; rejected suggestions
                // leave existing restaurant photography untouched.
                if (section.sectionImage) target.sectionImage = { ...section.sectionImage };
                const items = remaining.splice(0, 15 - target.productIds.length);
                target.productIds.push(...items);
            }
            if (!remaining.length) break;
            page++;
            if (page > 20) throw new Error('These suggestions need more than 20 pages. Choose fewer items.');
            if (page > count) {
                next = [...next, ...createTemplatePage(design, name, page)];
                count = page;
            }
        }
    }
    if (next.length > 100) throw new Error('These suggestions exceed the 100-element limit. Choose fewer sections or items.');
    return { content: next, productIds: [...new Set([...productIds, ...selected])], productPrices: { ...prices }, pageCount: count };
}
