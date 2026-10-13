import React from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper, Stack, Step, StepLabel, Stepper, Switch, TextField, Typography } from '@mui/material';
import { ArrowLeft, ChevronDown, LayoutTemplate, Save, Send } from 'lucide-react';
import { isAxiosError } from 'axios';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import { fetchProducts, importProductsApi } from '../../features/inventory/inventorySlice';
import { hasScreenAccess } from '../../lib/screenPermissions';
import type { AppDispatch, RootState } from '../../store';
import MenuDesignPicker, { MenuPreview } from './MenuDesignPicker';
import MenuBuilder from './MenuBuilder';
import MenuStatus from './MenuStatus';
import { ensureMenuTitle, menuItemPrice, menuPageCount, type MenuBlock, type MenuPrices } from './menuContent';
import { PLAIN_MENU_DESIGN, MENU_TEMPLATES, getMenuDesign, type MenuDesign } from './menuTemplates';
import { createMenuLayout, MENU_LAYOUTS } from './menuLayouts';
import AIMenuAssistant from './AIMenuAssistant';
import { applyAISections, applyAIMenuStyle, applyAIMenuCopy, applyMenuStyle, getMenuBrand, MENU_STYLE_KEYS, type AIMenuSuggestion, type MenuDeal, type PendingMenuDeal, type MenuStyle } from './aiMenu';
import MenuStyleEditor from './MenuStyleEditor';
import ImportMenuButton from './ImportMenuButton';
import { buildImportedMenu, prepareImportProducts, type ReviewedMenuImport } from './oldMenuImport';

