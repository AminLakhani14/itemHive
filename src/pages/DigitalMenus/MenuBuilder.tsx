import React from 'react';
import { Alert, Autocomplete, Box, Button, ButtonBase, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, InputBase, Menu, MenuItem, Stack, TextField, Tooltip, Typography, alpha } from '@mui/material';
import { ArrowDown, ArrowUp, GripVertical, ImagePlus, Layers, MoreHorizontal, Plus, Trash2, Type } from 'lucide-react';
import { menuBlockStyle, menuGridStyle, menuItemStyle, menuPriceStyle, menuTextStyle, modernMenu } from './menuAppearance';
import { menuFont, type MenuDesign } from './menuTemplates';
import { continueSectionOnPage, menuItemPrice, moveMenuBlock, newMenuBlock, reorderMenuBlock, sectionProducts, unsectionedProducts, type MenuBlock, type MenuPrices, type MenuProduct, type PictureHeadingStyle } from './menuContent';
import MenuSheet from './MenuSheet';
import PrintMenuButton from './PrintMenuButton';
import { MenuBlockText, MenuItemDetails, MenuProductCard, MenuSectionImage } from './MenuPageContent';
import { createTemplatePage, MENU_LAYOUTS } from './menuLayouts';
import type { MenuDeal } from './aiMenu';
import MenuDealsSection from './MenuDealsSection';
import PictureMenuPage from './PictureMenuPage';
import { addPictureSection, movePictureItem, movePictureSection } from './pictureMenu';
import SectionImagePicker from './SectionImagePicker';

type Props = {
    design: MenuDesign; name: string; onNameChange: (name: string) => void; content: MenuBlock[]; onChange: (content: MenuBlock[]) => void;
    pageCount: number; onPageCountChange: (count: number) => void;
    products: MenuProduct[]; productIds: string[]; onProductsChange: (ids: string[]) => void;
    productPrices: MenuPrices; onPricesChange: (prices: MenuPrices) => void;
    loading: boolean; productsError: string | null; onRetry: () => void; disabled?: boolean;
    aiAssistant?: React.ReactNode; deals?: MenuDeal[];
    editableDealIds?: string[]; onDealChange?: (id: string, update: Partial<Pick<MenuDeal, 'name' | 'dealPrice'>>) => void; onDealRemove?: (id: string) => void;
};

function DraggableBlock({ block, design, active, index, count, disabled, onSelect, onTextChange, onMove, onDelete, onDragStart, onDragMove, onDragEnd, dragging, dropTarget, children, visual }: {
    block: MenuBlock; design: MenuDesign; active: boolean; index: number; count: number; disabled: boolean;
    onSelect: () => void; onMove: (delta: number) => void; onDelete: () => void; children: React.ReactNode;
    onTextChange: (text: string) => void;
    onDragStart: (event: React.PointerEvent) => void; onDragMove: (event: React.PointerEvent) => void; onDragEnd: () => void; dragging: boolean; dropTarget: boolean;
    visual?: React.ReactNode;
}) {
    return <Box data-menu-block={block.id} sx={{ ...menuBlockStyle(block, design), position: 'relative', minWidth: 0, gridColumn: { xs: 'span 6', sm: `span ${block.span ?? 6}` }, opacity: dragging ? .5 : 1, outline: dropTarget ? `2px dashed ${design.accentColor}` : active ? `1px solid ${alpha(design.accentColor, .6)}` : 'none', outlineOffset: 5, '& .block-tools': { opacity: active ? 1 : .35 }, '&:hover .block-tools, &:focus-within .block-tools': { opacity: 1 } }}>
        <Tooltip title="Drag to arrange"><IconButton className="block-tools" size="small" aria-label={`Drag ${block.text}`} disabled={disabled} onPointerDown={event => { if (!disabled) onDragStart(event); }} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd} sx={{ position: 'absolute', left: -26, top: 1, p: .3, color: design.textColor, cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}><GripVertical size={15} /></IconButton></Tooltip>
        <Stack className="block-tools" direction="row" sx={{ position: 'absolute', right: 0, top: -24, zIndex: 1, bgcolor: design.backgroundColor }}><IconButton size="small" aria-label={`Move ${block.text} up`} disabled={disabled || index === 0} onClick={() => onMove(-1)} sx={{ p: .3, color: design.textColor }}><ArrowUp size={14} /></IconButton><IconButton size="small" aria-label={`Move ${block.text} down`} disabled={disabled || index === count - 1} onClick={() => onMove(1)} sx={{ p: .3, color: design.textColor }}><ArrowDown size={14} /></IconButton>{block.type !== 'title' && <IconButton size="small" aria-label={`Remove ${block.text}`} disabled={disabled} onClick={onDelete} sx={{ p: .3, color: design.textColor }}><Trash2 size={14} /></IconButton>}</Stack>
        {block.type === 'section' && <MenuSectionImage block={block} />}
        {visual || (active && block.type !== 'image' ? <InputBase fullWidth multiline autoFocus value={block.text} disabled={disabled} onChange={event => onTextChange(event.target.value)} inputProps={{ 'aria-label': `Edit ${block.type} on menu card`, maxLength: block.type === 'title' ? 100 : block.type === 'label' ? 500 : 160 }} sx={{ ...menuTextStyle(block, design), p: 0, minWidth: 0, fontFamily: block.type === 'label' ? 'inherit' : menuFont(design), '& textarea': { textAlign: block.align, overflowWrap: 'anywhere', p: 0 } }} /> : <ButtonBase disabled={disabled} onClick={onSelect} aria-label={`Edit ${block.text}`} sx={{ display: 'block', width: '100%', textAlign: 'left', minWidth: 0 }}><MenuBlockText block={block} design={design} /></ButtonBase>)}
        {children}
    </Box>;

}

