import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography, useTheme, rgbToHex } from '@mui/material';
import { Palette, RotateCcw, Upload, Sparkles } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setAppearance, type Appearance } from '../../features/auth/authSlice';
import { clearThemePreview, setThemePreview } from '../../features/theme/themePreviewSlice';
import api from '../../api/axios';
import { getAppTheme } from '../../theme/theme';

const defaults: Appearance = { themeColor: '#0ea5a5', backgroundColor: '', sidebarColor: '', navbarColor: '', fontColor: '', logo: '' };

const colorGroups = [
    { title: 'Backgrounds', fields: [['backgroundColor', 'Theme color'], ['sidebarColor', 'Left navigation color'], ['navbarColor', 'Top navigation color']] },
    { title: 'Text and borders', fields: [['fontColor', 'Font color'], ['sidebarFontColor', 'Left navigation font color'], ['navbarFontColor', 'Top navigation font color'], ['headingColor', 'Heading color'], ['secondaryTextColor', 'Secondary text color'], ['borderColor', 'Border color']] },
    { title: 'Accents and status', fields: [['themeColor', 'Accent color'], ['secondaryColor', 'Secondary accent color'], ['successColor', 'Success color'], ['warningColor', 'Warning color'], ['errorColor', 'Error color']] },
] as const;
type ColorKey = typeof colorGroups[number]['fields'][number][0];
type Recommendation = { name: string; explanation: string; colors: Record<ColorKey, string> };
const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
// Palettes already shown are sent back so each request asks the AI for different themes.
const paletteKeys = ['themeColor', 'secondaryColor', 'backgroundColor', 'sidebarColor', 'navbarColor'] as const;
type SuggestedPalette = Record<typeof paletteKeys[number], string>;
const maxExcludedPalettes = 12;

// A miniature app layout so suggestions can be compared at a glance.
function ThemeThumbnail({ colors }: { colors: Recommendation['colors'] }) {
    const bar = (color: string, width: string, height = 4) => <Box sx={{ height, width, flexShrink: 0, borderRadius: '2px', bgcolor: color }} />;
    return <Box aria-hidden sx={{ display: 'flex', height: 88, borderRadius: 1, overflow: 'hidden', border: '1px solid', borderColor: colors.borderColor }}>
        <Box sx={{ width: '28%', p: 1, display: 'flex', flexDirection: 'column', gap: 0.75, bgcolor: colors.sidebarColor, borderRight: '1px solid', borderColor: colors.borderColor }}>
            {bar(colors.themeColor, '85%', 6)}
            {bar(colors.sidebarFontColor, '65%')}
            {bar(colors.sidebarFontColor, '75%')}
        </Box>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ height: 18, px: 1, display: 'flex', alignItems: 'center', bgcolor: colors.navbarColor, borderBottom: '1px solid', borderColor: colors.borderColor }}>
                {bar(colors.navbarFontColor, '40%', 3)}
            </Box>
            <Box sx={{ flex: 1, p: 1, display: 'flex', flexDirection: 'column', gap: 0.75, bgcolor: colors.backgroundColor }}>
                {bar(colors.headingColor, '55%', 6)}
                {bar(colors.fontColor, '85%')}
                {bar(colors.secondaryTextColor, '70%')}
                <Box sx={{ display: 'flex', gap: 0.5, mt: 'auto' }}>
                    {bar(colors.themeColor, '32px', 10)}
                    {bar(colors.secondaryColor, '20px', 10)}
                    {bar(colors.successColor, '10px', 10)}
                </Box>
            </Box>
        </Box>
    </Box>;
}

export default function ThemeSettingsPage() {
    const user = useSelector((state: RootState) => state.auth.user);
    return <ThemeEditor key={user?.id} userId={user?.id || ''} saved={user?.appearance || defaults} />;
}

