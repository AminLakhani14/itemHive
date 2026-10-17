import React from 'react';
import { Alert, Autocomplete, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, FormLabel, IconButton, InputAdornment, MenuItem, Radio, RadioGroup, Stack, TextField, Typography } from '@mui/material';
import { FileUp, RefreshCw, X } from 'lucide-react';
import { isAxiosError } from 'axios';
import api from '../../api/axios';
import { menuItemPrice, type MenuPrices, type MenuProduct } from './menuContent';
import { menuFont, PLAIN_MENU_DESIGN } from './menuTemplates';
import { matchImportedItem, reviewImportedMenu, validateReviewedImport, type ExtractedMenu, type ExtractedMenuStyle, type ImportItem, type ImportSection, type ReviewedMenuImport } from './oldMenuImport';
import PictureSectionMapper from './PictureSectionMapper';

type Props = { products: MenuProduct[]; productPrices: MenuPrices; currentName: string; disabled?: boolean; loading: boolean; productsError: string | null; allowNewItems: boolean; onRetry: () => void; onApply: (menu: ReviewedMenuImport) => Promise<string | undefined> };
const formats = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const readFile = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('This menu file could not be opened. Please choose it again.')); reader.readAsDataURL(file); });
// Preserve a small original exactly; normalize larger uploads for the saved menu payload.
async function savedPicture(file: File, url: string) {
    if (!file.type.startsWith('image/')) return '';
    if (url.length <= 1_100_000) return url;
    const bitmap = await createImageBitmap(file);
    try {
        const canvas = document.createElement('canvas');
        const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        for (const quality of [.85, .65, .45]) { const picture = canvas.toDataURL('image/webp', quality); if (picture.length <= 1_100_000) return picture; }
        throw new Error('This picture is too large to save. Choose a smaller image.');
    } finally { bitmap.close(); }
}

