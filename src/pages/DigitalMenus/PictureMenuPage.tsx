import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import { ArrowDown, ArrowUp, GripVertical, MoreHorizontal, Pencil, Plus } from 'lucide-react';
import { contrastingText, type MenuDesign } from './menuTemplates';
import { menuItemPrice, type MenuBlock, type MenuProduct, type PictureBox, type PictureHeadingStyle } from './menuContent';
import { pictureMenuLayout } from './pictureMenu';
import { sectionImageUrl } from './sectionImages';

type Props = {
    image: MenuBlock; sections: MenuBlock[]; products: MenuProduct[]; design: MenuDesign;
    renderProduct?: (product: MenuProduct) => ReactNode; onAddItem?: (sectionId: string) => void;
    onEditSection?: (sectionId: string) => void; disabled?: boolean;
    onMoveSection?: (id: string, target: string, after: boolean) => void;
    onMoveItem?: (id: string, sectionId: string, targetId?: string, after?: boolean) => void;
    onItemMenu?: (anchor: HTMLElement, section: MenuBlock, product: MenuProduct) => void;
    onHeadingStyles?: (styles: Record<string, PictureHeadingStyle>) => void;
};
type HeadingPalette = { background: string; text: string; boxed: boolean };
const boxKey = (box: PictureBox) => box.join(',');
const emptyDrag = () => ({ kind: '' as '' | 'section' | 'item', id: '', section: '', target: '', item: undefined as string | undefined, after: false, x: 0, y: 0, moving: false });

/** Sample the printed heading itself so newly added headings retain its original colors. */
function headingPalettes(image: HTMLImageElement, sections: MenuBlock[], background: string) {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return {};
    context.drawImage(image, 0, 0);
    const result: Record<string, HeadingPalette> = {};
    const rgb = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
    const distance = (a: string, b: string) => rgb(a).reduce((sum, value, index) => sum + Math.abs(value - rgb(b)[index]), 0);
    for (const section of sections) {
        const box = section.source?.headingBox;
        if (!box || result[boxKey(box)]) continue;
        const left = Math.floor(box[1] * canvas.width / 1000), top = Math.floor(box[0] * canvas.height / 1000);
        const width = Math.max(1, Math.min(canvas.width - left, Math.ceil((box[3] - box[1]) * canvas.width / 1000)));
        const height = Math.max(1, Math.min(canvas.height - top, Math.ceil((box[2] - box[0]) * canvas.height / 1000)));
        const pixels = context.getImageData(left, top, width, height).data;
        const counts = new Map<string, number>();
        for (let index = 0; index < pixels.length; index += 16) {
            const color = '#' + [pixels[index], pixels[index + 1], pixels[index + 2]].map(value => Math.min(255, Math.round(value / 16) * 16).toString(16).padStart(2, '0')).join('');
            counts.set(color, (counts.get(color) || 0) + 1);
        }
        const colors = [...counts].sort((a, b) => b[1] - a[1]).map(([color]) => color);
        const fill = colors[0] || background;
        result[boxKey(box)] = { background: fill, text: colors.find(color => distance(color, fill) > 240) || contrastingText(fill), boxed: distance(fill, background) > 160 };
    }
    return result;
}