export default function MenuBuilder({ design, name, onNameChange, content, onChange, pageCount, onPageCountChange, products, productIds, onProductsChange, productPrices, onPricesChange, loading, productsError, onRetry, disabled = false, aiAssistant, deals = [], editableDealIds, onDealChange, onDealRemove }: Props) {
    const [activeId, setActiveId] = React.useState('');
    const [itemActions, setItemActions] = React.useState<{ anchor: HTMLElement; section: MenuBlock; product: MenuProduct } | null>(null);
    const [movingItem, setMovingItem] = React.useState<{ id: string; name: string; sectionId: string } | null>(null);
    const [layoutError, setLayoutError] = React.useState('');
    const [pickerSectionId, setPickerSectionId] = React.useState<string | null>(null);
    const [pictureSectionId, setPictureSectionId] = React.useState<string | null>(null);
    const [imageSectionId, setImageSectionId] = React.useState<string | null>(null);
    const imageSection = content.find(block => block.id === imageSectionId && block.type === 'section');
    const pictureStyles = React.useRef<Record<string, PictureHeadingStyle>>({});
    const [pickerProductId, setPickerProductId] = React.useState('');
    const [pickerPrice, setPickerPrice] = React.useState('');
    const [page, setPage] = React.useState(1);
    const [draggingId, setDraggingId] = React.useState('');
    const [dropId, setDropId] = React.useState('');
    const [preferredSectionSpan, setPreferredSectionSpan] = React.useState<2 | 3 | 6>(design.sectionColumns ? (6 / design.sectionColumns) as 2 | 3 | 6 : MENU_LAYOUTS[design.templateId]?.sections[0].span ?? 6);
    const drag = React.useRef({ id: '', target: '', x: 0, y: 0, after: false });
    const pageContent = content.filter(block => (block.page ?? 1) === page);
    const pictureSections = pageContent.filter(block => block.source);
    const pictureSection = content.find(block => block.id === pictureSectionId);
    const pageSections = pageContent.filter(block => block.type === 'section' && !block.source);
    const sectionSpan = pageSections.length ? pageSections.every(block => (block.span ?? 6) === (pageSections[0].span ?? 6)) ? pageSections[0].span ?? 6 : 'mixed' : preferredSectionSpan;
    const newSectionSpan = sectionSpan === 'mixed' ? preferredSectionSpan : sectionSpan;
    const title = pageContent.find(block => block.type === 'title');
    const titlePosition = title?.id === pageContent[0]?.id ? 'top' : title?.id === pageContent.at(-1)?.id ? 'bottom' : 'custom';
    const pageElementCount = MENU_LAYOUTS[design.templateId] ? 3 + MENU_LAYOUTS[design.templateId].sections.length : 0;
    const startDrag = (id: string, event: React.PointerEvent) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { id, target: '', x: event.clientX, y: event.clientY, after: false };
    };
    const moveDrag = (event: React.PointerEvent) => {
        if (!drag.current.id || Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) < 6) return;
        setDraggingId(drag.current.id);
        const element = document.elementsFromPoint(event.clientX, event.clientY).map(value => value.closest('[data-menu-block]')).find(value => value && value.getAttribute('data-menu-block') !== drag.current.id);
        drag.current.target = element?.getAttribute('data-menu-block') || '';
        if (element) {
            const rect = element.getBoundingClientRect();
            drag.current.after = event.clientY > rect.top + rect.height / 2 || event.clientX > rect.left + rect.width / 2;
        }
        setDropId(drag.current.target);
        // Keep long menus reachable while dragging near the viewport edges.
        if (event.clientY > window.innerHeight - 70) window.scrollBy(0, 16);
        else if (event.clientY < 100) window.scrollBy(0, -16);
    };
    const endDrag = () => {
        if (!disabled && drag.current.target) onChange(reorderMenuBlock(content, drag.current.id, drag.current.target, drag.current.after));
        // Opening the style controls only after the drop keeps the canvas stationary during dragging.
        if (!disabled && drag.current.id) setActiveId(drag.current.id);
        drag.current.id = ''; drag.current.target = ''; setDraggingId(''); setDropId('');
    };
    const active = content.find(block => block.id === activeId);
    const pickerSection = content.find(block => block.id === pickerSectionId);
    const selectedProducts = products.filter(product => productIds.includes(product.id)).map(product => ({ ...product, salePrice: menuItemPrice(product, productPrices) }));
    const remaining = unsectionedProducts(content, selectedProducts);
    const pickerProduct = products.find(product => product.id === pickerProductId) ?? null;
    const pickerPriceValid = pickerPrice.trim() !== '' && Number.isFinite(Number(pickerPrice)) && Number(pickerPrice) >= 0 && Number.isFinite(Number(pickerPrice) * 100);
    const pickerOwner = content.find(block => block.type === 'section' && block.productIds.includes(pickerProductId));
    const updateBlock = (id: string, update: Partial<MenuBlock>) => onChange(content.map(block => block.id === id ? { ...block, ...update, ...(block.headingStyle ? { headingStyle: { ...block.headingStyle, ...(update.color ? { color: update.color } : {}), ...(update.align ? { align: update.align } : {}) } } : {}) } : update.page !== undefined && block.source?.imageId === id ? { ...block, page: update.page } : block));

    const addBlock = (type: MenuBlock['type']) => {
        if (content.length >= 100) return;
        if (type === 'section' && pictureSections.length) {
            const template = pictureSections.find(section => section.id === activeId) || pictureSections.at(-1)!;
            const result = addPictureSection(content, template, undefined, template.headingStyle || pictureStyles.current[template.id]);
            if (result) { onChange(result.content); setActiveId(''); setPictureSectionId(result.section.id); }
            return;
        }
        const block = newMenuBlock(type, type === 'label' ? design.textColor : design.accentColor);
        const original = content.filter(section => section.source && !section.source.templateOnly).at(-1);
        if (type === 'section' && original) {
            block.text = original.text === original.text.toUpperCase() ? 'NEW SECTION' : 'New section';
            block.headingStyle = original.headingStyle || pictureStyles.current[original.id];
            block.fontSize = original.fontSize;
            if (block.headingStyle) { block.color = block.headingStyle.color; block.align = block.headingStyle.align; }
        }
        block.page = page;
        if (type === 'section') block.span = newSectionSpan;
        onChange([...content, block]);
        setActiveId(block.id);
    };
    const openProducts = (sectionId?: string) => {
        setPickerProductId('');
        setPickerPrice('');
        if (sectionId) { setPickerSectionId(sectionId); return; }
        const target = active?.type === 'section' && (active.page ?? 1) === page ? active : pageContent.find(block => block.type === 'section');
        if (target) { setPickerSectionId(target.id); return; }
        if (content.length >= 100) return;
        const section = newMenuBlock('section', design.accentColor, 'Menu items');
        section.page = page;
        section.span = newSectionSpan;
        onChange([...content, section]);
        setActiveId(section.id);
        setPickerSectionId(section.id);
    };
    const addProduct = () => {
        if (!pickerSection || !pickerProduct || !pickerPriceValid || pickerSection.productIds.includes(pickerProduct.id)) return;
        const id = pickerProduct.id;
        onChange(content.map(block => ({ ...block, productIds: [...block.productIds.filter(value => value !== id), ...(block.id === pickerSection.id ? [id] : [])] })));
        onProductsChange([...new Set([...productIds, id])]);
        onPricesChange({ ...productPrices, [id]: Math.round(Number(pickerPrice) * 100) / 100 });
        setPickerSectionId(null);
    };
    const removeProduct = (id: string) => {
        onChange(content.map(block => ({ ...block, productIds: block.productIds.filter(value => value !== id) })));
        onProductsChange(productIds.filter(value => value !== id));
    };
    const priceField = (product: MenuProduct) => <InputBase startAdornment={modernMenu(design) ? <InputAdornment position="start" sx={{ mr: .5, '& p': { fontSize: 11, color: design.textColor } }}>Rs.</InputAdornment> : undefined} type="number" value={menuItemPrice(product, productPrices)} disabled={disabled}
        onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) onPricesChange({ ...productPrices, [product.id]: value }); }}
        onBlur={() => { const value = productPrices[product.id]; if (Object.hasOwn(productPrices, product.id) && Number.isFinite(value * 100)) onPricesChange({ ...productPrices, [product.id]: Math.round(value * 100) / 100 }); }}
        inputProps={{ min: 0, step: '0.01', 'aria-label': `Price for ${product.name}` }}
        sx={{ ...menuPriceStyle(design), width: modernMenu(design) ? 104 : 76, flexShrink: 0, color: menuItemPrice(product, productPrices) < 0 ? 'error.main' : design.textColor, fontSize: 14, lineHeight: '28px', height: modernMenu(design) ? 36 : 28, borderBottom: modernMenu(design) ? 'none' : '1px dashed', borderColor: alpha(design.textColor, .3), '& input': { p: '2px 0', textAlign: 'right', MozAppearance: 'textfield' }, '& input::-webkit-inner-spin-button, & input::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 } }} />;
    const continueItem = (section: MenuBlock, product: MenuProduct) => {
        const styledContent = content.map(block => block.source && pictureStyles.current[block.id] ? { ...block, headingStyle: pictureStyles.current[block.id] } : block);
        const result = continueSectionOnPage(styledContent, section.id, product.id, pageCount, createTemplatePage(design, name, (section.page ?? 1) + 1));
        if (!result) { setLayoutError('There is no room for another page or section. The limits are 20 pages and 100 elements.'); return; }
        onChange(result.content); onPageCountChange(result.pageCount); setPage(result.page); setActiveId('');
    };
    const removeBlock = (block: MenuBlock) => {
        onChange(content.filter(value => value.id !== block.id).map(value => value.source?.imageId === block.id ? { ...value, source: undefined } : value));
        if (block.type === 'section') onProductsChange(productIds.filter(id => !block.productIds.includes(id)));
        if (activeId === block.id) setActiveId('');
    };
    const transferProduct = (id: string, targetId: string) => {
        onChange(content.map(block => ({ ...block, productIds: block.type === 'section' ? [...block.productIds.filter(value => value !== id), ...(block.id === targetId ? [id] : [])] : [] })));
    };

    return <Stack spacing={2}>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button variant="outlined" startIcon={<Layers size={18} />} onClick={() => addBlock('section')} disabled={disabled || content.length >= 100}>Add Section</Button>
            <Button variant="outlined" startIcon={<Type size={18} />} onClick={() => addBlock('heading')} disabled={disabled || content.length >= 100}>Add Heading</Button>
            <Button variant="outlined" startIcon={<Type size={16} />} onClick={() => addBlock('label')} disabled={disabled || content.length >= 100}>Add Label</Button>
            <PrintMenuButton content={content.map(block => block.type === 'title' ? { ...block, text: name || 'Your menu name' } : block)} products={selectedProducts} design={design} pageCount={pageCount} disabled={disabled} deals={deals} />
            {aiAssistant}
            <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => openProducts()} disabled={disabled || (content.length >= 100 && !content.some(block => block.type === 'section'))}>Add item</Button>
        </Stack>
        <Typography variant="body2" color="text.secondary">Click text in the card to edit it directly. On an imported picture, drag section and item grips to reorder them, or use the arrow and options buttons. New sections copy the original heading style. Drag the handles to arrange elements, including the menu name. The menu fills your screen. Use Print to preview all pages on A4 paper. {MENU_LAYOUTS[design.templateId] ? 'New pages include this template’s headings and empty sections.' : 'New pages start blank so you can choose their layout.'}</Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
            {Array.from({ length: pageCount }, (_, index) => <Button key={index} variant={page === index + 1 ? 'contained' : 'outlined'} aria-pressed={page === index + 1} disabled={disabled} onClick={() => { setPage(index + 1); setActiveId(''); }}>Page {index + 1}</Button>)}
            <Tooltip title={content.length + pageElementCount > 100 ? 'This template page would exceed the 100-element limit' : pageCount >= 20 ? 'The limit is 20 pages' : 'Add a new menu page'}><span><Button startIcon={<Plus size={16} />} disabled={disabled || pageCount >= 20 || content.length + pageElementCount > 100} onClick={() => { const nextPage = pageCount + 1; onChange([...content, ...createTemplatePage(design, name, nextPage)]); onPageCountChange(nextPage); setPage(nextPage); setActiveId(''); }}>Add page</Button></span></Tooltip>
            <Tooltip title={pageContent.length ? 'Move or remove the elements on this page first' : 'Remove this empty page'}><span><IconButton aria-label="Remove empty page" disabled={disabled || pageCount === 1 || pageContent.length > 0} onClick={() => { onChange(content.map(block => ({ ...block, page: (block.page ?? 1) > page ? (block.page ?? 1) - 1 : block.page ?? 1 }))); onPageCountChange(pageCount - 1); setPage(Math.min(page, pageCount - 1)); }}><Trash2 size={18} /></IconButton></span></Tooltip>
        </Stack>
        <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
            <TextField size="small" select label="Sections per row" value={sectionSpan} disabled={disabled} helperText="Applies to sections on this page" sx={{ minWidth: 225 }} onChange={event => { const span = Number(event.target.value) as 2 | 3 | 6; setPreferredSectionSpan(span); onChange(content.map(block => block.type === 'section' && (block.page ?? 1) === page ? { ...block, span } : block)); }}><MenuItem value={6}>1 section</MenuItem><MenuItem value={3}>2 sections</MenuItem><MenuItem value={2}>3 sections</MenuItem>{sectionSpan === 'mixed' && <MenuItem value="mixed" disabled>Mixed widths</MenuItem>}</TextField>
            {title && !pictureSections.length && <TextField size="small" select label="Menu title position" value={titlePosition} disabled={disabled || pageContent.length === 1} helperText="Or drag the title to any position" sx={{ minWidth: 225 }} onChange={event => { const bottom = event.target.value === 'bottom'; const target = bottom ? pageContent.at(-1) : pageContent[0]; if (target) onChange(reorderMenuBlock(content, title.id, target.id, bottom)); }}><MenuItem value="top">Top of page</MenuItem><MenuItem value="bottom">Bottom of page</MenuItem>{titlePosition === 'custom' && <MenuItem value="custom" disabled>Custom position</MenuItem>}</TextField>}
        </Stack>
        {active && <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} useFlexGap flexWrap="wrap" alignItems={{ md: 'start' }}>
            <TextField size="small" label={active.type === 'title' ? 'Menu title' : active.type === 'image' ? 'Picture description' : active.type === 'section' ? 'Section heading' : active.type === 'heading' ? 'Heading text' : 'Label text'} multiline value={active.type === 'title' ? name : active.text} disabled={disabled} onChange={event => active.type === 'title' ? onNameChange(event.target.value) : updateBlock(active.id, { text: event.target.value })} error={!(active.type === 'title' ? name : active.text).trim()} slotProps={{ htmlInput: { maxLength: active.type === 'title' ? 100 : active.type === 'label' ? 500 : 160 } }} sx={{ flex: 1, minWidth: 180 }} />
            {active.type !== 'image' && <>
            <TextField size="small" select label="Font size" value={active.fontSize} disabled={disabled} onChange={event => updateBlock(active.id, { fontSize: Number(event.target.value) })} sx={{ minWidth: 115 }}>{[...new Set([12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80, 96, active.fontSize])].sort((a, b) => a - b).map(size => <MenuItem key={size} value={size}>{size} px</MenuItem>)}</TextField>
            <TextField size="small" type="color" label="Text colour" value={active.color} disabled={disabled} onChange={event => updateBlock(active.id, { color: event.target.value })} slotProps={{ htmlInput: { style: { height: 24, padding: 6 } }, inputLabel: { shrink: true } }} sx={{ width: { md: 110 } }} />
            <TextField size="small" select label="Alignment" value={active.align} disabled={disabled} onChange={event => updateBlock(active.id, { align: event.target.value as MenuBlock['align'] })} sx={{ minWidth: 125 }}><MenuItem value="left">Left</MenuItem><MenuItem value="center">Centre</MenuItem><MenuItem value="right">Right</MenuItem></TextField>
            </>}
            <TextField size="small" select label="Width" value={active.span ?? 6} disabled={disabled} onChange={event => updateBlock(active.id, { span: Number(event.target.value) as MenuBlock['span'] })} sx={{ minWidth: 145 }}><MenuItem value={6}>Full row</MenuItem><MenuItem value={3}>Half row</MenuItem><MenuItem value={2}>One-third row</MenuItem></TextField>
            <TextField size="small" select label="Page" value={active.page ?? 1} disabled={disabled} onChange={event => { const next = Number(event.target.value); updateBlock(active.id, { page: next }); setPage(next); }} sx={{ minWidth: 100 }}>{Array.from({ length: pageCount }, (_, index) => <MenuItem key={index} value={index + 1}>Page {index + 1}</MenuItem>)}</TextField>
        </Stack></Box>}
        {layoutError && <Alert severity="warning" onClose={() => setLayoutError('')}>{layoutError}</Alert>}
        <Box sx={{ bgcolor: 'action.hover', p: { xs: 1, sm: 3 }, borderRadius: 2 }}>
            <MenuSheet design={design}>
                {!pageContent.length && !(page === pageCount && deals.length) && <Box sx={{ textAlign: 'center', py: 6, border: '1px dashed', borderColor: alpha(design.textColor, .25), borderRadius: 2 }}><Typography variant="h6" fontWeight={800}>Page {page} is ready</Typography><Typography sx={{ mt: 1, opacity: .7 }}>Add sections, headings, or labels, or move an element here with its Page control.</Typography></Box>}
                <Box sx={{ ...menuGridStyle(design) }}>
                    {pageContent.filter(block => !block.source && !(pictureSections.length && block.type === 'title')).map((block) => { const index = pageContent.indexOf(block); return <DraggableBlock key={block.id} block={block.type === 'title' ? { ...block, text: name || (block.id === activeId ? '' : 'Your menu name') } : block} design={design} active={block.id === activeId} index={index} count={pageContent.length} disabled={disabled} onSelect={() => setActiveId(block.id)} onTextChange={text => block.type === 'title' ? onNameChange(text) : updateBlock(block.id, { text })} onMove={delta => { const target = pageContent[index + delta]; if (target) { const values = moveMenuBlock(pageContent, index, delta); let i = 0; onChange(content.map(value => (value.page ?? 1) === page ? values[i++] : value)); } }} onDelete={() => removeBlock(block)} onDragStart={event => startDrag(block.id, event)} onDragMove={moveDrag} onDragEnd={endDrag} dragging={draggingId === block.id} dropTarget={dropId === block.id} visual={block.type === 'image' && pictureSections.some(section => section.source?.imageId === block.id) ? <PictureMenuPage image={block} sections={pictureSections.filter(section => section.source?.imageId === block.id)} products={selectedProducts} design={design} disabled={disabled} onAddItem={openProducts} onEditSection={setPictureSectionId} onMoveSection={(id, target, after) => onChange(movePictureSection(content, id, target, after))} onMoveItem={(id, target, item, after) => onChange(movePictureItem(content, id, target, item, after))} onItemMenu={(anchor, section, product) => setItemActions({ anchor, section, product })} onHeadingStyles={styles => { pictureStyles.current = { ...pictureStyles.current, ...styles }; }} /> : undefined}>
                        {block.type === 'section' && <Stack spacing={.5} sx={{ mt: modernMenu(design) ? 2 : 1 }}>
                            {!modernMenu(design) && block.productIds.length > 0 && <Stack direction="row" justifyContent="space-between" sx={{ color: design.textColor, opacity: .85, pr: '24px' }}><Typography sx={{ fontSize: 11, fontWeight: 700 }}>Item</Typography><Typography sx={{ fontSize: 11, fontWeight: 700, width: 76, textAlign: 'right' }}>Price (Rs.)</Typography></Stack>}
                            <Stack spacing={0}>
                                {sectionProducts(block, selectedProducts).map(product => <Stack key={product.id} data-menu-item={product.id} direction="row" spacing={.75} alignItems="center" sx={menuItemStyle(design)}>
                                    <MenuItemDetails product={product} design={design} />
                                    {priceField(product)}
                                    <IconButton size="small" aria-label={`Options for ${product.name}`} disabled={disabled} onClick={event => setItemActions({ anchor: event.currentTarget, section: block, product })} sx={{ p: .3, color: design.textColor }}><MoreHorizontal size={17} /></IconButton>
                                </Stack>)}
                            </Stack>
                            <Stack direction="row" gap={1.5} flexWrap="wrap" sx={{ pt: 1 }}><Button size="small" startIcon={<Plus size={13} />} onClick={() => openProducts(block.id)} disabled={disabled} sx={{ color: design.accentColor, fontSize: 11, minHeight: 24, p: '2px 0' }}>Add item to this section</Button><Button size="small" startIcon={<ImagePlus size={14} />} aria-label={`Change section image for ${block.text}`} disabled={disabled} onClick={() => setImageSectionId(block.id)} sx={{ color: design.accentColor, fontSize: 11 }}>{block.sectionImage ? 'Change section image' : 'Add section image'}</Button></Stack>
                        </Stack>}

                    </DraggableBlock>; })}
                </Box>
                {page === 1 && remaining.length > 0 && <Box sx={{ mt: 3 }}><Typography fontWeight={800} sx={{ mb: 1.5 }}>Other menu items</Typography><Stack spacing={1}>{remaining.map(product => <MenuProductCard key={product.id} product={product} design={{ ...design, layout: 'list' }} priceControl={priceField(product)} />)}</Stack><Button sx={{ mt: 1 }} onClick={() => { if (content.length < 100) { const section = newMenuBlock('section', design.accentColor, 'Menu items'); section.productIds = remaining.map(product => product.id); onChange([...content, section]); setActiveId(section.id); } }} disabled={disabled || content.length >= 100}>Move these items into a section</Button></Box>}
                {page === pageCount && <MenuDealsSection deals={deals} products={products} design={design} editableDealIds={editableDealIds} disabled={disabled} onChange={onDealChange} onRemove={onDealRemove} />}
            </MenuSheet>
        </Box>
        <SectionImagePicker key={imageSectionId ?? "closed"} open={Boolean(imageSection)} name={imageSection?.text ?? ''} image={imageSection?.sectionImage} products={imageSection ? sectionProducts(imageSection, products) : []} otherImageLength={content.reduce((sum, block) => sum + (block.imageUrl?.length ?? 0) + (block.id !== imageSectionId ? block.sectionImage?.url.length ?? 0 : 0), 0)} onChange={sectionImage => { if (imageSection) updateBlock(imageSection.id, { sectionImage }); }} onClose={() => setImageSectionId(null)} />
        <Menu anchorEl={itemActions?.anchor} open={!!itemActions} onClose={() => setItemActions(null)}>
            <MenuItem disabled={!itemActions || itemActions.section.productIds.indexOf(itemActions.product.id) === 0} onClick={() => { if (itemActions) updateBlock(itemActions.section.id, { productIds: moveMenuBlock(itemActions.section.productIds, itemActions.section.productIds.indexOf(itemActions.product.id), -1) }); setItemActions(null); }}>Move item up</MenuItem>
            <MenuItem disabled={!itemActions || itemActions.section.productIds.indexOf(itemActions.product.id) === itemActions.section.productIds.length - 1} onClick={() => { if (itemActions) updateBlock(itemActions.section.id, { productIds: moveMenuBlock(itemActions.section.productIds, itemActions.section.productIds.indexOf(itemActions.product.id), 1) }); setItemActions(null); }}>Move item down</MenuItem>
            <MenuItem onClick={() => { if (itemActions) setMovingItem({ id: itemActions.product.id, name: itemActions.product.name, sectionId: itemActions.section.id }); setItemActions(null); }}>Move to another section</MenuItem>
            <MenuItem disabled={(itemActions?.section.page ?? 1) >= 20} onClick={() => { if (itemActions) continueItem(itemActions.section, itemActions.product); setItemActions(null); }}>Continue on next page from this item</MenuItem>
            <MenuItem onClick={() => { if (itemActions) removeProduct(itemActions.product.id); setItemActions(null); }}>Remove item</MenuItem>
        </Menu>
        <Dialog open={Boolean(pictureSection)} onClose={() => setPictureSectionId(null)} fullWidth maxWidth="sm">
            <DialogTitle>Edit {pictureSection?.text}</DialogTitle>
            <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
                {pictureSection && <>
                    <TextField label="Section heading" value={pictureSection.text} disabled={disabled} onChange={event => updateBlock(pictureSection.id, { text: event.target.value })} slotProps={{ htmlInput: { maxLength: 160 } }} />
                    <Button startIcon={<ImagePlus size={16} />} disabled={disabled} onClick={() => { setPictureSectionId(null); setImageSectionId(pictureSection.id); }}>{pictureSection.sectionImage ? 'Change section image' : 'Add section image'}</Button>
                    {sectionProducts(pictureSection, selectedProducts).map(product => <Stack key={product.id} direction="row" alignItems="center" spacing={1} sx={{ color: design.textColor, bgcolor: design.backgroundColor, p: 1, borderRadius: 1 }}>
                        <Typography sx={{ flex: 1 }}>{product.name}</Typography>{priceField(product)}
                        <IconButton aria-label={`Options for ${product.name}`} disabled={disabled} onClick={event => setItemActions({ anchor: event.currentTarget, section: pictureSection, product })}><MoreHorizontal size={18} /></IconButton>
                    </Stack>)}
                    <Button variant="contained" startIcon={<Plus size={16} />} disabled={disabled} onClick={() => { setPictureSectionId(null); openProducts(pictureSection.id); }}>Add item to {pictureSection.text}</Button>
                </>}
            </Stack></DialogContent><DialogActions>{pictureSection?.source?.templateOnly && <Button color="error" disabled={disabled} onClick={() => { removeBlock(pictureSection); setPictureSectionId(null); }}>Remove section</Button>}<Button onClick={() => setPictureSectionId(null)}>Done</Button></DialogActions>
        </Dialog>
        <Dialog open={!!movingItem} onClose={() => setMovingItem(null)} fullWidth maxWidth="xs"><DialogTitle>Move {movingItem?.name}</DialogTitle><DialogContent><TextField fullWidth select label="Section" value={movingItem?.sectionId ?? ''} sx={{ mt: 1 }} onChange={event => { if (movingItem) transferProduct(movingItem.id, event.target.value); setMovingItem(null); }}>{content.filter(block => block.type === 'section').map(block => <MenuItem key={block.id} value={block.id}>{block.text} - Page {block.page ?? 1}</MenuItem>)}</TextField></DialogContent><DialogActions><Button onClick={() => setMovingItem(null)}>Cancel</Button></DialogActions></Dialog>
        <Dialog open={pickerSectionId !== null} onClose={() => setPickerSectionId(null)} fullWidth maxWidth="sm"><DialogTitle>Add an item to {pickerSection?.text || 'this section'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">Choose one item and set its menu price. Add more items by opening this picker again.</Typography>
            {productsError ? <Alert severity="error" action={<Button onClick={onRetry}>Retry</Button>}>{productsError}</Alert> : loading ? <CircularProgress size={24} /> : !products.length ? <Alert severity="info">Add products in Inventory first, then select them for your menu.</Alert> : <>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="start">
                    <Autocomplete fullWidth options={products} value={pickerProduct} getOptionLabel={product => product.name} getOptionKey={product => product.id} isOptionEqualToValue={(option, value) => option.id === value.id} getOptionDisabled={product => pickerSection?.productIds.includes(product.id) ?? false} disabled={disabled}
                        onChange={(_, product) => { setPickerProductId(product?.id ?? ''); setPickerPrice(product ? String(menuItemPrice(product, productPrices)) : ''); }}
                        renderInput={params => <TextField {...params} label="Item" placeholder="Search and choose one item" helperText={pickerProduct ? `Inventory price: Rs. ${pickerProduct.salePrice ?? pickerProduct.price ?? 0}` : 'Items already in this section cannot be added twice'} />} />
                    <TextField label="Price" type="number" value={pickerPrice} disabled={disabled || !pickerProduct} onChange={event => setPickerPrice(event.target.value)} error={!!pickerProduct && !pickerPriceValid} helperText={pickerProduct && !pickerPriceValid ? 'Enter a price of 0 or more' : undefined} slotProps={{ htmlInput: { min: 0, step: '0.01', 'aria-label': 'Item price' }, input: { startAdornment: <InputAdornment position="start">Rs.</InputAdornment> } }} sx={{ width: { xs: '100%', sm: 160 }, flexShrink: 0 }} />
                </Stack>
                {pickerOwner && pickerOwner.id !== pickerSectionId && <Alert severity="info">This item will move from {pickerOwner.text} into {pickerSection?.text}.</Alert>}
                <Typography variant="caption" color="text.secondary">This price applies to this menu. Inventory prices stay unchanged.</Typography>
            </>}
        </Stack></DialogContent><DialogActions><Button onClick={() => setPickerSectionId(null)}>Cancel</Button><Button variant="contained" disabled={disabled || loading || !!productsError || !pickerProduct || !pickerPriceValid || !!pickerSection?.productIds.includes(pickerProductId)} onClick={addProduct}>Add item</Button></DialogActions></Dialog>
    </Stack>;
}