export default function ImportMenuButton({ products, productPrices, currentName, disabled, loading, productsError, allowNewItems, onRetry, onApply }: Props) {
    const [open, setOpen] = React.useState(false);
    const [source, setSource] = React.useState<'file' | 'text'>('file');
    const [file, setFile] = React.useState<File | null>(null);
    const [text, setText] = React.useState('');
    const [preview, setPreview] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [applying, setApplying] = React.useState(false);
    const [error, setError] = React.useState('');
    const [notes, setNotes] = React.useState('');
    const [sections, setSections] = React.useState<ImportSection[]>([]);
    const [name, setName] = React.useState('');
    const [mode, setMode] = React.useState<ReviewedMenuImport['mode']>('replace');
    const [style, setStyle] = React.useState<ExtractedMenuStyle | undefined>();
    const [picture, setPicture] = React.useState('');
    const [pricePrefix, setPricePrefix] = React.useState('');
    const [layout, setLayout] = React.useState<'picture' | 'copy' | 'template'>('template');
    const [listItems, setListItems] = React.useState(true);
    const [tagline, setTagline] = React.useState('');
    const [footer, setFooter] = React.useState('');
    const request = React.useRef<AbortController | null>(null);
    const input = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => () => request.current?.abort(), []);
    React.useEffect(() => {
        if (!file || file.type === 'application/pdf') { setPreview(''); return; }
        const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url);
    }, [file]);
    const close = () => { if (applying) return; request.current?.abort(); request.current = null; setBusy(false); setOpen(false); };
    const chooseFile = (chosen: File | undefined) => {
        if (!chosen) return;
        if (!formats.includes(chosen.type) || chosen.size > 2 * 1024 * 1024 || !chosen.size) { setError('Choose a JPG, PNG, WebP photo or PDF up to 2 MB.'); return; }
        setFile(chosen); setSections([]); setError('');
    };
    const extract = async () => {
        const controller = new AbortController(); request.current = controller; setBusy(true); setError('');
        try {
            const payload = source === 'file' && file ? { file: await readFile(file) } : { text: text.trim() };
            if (controller.signal.aborted) return;
            const { data } = await api.post<ExtractedMenu>('/digital-menus/ai/import', payload, { signal: controller.signal, timeout: 60000 });
            if (request.current !== controller) return;
            const original = file && source === 'file' && 'file' in payload ? await savedPicture(file, payload.file!) : '';
            if (request.current !== controller) return;
            setName(data.name || currentName); setNotes(data.notes); setSections(reviewImportedMenu(data, products, productPrices));
            setStyle(data.style); setPicture(original || data.picture || ''); setPricePrefix(data.pricePrefix ?? ''); setLayout(original || data.picture ? 'picture' : data.style ? 'copy' : 'template'); setListItems(true); setTagline(data.tagline ?? ''); setFooter(data.footer ?? '');
        } catch (err: unknown) {
            if (!controller.signal.aborted && request.current === controller) setError(isAxiosError<{ message?: string }>(err) ? err.response?.data?.message || 'Unable to read the menu. Please try again.' : err instanceof Error ? err.message : 'Unable to read the menu.');
        } finally { if (request.current === controller) { request.current = null; setBusy(false); } }
    };
    const updateSection = (id: string, changes: Partial<ImportSection>) => setSections(value => value.map(section => section.id === id ? { ...section, ...changes } : section));
    const updateItem = (sectionId: string, itemId: string, changes: Partial<ImportItem>) => setSections(value => value.map(section => section.id === sectionId ? { ...section, items: section.items.map(item => item.id === itemId ? { ...item, ...changes } : item) } : section));
    const rematch = () => setSections(value => value.map(section => ({ ...section, items: section.items.map(item => {
        if (item.productId) return item;
        const match = matchImportedItem(item.name, products);
        return match ? { ...item, productId: match.id, price: item.price || String(menuItemPrice(match, productPrices)) } : item;
    }) })));
    const keepPicture = layout === 'picture' && Boolean(picture);
    const copying = mode === 'replace' && layout === 'copy' && Boolean(style);
    const reviewItems = !keepPicture || listItems;
    const validation = sections.length && reviewItems ? validateReviewedImport(sections, products, allowNewItems) || (keepPicture && sections.some(section => section.selected && !section.itemsBox) ? 'Mark the item area for every selected section on the picture.' : '') : '';
    const selected = sections.filter(section => section.selected).flatMap(section => section.items.filter(item => item.selected));
    const unmatched = selected.filter(item => !products.some(product => product.id === item.productId)).length;
    const apply = async () => {
        setApplying(true); setError('');
        const message = await onApply({ name: name.trim(), sections, mode, copyLook: copying, style, tagline, footer, picture, keepPicture, listItems, editPicture: keepPicture && listItems, pricePrefix });
        setApplying(false);
        if (message) setError(message); else { setSections([]); setFile(null); setText(''); setOpen(false); }
    };
    return <>
        <Button variant="outlined" startIcon={<FileUp size={18} />} disabled={disabled} onClick={() => { setError(''); setOpen(true); }}>Upload existing menu</Button>
        <Dialog open={open} onClose={close} fullWidth maxWidth="lg">
            <DialogTitle>Revamp your existing menu</DialogTitle>
            <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
                <Typography color="text.secondary">Upload your old menu or paste its text. AI copies its sections, items, prices, descriptions, photos and look, so you can add, remove or change items before using it.</Typography>
                <Stack direction="row" gap={1}><Button variant={source === 'file' ? 'contained' : 'outlined'} disabled={busy || applying} onClick={() => { setSource('file'); setSections([]); }}>Photo / PDF</Button><Button variant={source === 'text' ? 'contained' : 'outlined'} disabled={busy || applying} onClick={() => { setSource('text'); setSections([]); }}>Paste menu text</Button></Stack>
                {source === 'file' ? <Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Existing menu file" hidden onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ''; }} />
                    <Button variant="outlined" startIcon={<FileUp size={18} />} disabled={busy || applying} onClick={() => input.current?.click()}>{file ? 'Change file' : 'Choose menu file'}</Button>
                    <Typography variant="body2" sx={{ mt: 1 }}>{file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : 'JPG, PNG, WebP or PDF · up to 2 MB'}</Typography>
                    {file?.type === 'application/pdf' && <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Photos inside a PDF are not copied. To copy item photos, upload a JPG, PNG or WebP image of the menu instead.</Typography>}
                    {preview && <Box component="img" src={preview} alt="Original uploaded menu" sx={{ display: 'block', maxWidth: '100%', maxHeight: 180, objectFit: 'contain', mt: 2 }} />}
                </Box> : <TextField label="Old menu text" multiline minRows={5} disabled={busy || applying} value={text} onChange={event => { setText(event.target.value); setSections([]); }} placeholder={'My restaurant\nDrinks\nPepsi 180\nFanta 100'} slotProps={{ htmlInput: { maxLength: 20000 } }} />}
                <Typography variant="body2" color="text.secondary">Google AI reads the uploaded file or pasted text. Only reviewed items are added to your menu.</Typography>
                <Button variant="contained" disabled={busy || applying || (source === 'file' ? !file : text.trim().length < 3)} startIcon={busy ? <CircularProgress color="inherit" size={18} /> : <FileUp size={18} />} onClick={() => void extract()} sx={{ alignSelf: 'start' }}>{busy ? 'Reading your old menu...' : sections.length ? 'Read menu again' : 'Read menu'}</Button>
                {error && <Alert severity="error">{error}</Alert>}
                {sections.length > 0 && <>
                    {notes && <Alert severity="info">{notes}</Alert>}
                    <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}><TextField fullWidth label="Menu name" value={name} onChange={event => setName(event.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} /><TextField fullWidth select label="How to import" value={mode} onChange={event => setMode(event.target.value as ReviewedMenuImport['mode'])}><MenuItem value="replace">Replace current layout</MenuItem><MenuItem value="append">Add as new pages</MenuItem></TextField></Stack>
                    <Alert severity="info">{mode === 'replace' ? 'Applying replaces the current draft’s name, sections, items and prices. Your live menu changes only when published.' : 'The imported sections will be added on new pages after your current menu, using its design.'}</Alert>
                    {(picture || (mode === 'replace' && style)) && <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
                        <FormControl>
                            <FormLabel id="import-layout" sx={{ fontWeight: 700, color: 'text.primary' }}>How should your menu open?</FormLabel>
                            <RadioGroup aria-labelledby="import-layout" value={keepPicture ? 'picture' : copying ? 'copy' : 'template'} onChange={event => setLayout(event.target.value as typeof layout)}>
                                {picture && <FormControlLabel value="picture" control={<Radio />} label={<Box sx={{ py: .75 }}><Typography fontWeight={600}>Edit my original picture</Typography><Typography variant="body2" color="text.secondary">{mode === 'replace' ? 'Page 1' : 'A new page'} keeps your uploaded design. Add items inside its original sections, then add more sections or pages when needed.</Typography></Box>} />}
                                {mode === 'replace' && style && <FormControlLabel value="copy" control={<Radio />} label={<Box sx={{ py: .75 }}><Typography fontWeight={600}>Recreate it as an editable menu</Typography><Typography variant="body2" color="text.secondary">Copies its colours, fonts, section widths, pages and notes into editable sections.</Typography></Box>} />}
                                <FormControlLabel value="template" control={<Radio />} label={<Box sx={{ py: .75 }}><Typography fontWeight={600}>Use my current design</Typography><Typography variant="body2" color="text.secondary">Lists these items using your selected template or current menu design.</Typography></Box>} />
                            </RadioGroup>
                        </FormControl>
                        {keepPicture && <FormControlLabel sx={{ display: 'flex', mt: 1 }} control={<Checkbox checked={listItems} onChange={event => setListItems(event.target.checked)} />} label="Link the sections on this picture so I can add items and customers can order them" />}
                        {copying && style && <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems={{ sm: 'center' }} sx={{ mt: 2 }}>
                            <TextField fullWidth size="small" label="Tagline" value={tagline} onChange={event => setTagline(event.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
                            <TextField fullWidth size="small" label="Footer note" value={footer} onChange={event => setFooter(event.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
                            <Box aria-hidden sx={{ minWidth: 200, p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'divider', bgcolor: style.backgroundColor, color: style.textColor, textAlign: style.titleAlign, fontFamily: menuFont({ ...PLAIN_MENU_DESIGN, fontStyle: style.fontStyle }) }}><Typography fontWeight={800} sx={{ fontFamily: 'inherit' }}>{name || 'Your menu'}</Typography><Typography variant="body2" fontWeight={700} sx={{ color: style.accentColor, fontFamily: 'inherit' }}>{sections[0].name}</Typography></Box>
                        </Stack>}
                    </Box>}
                    {keepPicture && listItems && <PictureSectionMapper picture={picture} sections={sections} onChange={(id, itemsBox) => updateSection(id, { itemsBox })} />}
                    {reviewItems ? <>
                    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}><Typography sx={{ flex: 1 }}>{selected.length} selected items · {allowNewItems ? `${selected.length - unmatched} linked to inventory · ${unmatched} new` : `${unmatched} need inventory matching`}</Typography><Button startIcon={<RefreshCw size={16} />} disabled={loading || applying} onClick={onRetry}>Refresh inventory</Button><Button disabled={loading || applying} onClick={rematch}>Match by name</Button>{!allowNewItems && <Button component="a" href="/inventory/add" target="_blank" rel="noopener noreferrer">Add missing items to inventory</Button>}</Stack>
                    {unmatched > 0 && <Alert severity={allowNewItems ? 'info' : 'warning'}>{allowNewItems ? `${unmatched} ${unmatched === 1 ? 'item is' : 'items are'} not in your inventory yet and will be added as new inventory items with their photo, description and price, using the section as category. Their stock and cost start at 0, so update them in Inventory before selling. To use an existing item instead, choose it in the row.` : 'Only admins with Import Products access can add new inventory items. Match these items to inventory or untick them.'}</Alert>}
                    {productsError && <Alert severity="error">{productsError}</Alert>}
                    {sections.map(section => <Box key={section.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
                        <Stack direction="row" gap={1} alignItems="center"><Checkbox checked={section.selected} inputProps={{ 'aria-label': `Import section ${section.name}` }} onChange={event => updateSection(section.id, { selected: event.target.checked })} /><TextField fullWidth label="Section heading" size="small" value={section.name} slotProps={{ htmlInput: { maxLength: 160 } }} onChange={event => updateSection(section.id, { name: event.target.value })} /><TextField label="Page" size="small" type="number" value={section.page} sx={{ width: 105, flexShrink: 0 }} slotProps={{ htmlInput: { min: 1, max: 20 } }} onChange={event => updateSection(section.id, { page: Number(event.target.value) })} /></Stack>
                        {section.items.map(item => {
                            const off = !section.selected || !item.selected;
                            const isNew = allowNewItems && !item.productId;
                            return <Stack key={item.id} direction={{ xs: 'column', md: 'row' }} gap={1} sx={{ py: 1.5, borderBottom: 1, borderColor: 'divider', opacity: section.selected ? 1 : .55 }} alignItems={{ md: 'start' }}>
                                <Stack direction="row" gap={1} alignItems="start" sx={{ flex: 1.3, minWidth: 0 }}>
                                    <Checkbox checked={item.selected} disabled={!section.selected} inputProps={{ 'aria-label': `Import ${item.name}` }} onChange={event => updateItem(section.id, item.id, { selected: event.target.checked })} />
                                    {item.image && <Box sx={{ position: 'relative', flexShrink: 0, mt: .5 }}><Box component="img" src={item.image} alt={`${item.name} photo from your old menu`} sx={{ display: 'block', width: 56, height: 56, objectFit: 'cover', borderRadius: 1.5 }} />{isNew && <IconButton size="small" aria-label={`Remove photo of ${item.name}`} disabled={off} onClick={() => updateItem(section.id, item.id, { image: '' })} sx={{ position: 'absolute', top: -8, right: -8, p: .25, bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'background.paper' } }}><X size={14} /></IconButton>}</Box>}
                                    {isNew ? <Stack gap={1} sx={{ flex: 1, minWidth: 0 }}>
                                        <TextField size="small" label="Item name" value={item.name} disabled={off} error={!off && !item.name.trim()} onChange={event => updateItem(section.id, item.id, { name: event.target.value })} slotProps={{ htmlInput: { maxLength: 160 } }} />
                                        <TextField size="small" label="Description" multiline maxRows={3} value={item.description} disabled={off} onChange={event => updateItem(section.id, item.id, { description: event.target.value })} slotProps={{ htmlInput: { maxLength: 500 } }} />
                                    </Stack> : <Box sx={{ flex: 1, minWidth: 0, pt: 1 }}><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{item.name}</Typography>{item.description && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{item.description}</Typography>}</Box>}
                                </Stack>
                                <Autocomplete sx={{ flex: 1, minWidth: 200 }} size="small" options={products} loading={loading} value={products.find(product => product.id === item.productId) ?? null} getOptionLabel={product => product.name} isOptionEqualToValue={(a, b) => a.id === b.id} disabled={off || applying} onChange={(_, product) => updateItem(section.id, item.id, { productId: product?.id ?? '', price: item.price || (product ? String(menuItemPrice(product, productPrices)) : '') })} renderInput={params => <TextField {...params} label={`Inventory item for ${item.name}`} placeholder={allowNewItems ? 'New inventory item' : undefined} error={!allowNewItems && !off && !item.productId} helperText={!item.productId ? allowNewItems ? 'Not in inventory yet. It will be added as a new item.' : 'Choose a matching inventory item or untick this row' : undefined} />} />
                                <TextField label="Menu price" size="small" type="number" value={item.price} disabled={off} sx={{ width: { xs: '100%', md: 185 } }} onChange={event => updateItem(section.id, item.id, { price: event.target.value })} slotProps={{ input: { startAdornment: <InputAdornment position="start">Rs.</InputAdornment> }, htmlInput: { min: 0, step: .01, 'aria-label': `Menu price for ${item.name}` } }} helperText={item.priceMissing ? 'Old price unclear — please confirm' : undefined} />
                            </Stack>;
                        })}
                    </Box>)}
                    {validation && <Alert severity="warning">{validation}</Alert>}
                    </> : <Alert severity="info">Only your picture is added. Add items with “Add item”, or open the AI menu assistant to suggest sections. It takes inspiration from your picture.</Alert>}
                    <Typography variant="body2" color="text.secondary">{copying ? 'You can change the design, drag headings and sections, and edit every item and price afterward.' : keepPicture ? 'Your original artwork opens in the editor. Use each section’s Add item button to extend its list, or add new sections and pages.' : 'Imported sections use your selected template’s styling. You can change the design, drag headings and sections, and edit every menu price afterward.'}</Typography>
                </>}
            </Stack></DialogContent>
            <DialogActions><Button disabled={applying} onClick={close}>Cancel</Button><Button variant="contained" disabled={busy || applying || loading || Boolean(productsError) || !sections.length || Boolean(validation)} startIcon={applying ? <CircularProgress color="inherit" size={18} /> : undefined} onClick={() => void apply()}>{applying ? 'Adding to your menu...' : mode === 'replace' ? 'Use reviewed menu' : 'Add reviewed pages'}</Button></DialogActions>
        </Dialog>
    </>;
}
