import React from 'react';
import { Alert, Autocomplete, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { Sparkles } from 'lucide-react';
import { isAxiosError } from 'axios';
import api from '../../api/axios';
import { menuItemPrice, newMenuBlock, type MenuPrices, type MenuProduct } from './menuContent';
import { assertCompleteAIMenuStyle, buildMenuAIRequest, MENU_INSPIRATION_UNAVAILABLE, MENU_STYLE_INCOMPLETE, MENU_STYLE_UNAVAILABLE, MENU_STYLE_KEYS, menuAIStyleKeys, type AIMenuSuggestion, type MenuBrand, type MenuStyle, type MenuStyleKey } from './aiMenu';
import { type MenuDesign } from './menuTemplates';
import MenuStyleEditor from './MenuStyleEditor';
import MenuSheet from './MenuSheet';
import { MenuPageContent } from './MenuPageContent';
import { sectionImageUrl, sectionPhoto, type SectionImage } from './sectionImages';
import SectionImagePicker from './SectionImagePicker';

type SectionReview = AIMenuSuggestion['sections'][number] & { selected: boolean; useImage: boolean };
type DealReview = Omit<AIMenuSuggestion['deals'][number], 'dealPrice'> & { selected: boolean; price: string };
type Props = {
    products: MenuProduct[]; productPrices: MenuPrices; name: string; existingSections: string[];
    disabled?: boolean; loading: boolean; productsError: string | null; onRetry: () => void;
    onApply: (suggestions: AIMenuSuggestion) => string | undefined;
    design: MenuDesign; brand: MenuBrand;
    /** A picture of the merchant's old menu for the AI to take inspiration from. */
    inspiration?: string;
    existingSectionImages?: Record<string, SectionImage>;
};

export default function AIMenuAssistant({ products, productPrices, name, existingSections, disabled, loading, productsError, onRetry, onApply, design, brand, inspiration, existingSectionImages = {} }: Props) {
    const [open, setOpen] = React.useState(false);
    const [inventoryIds, setInventoryIds] = React.useState<string[]>([]);
    const [brief, setBrief] = React.useState('');
    const [includeDeals, setIncludeDeals] = React.useState(false);
    const [includeSectionImages, setIncludeSectionImages] = React.useState(true);
    const [imageReviewIndex, setImageReviewIndex] = React.useState<number | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState('');
    const [summary, setSummary] = React.useState('');
    const [sections, setSections] = React.useState<SectionReview[]>([]);
    const [deals, setDeals] = React.useState<DealReview[]>([]);
    const [hasResults, setHasResults] = React.useState(false);
    const [includeStyle, setIncludeStyle] = React.useState(true);
    const [restaurantTheme, setRestaurantTheme] = React.useState(brand.theme);
    const [logo, setLogo] = React.useState(brand.logo);
    const [style, setStyle] = React.useState<MenuStyle | null>(null);
    const [styleReason, setStyleReason] = React.useState('');
    const [styleKeys, setStyleKeys] = React.useState<MenuStyleKey[]>([...MENU_STYLE_KEYS]);
    const [styleUnavailable, setStyleUnavailable] = React.useState(false);
    const [useInspiration, setUseInspiration] = React.useState(true);
    const [inspirationUnavailable, setInspirationUnavailable] = React.useState(false);
    const [copyReview, setCopyReview] = React.useState<{ menuName: string; useName: boolean; headings: Array<{ type: 'heading' | 'label'; text: string; selected: boolean }> }>({ menuName: '', useName: false, headings: [] });
    const custom = design.templateId === 'custom';
    const allowedStyleKeys = menuAIStyleKeys(design);
    const request = React.useRef<AbortController | null>(null);
    React.useEffect(() => () => { request.current?.abort(); }, []);
    const close = () => { request.current?.abort(); request.current = null; setBusy(false); setOpen(false); };
    const start = () => {
        setInventoryIds(products.slice(0, 200).map(product => product.id)); setIncludeSectionImages(true); setImageReviewIndex(null);
        setError(''); setHasResults(false); setSections([]); setDeals([]); setSummary(''); setStyle(null); setStyleUnavailable(false); setUseInspiration(true); setInspirationUnavailable(false);
        setCopyReview({ menuName: '', useName: false, headings: [] }); setIncludeStyle(true); setRestaurantTheme(brand.theme); setLogo(brand.logo); setStyleKeys(allowedStyleKeys); setOpen(true);
    };
    const generate = async (withStyle = custom || includeStyle, withInspiration = useInspiration && Boolean(inspiration)) => {
        const controller = new AbortController();
        request.current = controller;
        setBusy(true); setError(''); setHasResults(false); setStyleUnavailable(false); setInspirationUnavailable(false);
        try {
            if (withStyle || withInspiration || includeSectionImages) {
                let features: string[] = [];
                try {
                    const { data } = await api.get<{ features?: string[] }>('/digital-menus/ai/capabilities', { signal: controller.signal, timeout: 15000 });
                    features = data.features ?? [];
                } catch (err) {
                    if (!isAxiosError(err) || err.response?.status !== 404) throw err;
                }
                if (request.current !== controller) return;
                if (withStyle && !features.includes(custom ? 'custom-menu-copy' : 'template-menu-style')) { setStyleUnavailable(true); setError(MENU_STYLE_UNAVAILABLE); return; }
                if (withInspiration && !features.includes('menu-inspiration')) { setInspirationUnavailable(true); setError(MENU_INSPIRATION_UNAVAILABLE); return; }
                if (includeSectionImages && !features.includes('section-images')) { setError('The connected backend needs the section image update. You can uncheck Suggest section images to generate the rest.'); return; }
            }
            const payload = buildMenuAIRequest({ productIds: inventoryIds, menuName: name, brief, includeDeals, ...(includeSectionImages ? { includeSectionImages: true } : {}), existingSections, productPrices }, withStyle ? { currentDesign: design, brand: custom ? { ...brand, theme: restaurantTheme.trim(), logo } : { name: brand.name, theme: '', logo: '', colors: [] } } : undefined, withInspiration ? inspiration : undefined);
            const { data } = await api.post<AIMenuSuggestion>('/digital-menus/ai/suggest', payload, { signal: controller.signal, timeout: 60000 });
            if (request.current !== controller) return;
            if (withStyle) assertCompleteAIMenuStyle(data.style, design);
            setSummary(data.summary);
            setSections(data.sections.map(section => { const photo = includeSectionImages ? sectionPhoto(section.imageKey) : undefined; return { ...section, selected: true, sectionImage: photo, useImage: Boolean(photo) && !existingSectionImages[section.name.trim().toLowerCase()] }; }));
            setDeals(data.deals.map(deal => ({ ...deal, selected: true, price: String(deal.dealPrice) })));
            setStyle(data.style ? { ...design, ...data.style } : null);
            setStyleReason(data.style?.reason ?? ''); setStyleKeys(allowedStyleKeys);
            setCopyReview({ menuName: data.menuName ?? '', useName: custom && !name.trim() && !!data.menuName, headings: (custom ? data.headings ?? [] : []).map(heading => ({ ...heading, selected: true })) });
            setHasResults(true);
        } catch (err: unknown) {
            if (controller.signal.aborted || request.current !== controller) return;
            setError(isAxiosError<{ message?: string }>(err) ? err.response?.data?.message || 'Unable to reach the AI assistant. Please try again.' : err instanceof Error && err.message === MENU_STYLE_INCOMPLETE ? err.message : 'Unable to generate menu suggestions.');
        } finally {
            if (request.current === controller) { request.current = null; setBusy(false); }
        }
    };
    const reviewedSections = sections.filter(section => section.selected && section.productIds.length);
    const reviewedDeals = includeDeals ? deals.filter(deal => deal.selected) : [];
    const previewSections = reviewedSections.slice(0, 2);
    const previewProducts = products.filter(product => previewSections.flatMap(section => section.productIds.slice(0, 3)).includes(product.id)).map(product => ({ ...product, salePrice: menuItemPrice(product, productPrices) }));
    const reviewedStyle = includeStyle && style ? Object.fromEntries(styleKeys.filter(key => allowedStyleKeys.includes(key)).map(key => [key, style[key]])) as Partial<MenuStyle> : undefined;
    const previewDesign = { ...design, ...reviewedStyle };
    const previewContent = [
        { ...newMenuBlock('title', previewDesign.textColor, custom && copyReview.useName ? copyReview.menuName : name || brand.name || 'Your menu'), id: 'preview-title', fontSize: 32 },
        ...(custom && includeStyle ? copyReview.headings.filter(heading => heading.selected).map((heading, index) => ({ ...newMenuBlock(heading.type, heading.type === 'heading' ? previewDesign.accentColor : previewDesign.textColor, heading.text), id: `preview-heading-${index}`, fontSize: heading.type === 'heading' ? 24 : 14 })) : []),
        ...previewSections.map((section, index) => ({ ...newMenuBlock('section', previewDesign.accentColor, section.name), id: `preview-${index}`, fontSize: 22, span: (6 / (previewDesign.sectionColumns ?? 1)) as 2 | 3 | 6, sectionImage: section.useImage ? section.sectionImage : existingSectionImages[section.name.trim().toLowerCase()], productIds: section.productIds.slice(0, 3) })),
    ];
    const uploadLogo = async (file?: File) => {
        if (!file) return;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) { setError('Choose a PNG, JPEG or WebP logo up to 1 MB.'); return; }
        try {
            const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Unable to read logo')); reader.readAsDataURL(file); });
            setLogo(data); setHasResults(false); setError('');
        } catch { setError('Unable to read this logo. Please try another image.'); }
    };
    const reviewedHeadings = custom && includeStyle ? copyReview.headings.filter(heading => heading.selected) : [];
    const reviewedName = custom && includeStyle && copyReview.useName ? copyReview.menuName.trim() : undefined;
    const hasCopy = reviewedName !== undefined || reviewedHeadings.length > 0;
    const invalid = (reviewedName !== undefined && !reviewedName) || reviewedHeadings.some(heading => !heading.text.trim()) || reviewedSections.some(section => !section.name.trim()) || reviewedDeals.some(deal => !deal.name.trim() || !deal.price.trim() || !Number.isFinite(Number(deal.price) * 100) || Number(deal.price) < 0);
    const apply = () => {
        const result = onApply({ summary, ...(reviewedName !== undefined ? { menuName: reviewedName } : {}), ...(reviewedHeadings.length ? { headings: reviewedHeadings.map(({ type, text }) => ({ type, text: text.trim() })) } : {}), sections: reviewedSections.map(({ name, reason, productIds, sectionImage, useImage }) => ({ name: name.trim(), reason, productIds, ...(useImage && sectionImage ? { sectionImage } : {}) })), deals: reviewedDeals.map(({ name, reason, productIds, price, regularPrice }) => ({ name: name.trim(), reason, productIds, dealPrice: Math.round(Number(price) * 100) / 100, regularPrice })), ...(reviewedStyle && styleKeys.length ? { style: { ...reviewedStyle, reason: styleReason } } : {}) });
        if (result) setError(result); else close();
    };
    return <>
        <Button variant="outlined" startIcon={<Sparkles size={18} />} onClick={start} disabled={disabled || loading}>AI menu assistant</Button>
        <Dialog open={open} onClose={close} fullWidth maxWidth="md">
            <DialogTitle>Build your menu with AI</DialogTitle>
            <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
                <Typography variant="body2" color="text.secondary">Choose inventory items. AI will suggest sections, optional deals, and a modern design{custom ? ' with colors, fonts, a menu name and headings based on your restaurant theme and logo' : ' using your selected template colors'} for you to review. Your instructions come first. Everything stays editable.</Typography>
                {productsError && <Alert severity="error" action={<Button onClick={onRetry}>Retry</Button>}>{productsError}</Alert>}
                <Autocomplete multiple disableCloseOnSelect limitTags={2} options={products} value={products.filter(product => inventoryIds.includes(product.id))} isOptionEqualToValue={(a, b) => a.id === b.id} getOptionLabel={product => product.name} disabled={busy} onChange={(_, selected) => { setInventoryIds(selected.map(product => product.id)); setHasResults(false); }} renderOption={(props, option, { selected }) => { const { key, ...rest } = props; return <li key={key} {...rest}><Checkbox checked={selected} sx={{ mr: 1 }} />{option.name}</li>; }} renderInput={params => <TextField {...params} label="Inventory for this menu" helperText={`${inventoryIds.length} selected · maximum 200`} error={inventoryIds.length > 200} />} />
                <Stack direction="row" spacing={1}><Button size="small" disabled={busy} onClick={() => { setInventoryIds(products.slice(0, 200).map(product => product.id)); setHasResults(false); }}>Select {products.length > 200 ? 'first 200' : 'all'}</Button><Button size="small" disabled={busy} onClick={() => { setInventoryIds([]); setHasResults(false); }}>Clear selection</Button></Stack>
                <TextField label="Tell AI about your menu" placeholder={custom ? 'For example: a modern pizza menu with rounded cards, warm colors and bold headings' : 'For example: fancy rounded cards, two columns and bold modern headings'} helperText={custom ? "Your requests take priority over the logo colors and AI's suggestions." : 'Your requests guide the layout, fonts and decorations. Template colors stay unchanged.'} multiline minRows={2} value={brief} disabled={busy} onChange={event => { setBrief(event.target.value); setHasResults(false); }} slotProps={{ htmlInput: { maxLength: 1000 } }} />
                {inspiration && <Stack direction="row" gap={2} alignItems="center" sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                    <Box component="img" src={inspiration} alt="Your old menu" sx={{ width: 64, height: 80, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }} />
                    <Box><FormControlLabel control={<Checkbox checked={useInspiration} disabled={busy} onChange={event => { setUseInspiration(event.target.checked); setHasResults(false); }} />} label="Take inspiration from my old menu" /><Typography variant="body2" color="text.secondary">AI follows its sections, item order, look and photos, and tells you which of its items are missing from your inventory.</Typography></Box>
                </Stack>}
                {<>
                    {custom ? <Alert severity="info">AI will suggest background, text and heading colors, fonts, layout, decorations, a menu name and headings. {restaurantTheme.trim() || logo || brand.colors.length ? 'Your available branding guides the design wherever you have not given other instructions.' : 'No theme or logo is set, so AI will choose a complete modern design for your inventory.'} Review and change every suggestion before applying.</Alert> : <FormControlLabel control={<Checkbox checked={includeStyle} disabled={busy} onChange={event => { setIncludeStyle(event.target.checked); setHasResults(false); }} />} label="Suggest a fancy, modern design (keep template colors)" />}
                    {!custom && <Alert severity="info">Your selected template colors stay unchanged. AI can suggest modern layouts, fonts and decorations.</Alert>}
                    {custom && includeStyle && <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}><Stack spacing={1.5}>
                        <TextField label="Restaurant theme (optional)" helperText="Leave this empty to let AI choose a theme. Your menu instructions take priority." placeholder="For example: cozy Italian cafe, rustic wood and warm lighting" value={restaurantTheme} disabled={busy} onChange={event => { setRestaurantTheme(event.target.value); setHasResults(false); }} slotProps={{ htmlInput: { maxLength: 500 } }} />
                        <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
                            {logo && <Box component="img" src={logo} alt="Restaurant logo for suggestions" sx={{ width: 100, height: 60, objectFit: 'contain', bgcolor: '#fff', borderRadius: 1 }} />}
                            <Button component="label" variant="outlined" size="small" disabled={busy}>{logo ? 'Replace logo' : 'Add restaurant logo'}<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void uploadLogo(event.target.files?.[0]); event.target.value = ''; }} /></Button>
                            {logo && <Button size="small" disabled={busy} onClick={() => { setLogo(''); setHasResults(false); }}>Remove logo</Button>}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">A logo is optional. Google AI uses your saved branding when available and suggests a full design without it. PNG, JPEG or WebP up to 1 MB. This logo is used for suggestions only.</Typography>
                    </Stack></Box>}
                </>}
                <FormControlLabel control={<Checkbox checked={includeDeals} disabled={busy} onChange={event => { setIncludeDeals(event.target.checked); setHasResults(false); }} />} label="Suggest deals / combos" />
                <FormControlLabel control={<Checkbox checked={includeSectionImages} disabled={busy} onChange={event => { setIncludeSectionImages(event.target.checked); setHasResults(false); }} />} label="Suggest section images" />
                <Button variant="contained" startIcon={busy ? <CircularProgress size={17} color="inherit" /> : <Sparkles size={18} />} disabled={busy || loading || Boolean(productsError) || !inventoryIds.length || inventoryIds.length > 200} onClick={() => void generate()} sx={{ alignSelf: 'start' }}>{busy ? 'Analyzing your inventory...' : hasResults ? 'Generate again' : 'Generate suggestions'}</Button>
                {error && <Alert severity="error">{error}</Alert>}
                {inspirationUnavailable && <Button variant="outlined" disabled={busy || !inventoryIds.length || inventoryIds.length > 200} onClick={() => { setUseInspiration(false); void generate(includeStyle, false); }} sx={{ alignSelf: 'start' }}>Generate without my old menu</Button>}
                {styleUnavailable && !custom && <Button variant="outlined" disabled={busy || !inventoryIds.length || inventoryIds.length > 200} onClick={() => { setIncludeStyle(false); void generate(false); }} sx={{ alignSelf: 'start' }}>Generate sections & deals only</Button>}
                {hasResults && <>
                    <Alert severity="info">{summary}</Alert>
                    {includeStyle && style && <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}><Stack spacing={2}>
                        <Typography component="h3" variant="h6">Suggested menu style</Typography>
                        <Typography variant="body2" color="text.secondary">{styleReason} Edit any suggestion or uncheck it to keep your current setting.</Typography>
                        <MenuStyleEditor allowedKeys={allowedStyleKeys} value={style} onChange={patch => setStyle(current => current ? { ...current, ...patch } : null)} selectedKeys={styleKeys} onSelect={(key, selected) => setStyleKeys(value => selected ? [...new Set([...value, key])] : value.filter(item => item !== key))} />
                        <MenuSheet design={previewDesign}><MenuPageContent content={previewContent} products={previewProducts} design={previewDesign} page={1} /></MenuSheet>
                        <Typography variant="caption" color="text.secondary">Uncheck Section columns to keep your current widths. Your page order, item prices and individually edited heading colors are kept. You can change the style again in your menu editor.</Typography>
                    </Stack></Box>}
                    {custom && includeStyle && (copyReview.menuName || copyReview.headings.length > 0) && <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}><Stack spacing={1.5}>
                        <Typography component="h3" variant="h6">Suggested menu name & headings</Typography>
                        {copyReview.menuName && <Stack direction="row" alignItems="center" gap={1}><Checkbox checked={copyReview.useName} inputProps={{ 'aria-label': 'Apply suggested menu name' }} onChange={event => setCopyReview(current => ({ ...current, useName: event.target.checked }))} /><TextField fullWidth label="Suggested menu name" value={copyReview.menuName} disabled={!copyReview.useName} size="small" helperText={name.trim() ? 'Your current name is kept unless you select this suggestion.' : 'Edit the name before applying.'} slotProps={{ htmlInput: { maxLength: 100 } }} onChange={event => setCopyReview(current => ({ ...current, menuName: event.target.value }))} /></Stack>}
                        {copyReview.headings.map((heading, index) => <Stack key={index} direction="row" alignItems="center" gap={1}><Checkbox checked={heading.selected} inputProps={{ 'aria-label': `Apply suggested ${heading.type} ${index + 1}` }} onChange={event => setCopyReview(current => ({ ...current, headings: current.headings.map((item, i) => i === index ? { ...item, selected: event.target.checked } : item) }))} /><TextField fullWidth label={heading.type === 'heading' ? 'Menu heading' : 'Menu tagline'} value={heading.text} disabled={!heading.selected} size="small" slotProps={{ htmlInput: { maxLength: heading.type === 'heading' ? 160 : 500 } }} onChange={event => setCopyReview(current => ({ ...current, headings: current.headings.map((item, i) => i === index ? { ...item, text: event.target.value } : item) }))} /></Stack>)}
                    </Stack></Box>}
                    <Typography component="h3" variant="h6">Suggested sections</Typography>
                    {!sections.length && <Typography>No suitable sections found. Choose different inventory items or update your instructions.</Typography>}
                    {sections.map((section, index) => <Box key={index} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
                        <Stack direction="row" alignItems="center" spacing={1}><Checkbox checked={section.selected} inputProps={{ 'aria-label': `Include section ${section.name}` }} onChange={event => setSections(value => value.map((item, i) => i === index ? { ...item, selected: event.target.checked } : item))} /><TextField fullWidth size="small" label="Section name" value={section.name} slotProps={{ htmlInput: { maxLength: 160 } }} onChange={event => setSections(value => value.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{section.reason}</Typography>
                        {section.sectionImage && <Stack spacing={1} sx={{ mt: 1.5 }}><Box component="img" src={sectionImageUrl(section.sectionImage.url)} referrerPolicy="no-referrer" alt={section.sectionImage.alt} sx={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 2 }} /><FormControlLabel control={<Checkbox checked={section.useImage} onChange={event => setSections(value => value.map((item, i) => i === index ? { ...item, useImage: event.target.checked } : item))} />} label={`Apply suggested image for ${section.name}`} /><Typography variant="caption" color="text.secondary">Web photo selected by AI. {existingSectionImages[section.name.trim().toLowerCase()] ? 'Your current section photo is kept unless you accept this replacement.' : 'You can replace it with your own food photo.'}</Typography></Stack>}
                        <Button size="small" onClick={() => setImageReviewIndex(index)}>{section.sectionImage ? 'Change suggested image' : 'Add section image'}</Button>
                        {section.productIds.map(id => { const product = products.find(item => item.id === id); return <Stack key={id} direction="row" justifyContent="space-between" gap={2} sx={{ py: .5, borderBottom: 1, borderColor: 'divider' }}><Typography variant="body2">{product?.name || id}</Typography><Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>Rs. {product ? menuItemPrice(product, productPrices).toLocaleString() : '—'}</Typography></Stack>; })}
                    </Box>)}
                    {includeDeals && <><Typography component="h3" variant="h6">Suggested deals / combos</Typography>{!deals.length && <Typography>No suitable combos found in this inventory.</Typography>}{deals.map((deal, index) => <Box key={index} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}><Checkbox checked={deal.selected} inputProps={{ 'aria-label': `Include combo ${deal.name}` }} onChange={event => setDeals(value => value.map((item, i) => i === index ? { ...item, selected: event.target.checked } : item))} /><TextField fullWidth label="Combo name" size="small" value={deal.name} slotProps={{ htmlInput: { maxLength: 100 } }} onChange={event => setDeals(value => value.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /><TextField label="Combo price" size="small" type="number" value={deal.price} sx={{ minWidth: 160 }} slotProps={{ input: { startAdornment: <InputAdornment position="start">Rs.</InputAdornment> }, htmlInput: { min: 0, step: .01 } }} onChange={event => setDeals(value => value.map((item, i) => i === index ? { ...item, price: event.target.value } : item))} /></Stack>
                        <Typography variant="body2" sx={{ mt: 1 }}>{deal.productIds.map(id => products.find(product => product.id === id)?.name || id).join(' + ')}</Typography><Typography variant="body2" color="text.secondary">Separately: Rs. {deal.regularPrice.toLocaleString()} · {deal.reason}</Typography>
                    </Box>)}</>}
                    <Typography variant="body2" color="text.secondary">Applying adds items to matching sections and creates sections or pages where needed. Your headings and styling stay editable. Deals save with your draft; publishing makes them available to customers.</Typography>
                </>}
            </Stack></DialogContent>
            <DialogActions><Button onClick={close}>Cancel</Button><Button variant="contained" disabled={busy || !hasResults || invalid || (!reviewedSections.length && !reviewedDeals.length && !hasCopy && !(reviewedStyle && styleKeys.length))} onClick={apply}>Apply selected suggestions</Button></DialogActions>
        </Dialog>
        <SectionImagePicker key={imageReviewIndex ?? "closed"} open={imageReviewIndex !== null} name={imageReviewIndex === null ? '' : sections[imageReviewIndex]?.name ?? ''} image={imageReviewIndex === null ? undefined : sections[imageReviewIndex]?.sectionImage} products={imageReviewIndex === null ? [] : products.filter(product => sections[imageReviewIndex]?.productIds.includes(product.id))} onChange={sectionImage => setSections(value => value.map((item, i) => i === imageReviewIndex ? { ...item, sectionImage, useImage: Boolean(sectionImage) } : item))} onClose={() => setImageReviewIndex(null)} />
    </>;
}