export default function CreateDigitalMenuPage() {
    const dispatch = useDispatch<AppDispatch>();
    const navigate = useNavigate();
    const { id: editingId } = useParams();
    const [savedId, setSavedId] = React.useState(editingId);
    const [published, setPublished] = React.useState(false);
    const [savingAction, setSavingAction] = React.useState<'draft' | 'publish'>('draft');
    const [loadingMenu, setLoadingMenu] = React.useState(Boolean(editingId));
    const [menuLoaded, setMenuLoaded] = React.useState(!editingId);
    const { products, loading, error: productsError } = useSelector((state: RootState) => state.inventory);
    const { app: settings } = useSelector((state: RootState) => state.settings);
    const user = useSelector((state: RootState) => state.auth.user);
    const brand = getMenuBrand(settings, user);
    const [step, setStep] = React.useState(0);
    const [design, setDesign] = React.useState<MenuDesign>({ ...PLAIN_MENU_DESIGN });
    const [name, setName] = React.useState('');
    const [productIds, setProductIds] = React.useState<string[]>([]);
    const [productPrices, setProductPrices] = React.useState<MenuPrices>({});
    const [content, setContent] = React.useState<MenuBlock[]>([]);
    const [pageCount, setPageCount] = React.useState(1);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');
    const [layoutStarted, setLayoutStarted] = React.useState(false);
    const [pendingDesign, setPendingDesign] = React.useState<MenuDesign | null>(null);
    const [pendingDeals, setPendingDeals] = React.useState<PendingMenuDeal[]>([]);
    const [savedDeals, setSavedDeals] = React.useState<MenuDeal[]>([]);
    const [aiNotice, setAiNotice] = React.useState('');
    // The last uploaded menu picture guides the AI assistant even when it is not kept as a page.
    const [referencePicture, setReferencePicture] = React.useState('');

    React.useEffect(() => { void dispatch(fetchProducts(undefined)); }, [dispatch]);
    React.useEffect(() => {
        if (step === 1) setContent(value => ensureMenuTitle(value, name, design.textColor));
    }, [step, name, design.textColor]);

    React.useEffect(() => {
        let cancelled = false;
        if (!editingId) return;
        api.get<Array<{ _id: string; name: string; productIds: string[]; productPrices?: MenuPrices; design?: MenuDesign; content?: MenuBlock[]; pageCount?: number; menuType?: string; sourceMenuId?: string; status?: string; dealPrice?: number; isActive?: boolean }>>('/digital-menus').then(({ data }) => {
            if (cancelled) return;
            const menu = data.find(value => value._id === editingId && value.menuType !== 'deal' && !value.sourceMenuId);
            if (!menu) { setError('This menu is unavailable.'); return; }
            setName(menu.name);
            setSavedDeals(data.filter(item => item.menuType === 'deal' && item.sourceMenuId === editingId && item.isActive !== false).map(item => ({ id: item._id, name: item.name, productIds: item.productIds, dealPrice: item.dealPrice ?? 0 })));
            setPublished(menu.status === 'published');
            setProductIds(menu.productIds);
            setProductPrices(menu.productPrices ?? {});
            setDesign(getMenuDesign(menu.design));
            setContent(menu.content?.length ? ensureMenuTitle(menu.content, menu.name, getMenuDesign(menu.design).textColor) : createMenuLayout(getMenuDesign(menu.design), menu.name, menu.productIds, [], menu.pageCount ?? 1));
            setPageCount(menuPageCount(menu.content || [], menu.pageCount));
            setStep(1);
            setMenuLoaded(true);
            setLayoutStarted(true);
        }).catch((loadError: unknown) => {
            if (!cancelled) setError(isAxiosError<{ message?: string }>(loadError) ? loadError.response?.data?.message || 'Unable to load this menu.' : 'Unable to load this menu.');
        }).finally(() => { if (!cancelled) setLoadingMenu(false); });
        return () => { cancelled = true; };
    }, [editingId]);

    const selectedProducts = products.filter(product => productIds.includes(product.id)).map(product => ({ ...product, salePrice: menuItemPrice(product, productPrices) }));
    const invalidPrices = Object.values(productPrices).some(price => !Number.isFinite(price) || price < 0 || !Number.isFinite(price * 100));
    const invalidDeals = pendingDeals.some(deal => !deal.name.trim() || !Number.isFinite(deal.dealPrice * 100) || deal.dealPrice < 0);
    // The bulk inventory import requires these permissions on the server too.
    const canCreateProducts = user?.role === 'super_admin' || (user?.role === 'admin' && hasScreenAccess(user, 'inventory_import'));
    const applyImport = async (review: ReviewedMenuImport) => {
        try {
            // Build and validate the whole menu before any inventory item is created.
            const prepared = prepareImportProducts(review);
            const result = buildImportedMenu(prepared.review, design, { name, content, productIds, productPrices, pageCount }, [...products, ...prepared.products]);
            if (prepared.products.length) await dispatch(importProductsApi(prepared.products)).unwrap();
            setName(result.name); setDesign(result.design); setContent(result.content); setProductIds(result.productIds); setProductPrices(result.productPrices); setPageCount(result.pageCount);
            setLayoutStarted(true); setStep(1);
            if (review.picture) setReferencePicture(review.picture);
            const added = prepared.products.length;
            const opened = review.keepPicture && review.picture
                ? `Your original menu picture is now ${review.mode === 'replace' ? 'page 1' : `page ${pageCount + 1}`}${review.listItems !== false ? ', with its items listed after it for ordering' : ''}. Add items, sections and pages, or use the AI menu assistant, which takes inspiration from your picture.`
                : 'Your old menu is now an editable draft. Add, remove or rearrange items and change its design and prices before saving or publishing.';
            setAiNotice(`${opened}${added ? ` ${added} new ${added === 1 ? 'item was' : 'items were'} added to Inventory with 0 stock and 0 cost. Update them in Inventory before selling.` : ''}`);
        } catch (err) { return typeof err === 'string' ? err : err instanceof Error ? err.message : 'Unable to import this menu.'; }
    };
    const importButton = <ImportMenuButton products={products} productPrices={productPrices} currentName={name} loading={loading} productsError={productsError} allowNewItems={canCreateProducts} onRetry={() => void dispatch(fetchProducts({ force: true }))} onApply={applyImport} disabled={saving} />;
    const applyAI = (suggestion: AIMenuSuggestion) => {
        try {
            const styled = suggestion.style ? applyAIMenuStyle(content, design, suggestion.style) : { design, content };
            const copy = applyAIMenuCopy(styled.content, styled.design, name, suggestion);
            const result = applyAISections(copy.content, productIds, productPrices, pageCount, suggestion.sections, styled.design, copy.name);
            const signature = (deal: { name: string; productIds: string[] }) => `${deal.name.trim().toLocaleLowerCase()}\u0000${[...deal.productIds].sort().join('\u0000')}`;
            const known = new Set([...savedDeals, ...pendingDeals].map(signature));
            const addedDeals = suggestion.deals.filter(deal => !known.has(signature(deal))).map(deal => ({ id: crypto.randomUUID(), name: deal.name, productIds: deal.productIds, dealPrice: deal.dealPrice, reason: deal.reason }));
            setName(copy.name); setContent(result.content); setDesign(styled.design); setProductIds(result.productIds); setProductPrices(result.productPrices); setPageCount(result.pageCount);
            setPendingDeals(value => [...value, ...addedDeals]);
            setAiNotice(`Applied ${suggestion.sections.length} suggested sections, ${addedDeals.length} deals${suggestion.style ? ', and your selected style changes' : ''} to your draft. Everything stays editable before saving.`);
        } catch (err) { return err instanceof Error ? err.message : 'Unable to apply suggestions.'; }
    };
    const changeStyle = (style: Partial<MenuStyle>) => {
        const result = applyMenuStyle(content, design, style);
        setContent(result.content); setDesign(result.design);
    };
    const changeProducts = (ids: string[]) => {
        setProductIds(ids);
        setProductPrices(value => Object.fromEntries(Object.entries(value).filter(([id]) => ids.includes(id))));
    };
    const applyDesign = (nextDesign: MenuDesign) => {
        setDesign(nextDesign);
        setContent(createMenuLayout(nextDesign, name, productIds, products, pageCount));
        setPendingDesign(null);
    };
    const changeDesign = (nextDesign: MenuDesign) => {
        if (nextDesign.templateId === design.templateId) {
            const changes = Object.fromEntries(MENU_STYLE_KEYS.filter(key => nextDesign[key] !== design[key]).map(key => [key, nextDesign[key]])) as Partial<MenuStyle>;
            const styled = applyMenuStyle(content, design, changes);
            setDesign(nextDesign); setContent(styled.content); return;
        }
        if (layoutStarted) { setPendingDesign(nextDesign); return; }
        applyDesign(nextDesign);
    };
    const pendingBlockCount = pendingDesign ? MENU_LAYOUTS[pendingDesign.templateId] ? (3 + MENU_LAYOUTS[pendingDesign.templateId].sections.length) * pageCount : 1 + (productIds.length ? 1 : 0) : 0;
    const changeStep = (nextStep: number) => {
        if (nextStep === 1) {
            if (!layoutStarted) setContent(createMenuLayout(design, name, productIds, products, pageCount));
            else setContent(value => ensureMenuTitle(value, name, design.textColor));
            setLayoutStarted(true);
        }
        setStep(nextStep);
        window.scrollTo({ top: 0, behavior: 'instant' });
    };
    const templateName = design.templateId === 'custom' ? 'Custom menu' : MENU_TEMPLATES.find(template => template.design.templateId === design.templateId)?.name;

    const save = async (action: 'draft' | 'publish') => {
        setSaving(true);
        setSavingAction(action);
        setError('');
        try {
            const menuName = name.trim() || 'Untitled menu';
            const data = { name: menuName, productIds, productPrices, menuType: 'menu', status: 'draft', design, content: content.map(block => block.type === 'title' ? { ...block, text: menuName } : block), pageCount };
            const response = savedId ? await api.put(`/digital-menus/${savedId}`, data) : await api.post('/digital-menus', data);
            const id = response.data._id as string;
            setSavedId(id);
            for (const deal of pendingDeals) {
                const { data: saved } = await api.post('/digital-menus', { menuType: 'deal', sourceMenuId: id, clientRequestId: deal.id, name: deal.name.trim(), productIds: deal.productIds, dealPrice: deal.dealPrice });
                setPendingDeals(value => value.filter(item => item.id !== deal.id));
                setSavedDeals(value => [...value.filter(item => item.id !== saved._id), { ...deal, id: saved._id }]);
            }
            if (action === 'publish') await api.post(`/digital-menus/${id}/publish`);
            navigate('/digital-menus');
        } catch (saveError: unknown) {
            setError(isAxiosError<{ message?: string }>(saveError) ? saveError.response?.data?.message || 'Unable to save this menu.' : 'Unable to save this menu.');
        } finally {
            setSaving(false);
        }
    };

    if (loadingMenu) return <Box sx={{py:6,textAlign:'center'}}><CircularProgress /><Typography sx={{mt:2}}>Loading your menu...</Typography></Box>;
    if (!menuLoaded) return <Box><Button startIcon={<ArrowLeft size={18}/>} onClick={()=>navigate('/digital-menus')}>Back to Digital Menus</Button><Alert severity="error" sx={{mt:2}}>{error || 'This menu is unavailable.'}</Alert></Box>;

    return <Box>
        <Button startIcon={<ArrowLeft size={18} />} disabled={saving} onClick={() => navigate('/digital-menus')} sx={{ mb: 2 }}>Back to Digital Menus</Button>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
            <Box><Typography component="h1" variant="h4" fontWeight={900}>{step === 0 ? editingId ? 'Edit Menu' : 'Create Menu' : 'Make your menu'}</Typography><Typography color="text.secondary" sx={{ mt: .75 }}>{step === 0 ? 'Choose a template or continue with a plain card to make your own menu.' : 'Arrange sections, headings, labels, and products to make your menu.'}</Typography></Box>
            {step === 1 && <Stack direction="row" gap={1} flexWrap="wrap" sx={{ alignSelf: 'start', flexShrink: 0 }}>{importButton}<Button variant="outlined" startIcon={<LayoutTemplate size={18} />} disabled={saving} onClick={() => changeStep(0)}>Menu Templates</Button></Stack>}
        </Stack>
        <Stepper activeStep={step} sx={{ maxWidth: 640, mb: 3 }}><Step><StepLabel>Choose your menu</StepLabel></Step><Step><StepLabel>Make your menu</StepLabel></Step></Stepper>
        {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
        {step === 0 ? <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <MenuDesignPicker design={design} onChange={changeDesign} name={name} products={selectedProducts} content={content} deals={[...savedDeals, ...pendingDeals]} pageCount={pageCount} initialView="templates" extraAction={importButton} />
        </Paper> : <Paper variant="outlined" sx={{ width: '100%', p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'start', sm: 'center' }} gap={1} sx={{ mb: 2 }}><Typography component="h2" variant="h5" fontWeight={800}>Your menu card</Typography><Stack direction="row" spacing={1} useFlexGap flexWrap="wrap"><MenuStatus published={published} /><Chip size="small" label={templateName} /><Chip size="small" variant="outlined" label={`${productIds.length} products`} /></Stack></Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{published ? 'You are editing a draft. Your published menu stays live until you publish these changes.' : 'Save your work as a draft, or publish it for customers. Publishing replaces the current active menu.'}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
                <TextField fullWidth required label="Menu name" placeholder="My restaurant menu" value={name} onChange={event => setName(event.target.value)} disabled={saving} slotProps={{ htmlInput: { maxLength: 100 } }} sx={{ flex: 1 }} />
            </Stack>
            {aiNotice && <Alert severity="success" onClose={() => setAiNotice('')} sx={{ mb: 2 }}>{aiNotice}</Alert>}
            {design.templateId === 'custom' && <Accordion disableGutters elevation={0} sx={{ mb: 2, border: 1, borderColor: 'divider', borderRadius: 2, '&:before': { display: 'none' } }}><AccordionSummary expandIcon={<ChevronDown size={18} />}><Typography fontWeight={700}>Menu style, colors & layout</Typography></AccordionSummary><AccordionDetails><MenuStyleEditor value={design} onChange={changeStyle} disabled={saving} /><Typography variant="caption" color="text.secondary">Choose a modern design and change its layout, colors, font and decoration anytime. Individually edited heading colors are kept.</Typography></AccordionDetails></Accordion>}
            <Stack direction="row" columnGap={3} flexWrap="wrap" sx={{ mb: 2 }}>
                <FormControlLabel control={<Switch checked={design.showImages} disabled={saving} onChange={event => setDesign(value => ({ ...value, showImages: event.target.checked }))} />} label="Show item photos" />
                <FormControlLabel control={<Switch checked={Boolean(design.showDescriptions)} disabled={saving} onChange={event => setDesign(value => ({ ...value, showDescriptions: event.target.checked }))} />} label="Show item descriptions" />
            </Stack>
            <MenuBuilder design={design} name={name} onNameChange={setName} content={content} onChange={setContent} pageCount={pageCount} onPageCountChange={setPageCount} products={products} productIds={productIds} onProductsChange={changeProducts} productPrices={productPrices} onPricesChange={setProductPrices} loading={loading} productsError={productsError} onRetry={()=>void dispatch(fetchProducts({force:true}))} disabled={saving} deals={[...savedDeals, ...pendingDeals]} editableDealIds={pendingDeals.map(deal => deal.id)} onDealChange={(id, update) => setPendingDeals(value => value.map(deal => deal.id === id ? { ...deal, ...update } : deal))} onDealRemove={id => setPendingDeals(value => value.filter(deal => deal.id !== id))} aiAssistant={<AIMenuAssistant inspiration={content.find(block => block.type === 'image')?.imageUrl || referencePicture} products={products} productPrices={productPrices} name={name} design={design} brand={brand} existingSectionImages={Object.fromEntries(content.filter(block => block.type === 'section' && block.sectionImage).map(block => [block.text.trim().toLowerCase(), block.sectionImage!]))} existingSections={[...new Set(content.filter(block => block.type === 'section').map(block => block.text))]} loading={loading} productsError={productsError} onRetry={() => void dispatch(fetchProducts({ force: true }))} disabled={saving} onApply={applyAI} />} />
        </Paper>}
        <Stack direction="row" justifyContent="flex-end" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 3, pr: { xs: 6, sm: 8 } }}>
            {step === 1 && <Button disabled={saving} onClick={() => changeStep(0)}>Back to design</Button>}
            {step === 0 ? <Button variant="contained" onClick={() => changeStep(1)}>Next: Make Your Menu</Button> : <><Button variant="outlined" startIcon={<Save size={18} />} disabled={saving || invalidPrices || invalidDeals} onClick={() => void save('draft')}>{saving && savingAction === 'draft' ? 'Saving draft...' : 'Save Draft'}</Button><Button variant="contained" startIcon={<Send size={18} />} disabled={saving || invalidPrices || invalidDeals || loading || !name.trim() || !productIds.length || content.some(block=>block.type !== 'title' && !block.text.trim())} onClick={() => void save('publish')}>{saving && savingAction === 'publish' ? 'Publishing...' : published ? 'Publish changes' : 'Publish'}</Button></>}
        </Stack>
        <Dialog open={pendingDesign !== null} onClose={() => setPendingDesign(null)} fullWidth maxWidth="md">
            <DialogTitle>{pendingDesign?.templateId === 'custom' ? 'Start a custom layout?' : 'Apply this template?'}</DialogTitle>
            <DialogContent><Stack spacing={2}><Typography>This replaces your current headings, sections, and positions. Your menu name, selected products, and {pageCount === 1 ? 'page' : `${pageCount} pages`} will be kept. You can edit every part of the new layout.</Typography>
                {pendingDesign && <MenuPreview design={pendingDesign} name={name} products={selectedProducts} deals={[...savedDeals, ...pendingDeals]} pageCount={pageCount} />}
                {pendingBlockCount > 100 && <Alert severity="warning">This template needs {pendingBlockCount} elements across your pages. The limit is 100. Reduce the number of pages before applying it.</Alert>}
            </Stack></DialogContent>
            <DialogActions><Button onClick={() => setPendingDesign(null)}>Keep current layout</Button><Button variant="contained" disabled={!pendingDesign || pendingBlockCount > 100} onClick={() => { if (pendingDesign) applyDesign(pendingDesign); }}>{pendingDesign?.templateId === 'custom' ? 'Start custom layout' : 'Apply template'}</Button></DialogActions>
        </Dialog>
    </Box>;
}