function ThemeEditor({ saved, userId }: { saved: Appearance; userId: string }) {
    const dispatch = useDispatch();
    const theme = useTheme();
    const [draft, setDraft] = useState(saved);
    const [previousSaved, setPreviousSaved] = useState(saved);
    if (previousSaved !== saved) {
        setPreviousSaved(saved);
        setDraft(saved);
    }
    const [busy, setBusy] = useState(false);
    const [suggesting, setSuggesting] = useState(false);
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [previewedTheme, setPreviewedTheme] = useState<number | null>(null);
    const [recommendationError, setRecommendationError] = useState('');
    const recommendationRequest = useRef<AbortController | null>(null);
    const shownPalettes = useRef<SuggestedPalette[]>([]);
    const uploadVersion = useRef(0);
    const [beforeRecommendation, setBeforeRecommendation] = useState<Appearance | null>(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const defaultFont = theme.palette.mode === 'light' ? '#0f172a' : '#f1f5f9';
    const valid = colorGroups.every(group => group.fields.every(([key]) =>
        key === 'themeColor' ? isHexColor(draft[key]) : !draft[key] || isHexColor(draft[key])));
    const safe = { ...draft };
    colorGroups.forEach(group => group.fields.forEach(([field]) => {
        if (safe[field] && !isHexColor(safe[field]!)) safe[field] = '';
    }));
    const palette = getAppTheme(theme.palette.mode, safe).palette;
    function swatchColor(key: ColorKey) {
        const colors: Record<ColorKey, string> = {
            backgroundColor: palette.background.default,
            sidebarColor: safe.sidebarColor || palette.background.paper,
            navbarColor: safe.navbarColor || palette.background.paper,
            fontColor: palette.text.primary,
            sidebarFontColor: safe.sidebarFontColor || palette.text.primary,
            navbarFontColor: safe.navbarFontColor || palette.text.primary,
            headingColor: safe.headingColor || palette.text.primary,
            secondaryTextColor: palette.text.secondary,
            borderColor: palette.divider,
            themeColor: palette.primary.main,
            secondaryColor: palette.secondary.main,
            successColor: palette.success.main,
            warningColor: palette.warning.main,
            errorColor: palette.error.main,
        };
        return rgbToHex(colors[key]).slice(0, 7);
    }

    // Native color pickers emit many events per second. Keep the controls immediate,
    // but coalesce app-wide theme updates, always using the latest valid selection.
    const pendingPreview = useRef<{ userId: string; appearance: Appearance } | null>(null);
    const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!valid) return;
        pendingPreview.current = { userId, appearance: draft };
        if (previewTimer.current !== null) return;
        previewTimer.current = setTimeout(() => {
            previewTimer.current = null;
            if (pendingPreview.current) dispatch(setThemePreview(pendingPreview.current));
        }, 50);
    }, [dispatch, draft, userId, valid]);

    useEffect(() => () => {
        if (previewTimer.current !== null) clearTimeout(previewTimer.current);
        previewTimer.current = null;
        pendingPreview.current = null;
        recommendationRequest.current?.abort();
        uploadVersion.current += 1;
        dispatch(clearThemePreview());
    }, [dispatch]);

    async function save(value: Appearance) {
        setBusy(true); setError(''); setMessage('');
        try {
            const { data } = await api.put('/auth/me/appearance', {
                logo: value.logo,
                ...Object.fromEntries(colorGroups.flatMap(group => group.fields.map(([key]) => [key, value[key] || '']))),
            });
            dispatch(setAppearance(data.appearance));
            setDraft(data.appearance);
            setBeforeRecommendation(null);
            setPreviewedTheme(null);
            setMessage('Your theme has been saved.');
        } catch {
            setError('Unable to save your theme. Please try again.');
        } finally { setBusy(false); }
    }

    function clearRecommendation() {
        recommendationRequest.current?.abort();
        recommendationRequest.current = null;
        setSuggesting(false);
        setRecommendations([]);
        setPreviewedTheme(null);
        setRecommendationError('');
        setBeforeRecommendation(null);
        shownPalettes.current = [];
    }

    // Current suggestions stay visible until new ones arrive, so a failed retry keeps them.
    async function suggestThemes(logo: string) {
        recommendationRequest.current?.abort();
        const controller = new AbortController();
        recommendationRequest.current = controller;
        setSuggesting(true);
        setRecommendationError('');
        try {
            const { data } = await api.post<{ themes?: Recommendation[] }>('/auth/me/appearance/recommend',
                { logo, mode: theme.palette.mode, exclude: shownPalettes.current },
                { signal: controller.signal, timeout: 50000 });
            if (controller.signal.aborted) return;
            const themes = (data.themes || []).filter(item => item?.colors && colorGroups.every(group => group.fields.every(([key]) => isHexColor(item.colors[key] || ''))));
            if (!themes.length) throw new Error('Invalid recommendation');
            shownPalettes.current = [...shownPalettes.current, ...themes.map(item =>
                Object.fromEntries(paletteKeys.map(key => [key, item.colors[key]])) as SuggestedPalette)].slice(-maxExcludedPalettes);
            setRecommendations(themes);
            setPreviewedTheme(null);
        } catch (failure) {
            if (controller.signal.aborted) return;
            const response = failure as { response?: { data?: { message?: string } } };
            setRecommendationError(response.response?.data?.message || 'Unable to recommend a theme. Please try again.');
        } finally {
            if (!controller.signal.aborted) setSuggesting(false);
        }
    }

    async function upload(file?: File) {
        if (!file) return;
        setError(''); setMessage('');
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 500 * 1024) {
            setError('Choose a PNG, JPEG or WebP image up to 500 KB.'); return;
        }
        clearRecommendation();
        const version = ++uploadVersion.current;
        try {
            const logo = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const image = new Image();
            image.src = logo;
            await image.decode();
            if (version !== uploadVersion.current) return;
            setDraft(current => ({ ...current, logo }));
            void suggestThemes(logo);
        } catch { setError('This image could not be opened. Please choose another file.'); }
    }

    return <Stack spacing={3} sx={{ maxWidth: 850, mx: 'auto' }}>
        <Box>
            <Typography variant="h4" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}><Palette /> Theme Settings</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>Personalize your colors and app logo. Changes preview immediately. Click Save theme to keep them for your account.</Typography>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
        {message && <Alert severity="success">{message}</Alert>}
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
            <Stack spacing={3}>
                <Typography variant="h6">Personal logo</Typography>
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Box component="img" src={draft.logo || '/OZOR-transparent.webp'} alt="Logo preview" sx={{ width: draft.logo ? 180 : 64, height: 80, maxWidth: '100%', objectFit: 'contain' }} />
                    <Button component="label" variant="outlined" startIcon={<Upload size={18} />} disabled={busy}>Upload logo
                        <input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
                    </Button>
                    {draft.logo && <Button disabled={busy} onClick={() => { uploadVersion.current += 1; clearRecommendation(); setDraft({ ...draft, logo: '' }); }}>Use default logo</Button>}
                </Stack>
                <Typography variant="caption" color="text.secondary">PNG, JPEG or WebP, up to 500 KB. Appears in your app navigation. Uploading sends the logo to AI to suggest matching colors.</Typography>
                <Button variant="outlined" startIcon={<Sparkles size={18} />} disabled={busy || suggesting || !draft.logo} onClick={() => void suggestThemes(draft.logo)} sx={{ alignSelf: 'flex-start' }}>
                    {suggesting ? 'Designing themes...' : recommendations.length ? 'Suggest new themes with AI' : 'Suggest themes with AI'}
                </Button>
                {suggesting && <Typography role="status" color="text.secondary">Designing three different themes for your backgrounds, navigation, text, borders, and accents...</Typography>}
                {recommendationError && <Alert severity="warning">{recommendationError}</Alert>}
                {recommendations.length > 0 && <Stack spacing={1.5}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, opacity: suggesting ? 0.6 : 1 }}>
                        {recommendations.map((item, index) => {
                            const selected = previewedTheme === index;
                            return <Paper key={`${item.name}-${index}`} variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5, borderColor: selected ? 'primary.main' : undefined, boxShadow: selected ? t => `0 0 0 1px ${t.palette.primary.main}` : undefined }}>
                                <ThemeThumbnail colors={item.colors} />
                                <Box>
                                    <Typography variant="subtitle1" fontWeight={700}>{item.name}</Typography>
                                    <Typography variant="body2" color="text.secondary">{item.explanation}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                    {colorGroups.flatMap(group => group.fields.map(([key, label]) => <Box key={key} role="img" aria-label={`${label} ${item.colors[key]}`} title={`${label}: ${item.colors[key]}`}
                                        sx={{ width: 18, height: 18, border: '1px solid', borderColor: 'divider', borderRadius: '4px', bgcolor: item.colors[key] }} />))}
                                </Box>
                                <Button disabled={busy} variant={selected ? 'contained' : 'outlined'} sx={{ mt: 'auto' }} onClick={() => {
                                    setBeforeRecommendation(current => current || draft);
                                    setDraft(current => ({ ...current, ...item.colors }));
                                    setPreviewedTheme(index);
                                    setMessage(`"${item.name}" previewed. Adjust any colors, then click Save theme to keep it.`);
                                }}>{selected ? 'Previewing' : 'Preview theme'}</Button>
                            </Paper>;
                        })}
                    </Box>
                    {beforeRecommendation && <Button disabled={busy} sx={{ alignSelf: 'flex-start' }} onClick={() => { setDraft(beforeRecommendation); setBeforeRecommendation(null); setPreviewedTheme(null); setMessage('Previous colors restored.'); }}>Undo preview</Button>}
                </Stack>}
                {colorGroups.map(group => <Stack key={group.title} spacing={2}>
                    <Typography variant="h6">{group.title}</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
                        {group.fields.map(([key, label]) => {
                            const value = draft[key] || '';
                            return <Stack key={key} spacing={1}>
                                <Typography fontWeight={700}>{label}</Typography>
                                <Stack direction="row" spacing={1.5} alignItems="center">
                                    <Box component="input" type="color" aria-label={`Choose ${label.toLowerCase()}`} value={swatchColor(key)} disabled={busy}
                                        onChange={e => setDraft({ ...draft, [key]: e.target.value })} sx={{ width: 48, height: 40, flexShrink: 0, border: 0, p: 0, bgcolor: 'transparent', cursor: 'pointer' }} />
                                    <TextField fullWidth label={label} value={value} placeholder="Automatic" slotProps={{ inputLabel: { shrink: true } }} disabled={busy} onChange={e => setDraft({ ...draft, [key]: e.target.value })}
                                        error={key === 'themeColor' ? !isHexColor(value) : !!value && !isHexColor(value)} helperText={value && !isHexColor(value) ? 'Enter a color like #12AB34' : `Saved: ${saved[key]?.toUpperCase() || 'Automatic'}`} />
                                </Stack>
                                <Button size="small" disabled={busy || !value} sx={{ alignSelf: 'flex-start' }} onClick={() => setDraft({ ...draft, [key]: key === 'themeColor' ? defaults.themeColor : '' })}>Use default</Button>
                            </Stack>;
                        })}
                    </Box>
                </Stack>)}
                <Typography variant="caption" color="text.secondary">Automatic colors follow the current light or dark mode and your theme. Custom colors preview immediately.</Typography>
                <Box sx={{ p: 3, borderRadius: 2, bgcolor: 'background.default', color: valid ? draft.fontColor || defaultFont : 'text.primary', borderLeft: '4px solid', borderColor: valid ? draft.themeColor : 'primary.main' }}>
                    <Typography variant="h6">Preview</Typography>
                    <Typography sx={{ my: 1 }}>This is how your background, headings, text, and accent colors will look.</Typography>
                    <Box sx={{ display: 'inline-block', bgcolor: valid ? draft.themeColor : 'primary.main', width: 80, height: 8, borderRadius: 2 }} />
                </Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Button variant="contained" disabled={busy || !valid} onClick={() => void save(draft)}>{busy ? 'Saving…' : 'Save theme'}</Button>
                    <Button variant="outlined" startIcon={<RotateCcw size={18} />} disabled={busy} onClick={() => { uploadVersion.current += 1; clearRecommendation(); setDraft(defaults); setMessage('Default theme previewed. Click Save theme to keep it.'); setError(''); }}>Reset theme</Button>
                </Stack>
                <Typography variant="caption" color="text.secondary">Reset previews the default colors and logo. Leaving without saving restores your saved theme.</Typography>
            </Stack>
        </Paper>
    </Stack>;
}