export default function PictureMenuPage({ image, sections, products, design, renderProduct, onAddItem, onEditSection, onMoveSection, onMoveItem, onItemMenu, onHeadingStyles, disabled }: Props) {
    const [aspect, setAspect] = useState(1 / Math.SQRT2);
    const [palettes, setPalettes] = useState<Record<string, HeadingPalette>>({});
    const frame = useRef<HTMLDivElement>(null);
    const loadedImage = useRef<HTMLImageElement>(null);
    const [width, setWidth] = useState(760);
    const drag = useRef(emptyDrag());
    const [dragging, setDragging] = useState('');
    const [drop, setDrop] = useState({ section: '', item: '' });
    const headingKey = [...new Set(sections.flatMap(section => section.source?.headingBox ? [boxKey(section.source.headingBox)] : []))].sort().join('|');
    const readStyles = (element: HTMLImageElement) => {
        const values = headingPalettes(element, sections, design.backgroundColor);
        setPalettes(values);
        onHeadingStyles?.(Object.fromEntries(sections.flatMap(section => {
            const palette = section.source?.headingBox && values[boxKey(section.source.headingBox)];
            return palette ? [[section.id, { backgroundColor: palette.background, color: palette.text, align: palette.boxed ? 'center' as const : section.align }]] : [];
        })));
    };
    useEffect(() => {
        const element = frame.current;
        if (!element) return;
        const observer = new ResizeObserver(() => setWidth(element.clientWidth));
        observer.observe(element); setWidth(element.clientWidth);
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        if (loadedImage.current?.complete && loadedImage.current.naturalWidth) readStyles(loadedImage.current);
        // The key represents the unique immutable source heading areas.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [headingKey, image.imageUrl, design.backgroundColor]);
    const orderBelow = Boolean(renderProduct) && width < 500;
    const prefix = useId().replace(/:/g, '');
    const layout = pictureMenuLayout(sections, products, Boolean(renderProduct) && !orderBelow);
    const cover = layout.groups.filter(group => group.changed).map(group => ({
        ...group,
        left: Math.max(0, Math.min(group.left, ...group.entries.map(entry => entry.section.source!.headingBox?.[1] ?? group.left)) - 12),
        right: Math.min(1000, Math.max(group.right, ...group.entries.map(entry => entry.section.source!.headingBox?.[3] ?? group.right)) + 12),
    }));
    const strips: Array<{ left: number; width: number; top: number; height: number; shift: number }> = [];
    for (const group of cover) {
        for (const entry of group.entries) {
            const source = entry.section.source!;
            strips.push({ left: group.left, width: group.right - group.left, top: entry.start, height: source.box[0] - entry.start, shift: entry.shift });
            if (!entry.edited) strips.push({ left: group.left, width: group.right - group.left, top: source.box[0], height: source.box[2] - source.box[0], shift: entry.shift });
            strips.push({ left: group.left, width: group.right - group.left, top: source.box[2], height: entry.gap, shift: entry.shift + entry.height - (source.box[2] - source.box[0]) });
        }
        if (group.end < 1000) strips.push({ left: group.left, width: group.right - group.left, top: group.end, height: 1000 - group.end, shift: group.extra });
    }
    const begin = (kind: 'section' | 'item', id: string, section: string, event: PointerEvent<HTMLElement>) => {
        if (disabled) return;
        event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { ...emptyDrag(), kind, id, section, x: event.clientX, y: event.clientY };
    };
    const move = (event: PointerEvent<HTMLElement>) => {
        const current = drag.current;
        if (!current.kind || Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return;
        current.moving = true; setDragging(current.id);
        const elements = document.elementsFromPoint(event.clientX, event.clientY);
        const row = current.kind === 'item' ? elements.map(element => element.closest<HTMLElement>('[data-picture-row]')).find(Boolean) : null;
        const section = (row || elements.map(element => element.closest<HTMLElement>('[data-picture-section]')).find(Boolean))?.closest<HTMLElement>('[data-picture-section]');
        current.target = section?.dataset.pictureSection || '';
        current.item = row?.dataset.pictureRow;
        const rect = (row || section)?.getBoundingClientRect();
        current.after = Boolean(rect && event.clientY > rect.top + rect.height / 2);
        setDrop({ section: current.target, item: current.item || '' });
        if (event.clientY > window.innerHeight - 60) window.scrollBy(0, 16);
        else if (event.clientY < 80) window.scrollBy(0, -16);
    };
    const end = () => {
        const current = drag.current;
        if (!disabled && current.moving && current.target) {
            if (current.kind === 'section') onMoveSection?.(current.id, current.target, current.after);
            else onMoveItem?.(current.id, current.target, current.item, current.after);
        }
        drag.current = emptyDrag(); setDragging(''); setDrop({ section: '', item: '' });
    };
    const gripProps = (kind: 'section' | 'item', id: string, section: string) => ({
        onPointerDown: (event: PointerEvent<HTMLElement>) => begin(kind, id, section, event),
        onPointerMove: move, onPointerUp: end,
        onPointerCancel: () => { drag.current = emptyDrag(); setDragging(''); setDrop({ section: '', item: '' }); },
    });

    return <Stack spacing={2}><Box ref={frame} data-picture-menu={image.id} sx={{ position: 'relative', width: '100%', maxWidth: 760, mx: 'auto', containerType: 'inline-size', bgcolor: design.backgroundColor }}>
        <Box component="img" ref={loadedImage} src={image.imageUrl} alt="" aria-hidden onLoad={event => { setAspect(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight); readStyles(event.currentTarget); }} sx={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
        <svg viewBox={`0 0 1000 ${layout.height}`} preserveAspectRatio="none" role="img" aria-label={`Original menu: ${image.text}`} style={{ display: 'block', width: '100%', aspectRatio: String(aspect * 1000 / layout.height) }}>
            <defs>{strips.map((strip, index) => <clipPath id={`${prefix}-${index}`} key={index}><rect x={strip.left} y={strip.top + strip.shift} width={strip.width} height={strip.height} /></clipPath>)}</defs>
            <image href={image.imageUrl} x="0" y="0" width="1000" height="1000" preserveAspectRatio="none" />
            {cover.map((group, index) => <rect key={index} x={group.left} y={group.start} width={group.right - group.left} height={layout.height - group.start} fill={design.backgroundColor} />)}
            {strips.map((strip, index) => <image key={index} href={image.imageUrl} x="0" y={strip.shift} width="1000" height="1000" preserveAspectRatio="none" clipPath={`url(#${prefix}-${index})`} />)}
        </svg>
        {layout.entries.map(entry => {
            const { section, top, row, height, edited, items, shift, headingTop, unitHeight } = entry;
            const source = section.source!;
            const font = row / aspect * .72 / 10;
            const peers = layout.groups.find(group => group.entries.includes(entry))!.entries;
            const index = peers.indexOf(entry);
            const palette = source.headingBox ? palettes[boxKey(source.headingBox)] : undefined;
            return <Box component="section" key={section.id} aria-label={section.text} data-picture-section={section.id} sx={{ position: 'absolute', left: `${source.box[1] / 10}%`, top: `${headingTop / layout.height * 100}%`, width: `${(source.box[3] - source.box[1]) / 10}%`, height: `${unitHeight / layout.height * 100}%`, outline: drop.section === section.id ? '2px dashed #0aa4a7' : 'none', opacity: dragging === section.id ? .5 : 1 }}>
                {(source.templateOnly || section.text !== source.originalText) && <Box data-picture-heading sx={{ position: 'absolute', left: source.headingBox ? `${(source.headingBox[1] - source.box[1]) / (source.box[3] - source.box[1]) * 100}%` : 0, top: source.headingBox ? `${(source.headingBox[0] + shift - headingTop) / unitHeight * 100}%` : 0, width: source.headingBox ? `${(source.headingBox[3] - source.headingBox[1]) / (source.box[3] - source.box[1]) * 100}%` : '100%', height: source.headingBox ? `${(source.headingBox[2] - source.headingBox[0]) / unitHeight * 100}%` : `${row * 1.6 / unitHeight * 100}%`, bgcolor: section.headingStyle?.backgroundColor || palette?.background || design.backgroundColor, color: section.headingStyle?.color || palette?.text || design.accentColor, display: 'flex', alignItems: 'center', justifyContent: section.headingStyle ? section.headingStyle.align === 'center' ? 'center' : section.headingStyle.align === 'right' ? 'flex-end' : 'flex-start' : palette?.boxed ? 'center' : 'flex-start', fontFamily: 'Arial, sans-serif', fontSize: source.headingBox ? `${(source.headingBox[2] - source.headingBox[0]) / aspect * .72 / 10}cqw` : `${font * 1.6}cqw`, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>{section.text}</Box>}
                {section.sectionImage && <Box component="img" data-section-image={section.id} src={sectionImageUrl(section.sectionImage.url)} referrerPolicy="no-referrer" alt={section.sectionImage.alt} sx={{ position: 'absolute', left: 0, top: `${(top - headingTop) / unitHeight * 100}%`, width: '100%', height: `${entry.photoHeight / unitHeight * 100}%`, objectFit: 'cover', borderRadius: 1 }} />}
                {(edited || onMoveItem) && <Box sx={{ position: 'absolute', left: 0, top: `${(top + entry.photoHeight - headingTop) / unitHeight * 100}%`, width: '100%', color: design.textColor, fontSize: `${font}cqw`, lineHeight: 1.2 }}>
                    {items.map(product => <Box key={product.id} data-picture-item={product.id} data-picture-row={product.id} aria-label={product.name} sx={{ position: 'relative', height: `${row / aspect / 10}cqw`, display: 'flex', alignItems: 'center', opacity: dragging === product.id ? .45 : 1, outline: drop.item === product.id ? '2px dashed #0aa4a7' : 'none', '& > div': { width: '100%', minHeight: '0 !important', height: '100%' }, '& > div > .MuiIconButton-root': { width: `${row / aspect / 10}cqw`, height: `${row / aspect / 10}cqw`, maxWidth: 30, maxHeight: 30 }, '& .MuiTypography-root': { fontSize: `${font}cqw !important`, lineHeight: '1.2 !important' }, '& .picture-row-menu': { opacity: 0 }, '&:hover .picture-row-menu, &:focus-within .picture-row-menu': { opacity: 1 }, '& .MuiBox-root': { borderRadius: 0, border: 0, py: '0 !important' } }}>
                        {edited && (renderProduct && !orderBelow ? renderProduct(product) : <Stack direction="row" justifyContent="space-between" gap={1} width="100%"><Typography title={product.name} sx={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.name}</Typography><Typography sx={{ flexShrink: 0 }}>{source.pricePrefix}{menuItemPrice(product)}</Typography></Stack>)}
                        {onMoveItem && <IconButton size="small" disabled={disabled} aria-label={`Drag item ${product.name}`} {...gripProps('item', product.id, section.id)} sx={{ position: 'absolute', left: -22, top: 0, width: 20, height: '100%', color: design.textColor, opacity: .5, cursor: 'grab', touchAction: 'none', p: .2, '@media print': { display: 'none' } }}><GripVertical size={13} /></IconButton>}
                        {onItemMenu && <IconButton className="picture-row-menu" size="small" disabled={disabled} aria-label={`Options for ${product.name}`} onClick={event => onItemMenu(event.currentTarget, section, product)} sx={{ position: 'absolute', right: -24, top: 0, width: 22, height: '100%', color: design.textColor, p: .2, '@media print': { display: 'none' } }}><MoreHorizontal size={15} /></IconButton>}
                    </Box>)}
                </Box>}
                {onAddItem && <Stack direction="row" spacing={.5} sx={{ position: 'absolute', left: 0, top: `${(top + height + 4 - headingTop) / unitHeight * 100}%`, zIndex: 2, '@media print': { display: 'none' } }}>
                    <Button size="small" variant="contained" startIcon={<Plus size={12} />} disabled={disabled} aria-label={`Add item to ${section.text}`} onClick={() => onAddItem(section.id)} sx={{ minHeight: 22, minWidth: 22, fontSize: 11, px: .75, py: .2, '& .MuiButton-startIcon': { mr: { xs: 0, sm: .5 } } }}><Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Add item</Box></Button>
                    {onEditSection && <Button size="small" variant="contained" disabled={disabled} aria-label={`Edit section ${section.text}`} onClick={() => onEditSection(section.id)} sx={{ minHeight: 22, minWidth: 22, px: .5, py: .2 }}><Pencil size={12} /></Button>}
                    {onMoveSection && <>
                        <Button size="small" variant="contained" disabled={disabled || index === 0} aria-label={`Move section ${section.text} up`} onClick={() => onMoveSection(section.id, peers[index - 1].section.id, false)} sx={{ minHeight: 22, minWidth: 22, px: .5, py: .2 }}><ArrowUp size={12} /></Button>
                        <Button size="small" variant="contained" disabled={disabled || index === peers.length - 1} aria-label={`Move section ${section.text} down`} onClick={() => onMoveSection(section.id, peers[index + 1].section.id, true)} sx={{ minHeight: 22, minWidth: 22, px: .5, py: .2 }}><ArrowDown size={12} /></Button>
                        <Button size="small" variant="contained" disabled={disabled} aria-label={`Drag section ${section.text}`} {...gripProps('section', section.id, section.id)} sx={{ minHeight: 22, minWidth: 22, px: .5, py: .2, cursor: 'grab', touchAction: 'none' }}><GripVertical size={12} /></Button>
                    </>}
                </Stack>}
            </Box>;
        })}
    </Box>{orderBelow && renderProduct && <Stack spacing={2}>{layout.entries.map(entry => <Box component="section" key={entry.section.id}><Typography component="h2" fontWeight={800} sx={{ color: design.accentColor, fontSize: 20, mb: 1 }}>{entry.section.text}</Typography>{entry.items.map(product => <Box key={product.id}>{renderProduct(product)}</Box>)}</Box>)}</Stack>}</Stack>;
}
