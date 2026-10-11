export const MENU_TEMPLATE_IDS = ['custom', 'classic', 'modern', 'cafe', 'fast-food', 'fine-dining', 'fresh', 'bakery', 'ocean', 'desi', 'midnight'] as const;

export interface MenuDesign {
    templateId: typeof MENU_TEMPLATE_IDS[number];
    accentColor: string;
    headerColor: string;
    backgroundColor: string;
    surfaceColor: string;
    textColor: string;
    layout: 'list' | 'grid';
    fontStyle: 'sans' | 'serif';
    showImages: boolean;
    pageSize?: 'a4' | 'a5' | 'letter';
    orientation?: 'portrait' | 'landscape';
    decoration?: 'none' | 'border' | 'corners' | 'dots' | 'glow';
    visualStyle?: 'classic' | 'cards' | 'minimal' | 'editorial';
    sectionColumns?: 1 | 2 | 3;
}

export const parseMenuDesign = (value: unknown): MenuDesign | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const input = value as Record<string, unknown>;
    if (!MENU_TEMPLATE_IDS.includes(input.templateId as MenuDesign['templateId']) || !['list', 'grid'].includes(String(input.layout)) || !['sans', 'serif'].includes(String(input.fontStyle)) || typeof input.showImages !== 'boolean') return null;
    const colors = ['accentColor', 'headerColor', 'backgroundColor', 'surfaceColor', 'textColor'] as const;
    if (input.pageSize !== undefined && !['a4', 'a5', 'letter'].includes(String(input.pageSize))) return null;
    if (input.orientation !== undefined && !['portrait', 'landscape'].includes(String(input.orientation))) return null;
    if (input.decoration !== undefined && !['none', 'border', 'corners', 'dots', 'glow'].includes(String(input.decoration))) return null;
    if (input.visualStyle !== undefined && !['classic', 'cards', 'minimal', 'editorial'].includes(String(input.visualStyle))) return null;
    if (input.sectionColumns !== undefined && ![1, 2, 3].includes(input.sectionColumns as number)) return null;
    if (colors.some(key => typeof input[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(input[key] as string))) return null;
    return {
        templateId: input.templateId as MenuDesign['templateId'],
        accentColor: input.accentColor as string, headerColor: input.headerColor as string,
        backgroundColor: input.backgroundColor as string, surfaceColor: input.surfaceColor as string, textColor: input.textColor as string,
        layout: input.layout as MenuDesign['layout'], fontStyle: input.fontStyle as MenuDesign['fontStyle'], showImages: input.showImages,
        ...(input.pageSize !== undefined ? { pageSize: input.pageSize as MenuDesign['pageSize'] } : {}),
        ...(input.orientation !== undefined ? { orientation: input.orientation as MenuDesign['orientation'] } : {}),
        ...(input.visualStyle !== undefined ? { visualStyle: input.visualStyle as MenuDesign['visualStyle'] } : {}),
        ...(input.sectionColumns !== undefined ? { sectionColumns: input.sectionColumns as MenuDesign['sectionColumns'] } : {}),
        ...(input.decoration !== undefined ? { decoration: input.decoration as MenuDesign['decoration'] } : {}),
    };
};
