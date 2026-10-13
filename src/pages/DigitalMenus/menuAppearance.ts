import type { MenuDesign } from './menuTemplates';
import type { MenuBlock } from './menuContent';

export const modernMenu = (design: MenuDesign) => !!design.visualStyle && design.visualStyle !== 'classic';
export const menuGridStyle = (design: MenuDesign) => ({
    display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
    columnGap: modernMenu(design) ? 3 : 4, rowGap: modernMenu(design) ? 3.5 : 2.5, alignItems: 'start',
});

// The same appearance is used in editing, customer menus, and printed pages.
export const menuBlockStyle = (block: Pick<MenuBlock, 'type'> & Partial<Pick<MenuBlock, 'align'>>, design: MenuDesign) => {
    if (!modernMenu(design)) return {};
    // The accent bar follows the title's alignment.
    if (block.type === 'title') return {
        pb: 3, mb: 1, position: 'relative' as const,
        '&::after': { content: '""', display: 'block', mt: 2, ml: block.align === 'center' || block.align === 'right' ? 'auto' : 0, mr: block.align === 'center' ? 'auto' : 0, width: 56, height: 5, borderRadius: 3, bgcolor: design.accentColor },
    };
    if (block.type !== 'section') return {};
    if (design.visualStyle === 'cards') return {
        p: 3, borderRadius: '22px', bgcolor: design.surfaceColor,
        border: `1px solid ${design.textColor}12`, boxShadow: `0 8px 28px ${design.textColor}06`,
        borderTop: `4px solid ${design.accentColor}`,
    };
    if (design.visualStyle === 'editorial') return { p: 2.5, borderRadius: '24px', bgcolor: design.surfaceColor, border: `1px solid ${design.accentColor}20`, boxShadow: `0 10px 35px ${design.textColor}06` };
    return { py: 1 };
};
export const menuTextStyle = (block: MenuBlock, design: MenuDesign) => ({
    m: 0, color: block.color, fontSize: block.fontSize, lineHeight: 1.25,
    textAlign: block.align, fontWeight: block.type === 'label' ? 400 : 800,
    letterSpacing: modernMenu(design) ? block.type === 'title' ? '-.045em' : '-.025em' : 'normal',
    whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
    ...(block.headingStyle ? { bgcolor: block.headingStyle.backgroundColor, color: block.headingStyle.color, textAlign: block.headingStyle.align, px: 1, py: .3, fontFamily: 'Arial, sans-serif', letterSpacing: 'normal' } : {}),
});
export const menuItemStyle = (design: MenuDesign) => ({
    minWidth: 0, minHeight: modernMenu(design) ? 52 : 30, color: design.textColor,
    py: modernMenu(design) ? 1 : 0,
    borderBottom: modernMenu(design) ? 'none' : `1px solid ${design.textColor}1a`,
});
export const menuPriceStyle = (design: MenuDesign) => ({
    fontSize: 14, fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums',
    ...(modernMenu(design) ? { bgcolor: `${design.accentColor}0d`, color: design.accentColor, borderRadius: '10px', px: 1.25, py: .75 } : {}),
});
