import { ensureMenuTitle, newMenuBlock, type MenuBlock, type MenuProduct } from './menuContent';
import type { MenuDesign } from './menuTemplates';

type SectionPreset = { text: string; span: 2 | 3 | 6; keywords: string[] };
type LayoutPreset = {
    eyebrow: string; subtitle: string; titleSize: number; align: MenuBlock['align'];
    sectionAlign?: MenuBlock['align']; sections: SectionPreset[];
};
const section = (text: string, span: SectionPreset['span'], ...keywords: string[]): SectionPreset => ({ text, span, keywords });

export const MENU_LAYOUTS: Record<string, LayoutPreset> = {
    classic: { eyebrow: 'AT THE BISTRO', subtitle: 'Good food, good company', titleSize: 44, align: 'center', sections: [section('Starters', 3, 'starter', 'appetizer'), section('Main courses', 3, 'main', 'pizza', 'burger'), section('Desserts', 3, 'dessert', 'cake', 'sweet'), section('Drinks', 3, 'drink', 'coffee', 'tea', 'juice')] },
    modern: { eyebrow: 'FRESHLY MADE', subtitle: 'Simple ingredients. Great taste.', titleSize: 40, align: 'left', sections: [section('Main menu', 6, 'main', 'pizza', 'burger'), section('Drinks', 3, 'drink', 'coffee', 'tea', 'juice'), section('Desserts', 3, 'dessert', 'cake', 'sweet')] },
    cafe: { eyebrow: 'YOUR DAILY PAUSE', subtitle: 'Coffee, comfort & something sweet', titleSize: 42, align: 'center', sections: [section('Coffee & tea', 3, 'coffee', 'tea', 'latte'), section('Breakfast', 3, 'breakfast', 'egg', 'toast'), section('Sandwiches', 3, 'sandwich', 'burger'), section('Sweet treats', 3, 'dessert', 'cake', 'pastry', 'sweet')] },
    'fast-food': { eyebrow: 'BIG FLAVOURS', subtitle: 'Made fresh. Served fast.', titleSize: 48, align: 'left', sections: [section('Pizzas', 2, 'pizza'), section('Burgers', 2, 'burger'), section('Wraps', 2, 'wrap', 'sandwich'), section('Sides', 2, 'side', 'fries'), section('Drinks', 2, 'drink', 'cola', 'coke', 'fanta', 'juice'), section('Desserts', 2, 'dessert', 'cake', 'ice cream', 'sweet')] },
    'fine-dining': { eyebrow: 'A SEASONAL EXPERIENCE', subtitle: 'Thoughtfully prepared, beautifully served', titleSize: 48, align: 'center', sectionAlign: 'center', sections: [section('Starters', 6, 'starter', 'appetizer'), section('Main courses', 6, 'main', 'steak', 'seafood'), section('Desserts', 6, 'dessert', 'cake', 'sweet')] },
    fresh: { eyebrow: 'FEEL GOOD FOOD', subtitle: 'Fresh, colourful & full of goodness', titleSize: 40, align: 'center', sections: [section('Salads', 2, 'salad'), section('Bowls', 2, 'bowl', 'rice'), section('Smoothies', 2, 'smoothie', 'juice', 'drink')] },
    bakery: { eyebrow: 'BAKED WITH LOVE', subtitle: 'A little sweetness for every day', titleSize: 44, align: 'center', sectionAlign: 'center', sections: [section('Cakes', 3, 'cake'), section('Pastries', 3, 'pastry', 'croissant', 'dessert'), section('Breads', 3, 'bread', 'bun'), section('Drinks', 3, 'drink', 'coffee', 'tea')] },
    ocean: { eyebrow: 'FROM THE COAST', subtitle: 'Fresh catches & favourite flavours', titleSize: 42, align: 'left', sections: [section('Starters', 3, 'starter', 'appetizer'), section('Seafood', 3, 'seafood', 'fish', 'prawn'), section('Grilled favourites', 3, 'grill', 'steak', 'main'), section('Drinks', 3, 'drink', 'juice', 'cola')] },
    desi: { eyebrow: 'TASTE OF HOME', subtitle: 'Rich spices. Generous plates.', titleSize: 46, align: 'center', sections: [section('BBQ', 2, 'bbq', 'kebab', 'tikka'), section('Karahi', 2, 'karahi', 'curry'), section('Rice', 2, 'rice', 'biryani', 'pulao'), section('Breads', 2, 'bread', 'naan', 'roti'), section('Sides', 2, 'side', 'salad', 'raita'), section('Drinks', 2, 'drink', 'lassi', 'juice', 'tea')] },
    midnight: { eyebrow: 'AFTER HOURS', subtitle: 'Your favourites, from day to night', titleSize: 46, align: 'center', sections: [section('Pizzas', 3, 'pizza'), section('Small plates', 3, 'starter', 'side', 'burger', 'fries'), section('Drinks', 3, 'drink', 'coffee', 'tea', 'cola', 'coke', 'fanta'), section('Desserts', 3, 'dessert', 'cake', 'sweet')] },
};

// These are the actual editor blocks, rather than a separate decorative preview.
export const createTemplatePage = (design: MenuDesign, name: string, page: number): MenuBlock[] => {
    const preset = MENU_LAYOUTS[design.templateId];
    if (!preset) return [];
    const block = (type: MenuBlock['type'], text: string, fontSize: number, color: string, align = preset.align, span: MenuBlock['span'] = 6): MenuBlock => ({ ...newMenuBlock(type, color, text), fontSize, align, span, page });
    return [
        block('label', preset.eyebrow, 12, design.accentColor),
        block(page === 1 ? 'title' : 'heading', page === 1 ? name || 'Your menu name' : 'More from our menu', preset.titleSize, design.textColor),
        block('label', preset.subtitle, 16, design.textColor),
        ...preset.sections.map(value => block('section', value.text, 26, design.accentColor, preset.sectionAlign ?? 'left', design.sectionColumns ? (6 / design.sectionColumns) as 2 | 3 | 6 : value.span)),
    ];
};

export const createMenuLayout = (design: MenuDesign, name: string, productIds: string[] = [], products: MenuProduct[] = [], pages = 1): MenuBlock[] => {
    const preset = MENU_LAYOUTS[design.templateId];
    if (!preset) {
        const content = ensureMenuTitle([], name, design.textColor);
        if (productIds.length) content.push({ ...newMenuBlock('section', design.accentColor, 'Menu items'), span: (6 / (design.sectionColumns ?? 1)) as 2 | 3 | 6, productIds: [...productIds] });
        return content;
    }
    const content = Array.from({ length: pages }, (_, index) => createTemplatePage(design, name, index + 1)).flat();
    const sections = content.filter(block => block.type === 'section' && block.page === 1);
    for (const id of productIds) {
        const product = products.find(value => value.id === id);
        const text = `${product?.category ?? ''} ${product?.name ?? ''}`.toLowerCase();
        const index = preset.sections.findIndex(value => value.keywords.some(keyword => text.includes(keyword)));
        sections[index < 0 ? 0 : index].productIds.push(id);
    }
    return content;
};
