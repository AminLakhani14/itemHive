import { useMemo, useState, type ReactNode } from 'react';
import { Box, Button, ButtonBase, Grid, Stack, Typography, alpha } from '@mui/material';
import { Check, LayoutTemplate, Palette } from 'lucide-react';
import MenuContent from './MenuContentView';
import { createMenuLayout } from './menuLayouts';
import { sectionProducts, type MenuBlock, type MenuProduct } from './menuContent';
import { MENU_TEMPLATES, PLAIN_MENU_DESIGN, menuFont, type MenuDesign } from './menuTemplates';
import type { MenuDeal } from './aiMenu';

type PreviewProduct = MenuProduct;
type Props = { design: MenuDesign; onChange: (design: MenuDesign) => void; name: string; products: PreviewProduct[]; initialView?: 'templates' | 'custom'; content?: MenuBlock[]; extraAction?: ReactNode; deals?: MenuDeal[]; pageCount?: number };

export const MenuPreview = ({ design, name, products, content, deals, pageCount, compact = false }: Omit<Props, 'onChange'> & { compact?: boolean }) => {
    const layout = useMemo(() => content?.length ? content : createMenuLayout(design, name, products.map(product => product.id), products), [content, design, name, products]);
    if (!compact) return <MenuContent content={layout.map(block => block.type === 'title' ? { ...block, text: name || 'Your menu name' } : block)} products={products} design={design} deals={deals} pageCount={pageCount} />;
    const page = Math.min(...layout.map(block => block.page ?? 1));
    return <Box sx={{ bgcolor: design.backgroundColor, color: design.textColor, borderRadius: 2, width: '100%', p: compact ? 1.25 : 3, boxSizing: 'border-box', minHeight: compact ? 245 : 320, border: '1px solid', borderColor: alpha(design.textColor, .12) }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: compact ? .75 : 1.5 }}>
            {layout.filter(block => (block.page ?? 1) === page).map(block => <Box key={block.id} sx={{ gridColumn: `span ${block.span ?? 6}`, minWidth: 0, p: .25 }}>
                <Typography sx={{ fontSize: compact ? block.fontSize * .38 : block.fontSize * .75, lineHeight: 1.25, color: block.color, textAlign: block.align, fontWeight: block.type === 'label' ? 400 : 800, fontFamily: block.type === 'label' ? 'inherit' : menuFont(design), overflowWrap: 'anywhere' }}>{block.type === 'title' ? name || 'Your menu name' : block.text}</Typography>
                {block.type === 'section' && <Stack spacing={compact ? .5 : 1} sx={{ mt: compact ? .75 : 1.5 }}>
                    {sectionProducts(block, products).map(product => <Stack key={product.id} direction="row" spacing={.5} alignItems="center">
                        <Typography sx={{ flex: 1, minWidth: 0, fontSize: 8, overflowWrap: 'anywhere' }}>{product.name}</Typography><Typography sx={{ fontSize: 8, flexShrink: 0 }}>Rs. {product.salePrice ?? product.price ?? 0}</Typography>
                    </Stack>)}
                    {!block.productIds.length && (compact ? <><Box sx={{ height: 3, width: '85%', bgcolor: alpha(design.textColor, .18), borderRadius: 1 }} /><Box sx={{ height: 3, width: '60%', bgcolor: alpha(design.textColor, .1), borderRadius: 1 }} /></> : <Typography variant="caption" sx={{ opacity: .65 }}>Add your items here</Typography>)}
                </Stack>}
            </Box>)}
        </Box>
        {design.templateId === 'custom' && !layout.some(block => block.type === 'section') && <Box sx={{ mt: 3, py: 5, border: '1px dashed', borderColor: alpha(design.textColor, .2), borderRadius: 1, textAlign: 'center' }}><Typography fontWeight={700}>Your blank canvas</Typography><Typography variant="body2" sx={{ mt: 1, opacity: .7 }}>Choose your sections, their widths, and where your headings go in the next step.</Typography></Box>}
    </Box>;
};

export default function MenuDesignPicker({ design, onChange, name, products, initialView, content, extraAction, deals, pageCount }: Props) {
    const isCustom = design.templateId === 'custom';
    const [showTemplates, setShowTemplates] = useState(initialView ? initialView === 'templates' : !isCustom);
    const showGallery = showTemplates || !isCustom;
    return <Stack spacing={2}>
        <Box><Typography fontWeight={800}>Choose your menu design</Typography><Typography variant="body2" color="text.secondary">Choose one of 10 ready-made layouts with arranged headings and sections, or build your own from a blank canvas. Every layout is fully editable.</Typography></Box>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button variant={showGallery ? 'contained' : 'outlined'} startIcon={<LayoutTemplate size={18} />} onClick={() => setShowTemplates(true)}>Menu Templates</Button>
            <Button variant={!showGallery ? 'contained' : 'outlined'} startIcon={<Palette size={18} />} onClick={() => { setShowTemplates(false); onChange(isCustom ? design : { ...PLAIN_MENU_DESIGN }); }}>Create Custom Menu {isCustom && !showGallery && <Check size={16} style={{ marginLeft: 8 }} />}</Button>
            {extraAction}
        </Stack>
        {showGallery && <Grid container spacing={1.5}>
            {MENU_TEMPLATES.map(t => {
                const selected = design.templateId === t.design.templateId;
                return <Grid key={t.design.templateId} size={{ xs: 6, sm: 4, md: 3 }}><ButtonBase onClick={() => onChange({ ...t.design })} aria-label={`Choose ${t.name} template`} aria-pressed={selected} sx={{ display: 'block', width: '100%', height: '100%', textAlign: 'left', p: .75, borderRadius: 2, border: '2px solid', borderColor: selected ? 'primary.main' : 'divider', '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main' } }}>
                    <MenuPreview design={t.design} name={t.name} products={[]} compact />
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}><Typography variant="body2" fontWeight={800}>{t.name}</Typography>{selected && <Check size={16} />}</Stack><Typography variant="caption" color="text.secondary">{t.description}</Typography>
                </ButtonBase></Grid>;
            })}
        </Grid>}
        {isCustom && !showTemplates && <Typography color="text.secondary">Your custom menu is selected. In Make your menu, choose colors, fonts and layout yourself or let AI suggest a complete design.</Typography>}
        <Box><Typography fontWeight={800} sx={{ mb: 1 }}>Live preview</Typography><Box sx={{ maxWidth: 800 }}><MenuPreview design={design} name={name} products={products} content={content} deals={deals} pageCount={pageCount} /></Box><Typography variant="caption" color="text.secondary">{isCustom ? 'Set your sections per row, title position, and pages in Make your menu.' : 'These headings and sections will be ready to edit. New pages start with the same template layout.'}</Typography></Box>
    </Stack>;
}
