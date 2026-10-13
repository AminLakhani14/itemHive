export type MenuDesign = {
    templateId: string;
    accentColor: string;
    headerColor: string;
    backgroundColor: string;
    surfaceColor: string;
    textColor: string;
    layout: 'list' | 'grid';
    fontStyle: 'sans' | 'serif';
    showImages: boolean;
    showDescriptions?: boolean;
    pageSize?: 'a4' | 'a5' | 'letter';
    orientation?: 'portrait' | 'landscape';
    decoration?: 'none' | 'border' | 'corners' | 'dots' | 'glow';
    visualStyle?: 'classic' | 'cards' | 'minimal' | 'editorial';
    sectionColumns?: 1 | 2 | 3;
};

export type MenuTemplate = { name: string; description: string; design: MenuDesign };

const template = (templateId: string, name: string, description: string, headerColor: string, accentColor: string, backgroundColor: string, layout: MenuDesign['layout'] = 'list', fontStyle: MenuDesign['fontStyle'] = 'sans', surfaceColor = '#ffffff', textColor = '#20221f', showImages = false): MenuTemplate => ({
    name, description,
    design: { templateId, headerColor, accentColor, backgroundColor, surfaceColor, textColor, layout, fontStyle, showImages, pageSize: 'a4', orientation: 'portrait' },
});

export const MENU_TEMPLATES: MenuTemplate[] = [
    template('classic', 'Classic Bistro', 'Warm tones for everyday dining', '#1d4936', '#a95b08', '#f8f7f3', 'list', 'serif', '#fffdf8'),
    template('modern', 'Modern Minimal', 'Clean lines and a simple item list', '#202a35', '#285c9b', '#f1f5f9', 'list', 'sans', '#ffffff', '#202a35', false),
    template('cafe', 'Cozy Cafe', 'Coffee colours and an elegant typeface', '#5a3928', '#945a2c', '#f6eee5', 'grid', 'serif', '#fffbf6'),
    template('fast-food', 'Street Bites', 'Bold red with three compact columns', '#a92025', '#b6242b', '#fff4ee', 'grid'),
    template('fine-dining', 'Fine Dining', 'Dark surfaces with gold accents', '#15191e', '#e4b965', '#11151a', 'list', 'serif', '#20262e', '#f6f1e7', false),
    template('fresh', 'Fresh & Green', 'A bright menu for healthy favourites', '#24583b', '#28774b', '#edf6ee', 'grid', 'sans', '#fbfefb'),
    template('bakery', 'Sweet Bakery', 'Soft rose colours and classic headings', '#8b415b', '#a63f68', '#fcf0f4', 'grid', 'serif', '#fffafb'),
    template('ocean', 'Ocean Blue', 'Cool blues with a spacious item list', '#164f65', '#176e8c', '#edf7fa', 'list'),
    template('desi', 'Desi Kitchen', 'Rich spice colours for local favourites', '#783925', '#ac501c', '#fbf1e3', 'grid', 'serif', '#fffaf0'),
    template('midnight', 'Midnight Lounge', 'A purple night theme with two menu columns', '#28203e', '#c1a0ef', '#191625', 'grid', 'sans', '#2b253b', '#f5efff'),
];

export const DEFAULT_MENU_DESIGN = MENU_TEMPLATES[0].design;
export const PLAIN_MENU_DESIGN: MenuDesign = {
    templateId: 'custom', accentColor: '#20221f', headerColor: '#ffffff',
    backgroundColor: '#ffffff', surfaceColor: '#ffffff', textColor: '#20221f',
    layout: 'list', fontStyle: 'sans', showImages: false,
    pageSize: 'a4', orientation: 'portrait',
    visualStyle: 'classic', sectionColumns: 1, decoration: 'none',
};
export const getMenuDesign = (design?: Partial<MenuDesign>): MenuDesign => ({ ...DEFAULT_MENU_DESIGN, ...design });
export const menuFont = (design: MenuDesign) => design.fontStyle === 'serif' ? 'Georgia, "Times New Roman", serif' : 'inherit';

// Subtle decorations are shared by the builder, customer menu and print preview.
export const menuDecoration = (design: MenuDesign) => {
    const color = design.accentColor;
    switch (design.decoration) {
        case 'glow': return {
            backgroundImage: `radial-gradient(ellipse at 100% 0%, ${color}18, transparent 45%), radial-gradient(ellipse at 0% 100%, ${color}0c, transparent 40%)`,
        };
        case 'border': return { outline: `2px solid ${color}`, outlineOffset: '-12px' };
        case 'corners': return {
            backgroundImage: `linear-gradient(${color}, ${color}), linear-gradient(${color}, ${color}), linear-gradient(${color}, ${color}), linear-gradient(${color}, ${color})`,
            backgroundSize: '48px 3px, 3px 48px, 48px 3px, 3px 48px',
            backgroundPosition: '12px 12px, 12px 12px, calc(100% - 12px) calc(100% - 12px), calc(100% - 12px) calc(100% - 12px)',
            backgroundRepeat: 'no-repeat',
        };
        case 'dots': return {
            backgroundImage: `radial-gradient(circle, ${color}30 1px, transparent 1px)`,
            backgroundSize: '18px 18px',
        };
        default: return {};
    }
};
export const contrastingText = (hex: string) => {
    const rgb = hex.replace('#', '');
    const luminance = [0, 2, 4].reduce((sum, offset, index) => sum + parseInt(rgb.slice(offset, offset + 2), 16) * [0.299, 0.587, 0.114][index], 0);
    return luminance > 155 ? '#17202a' : '#ffffff';
};

export const menuPageDimensions = (design: MenuDesign) => {
    const sizes = { a4: [210, 297], a5: [148, 210], letter: [215.9, 279.4] };
    const [short, long] = sizes[design.pageSize ?? 'a4'];
    const [widthMm, heightMm] = design.orientation === 'landscape' ? [long, short] : [short, long];
    return { widthMm, heightMm, width: widthMm * 96 / 25.4, height: heightMm * 96 / 25.4 };
};
