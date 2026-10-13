import { useState } from 'react';
import { Alert, Box, Button, ButtonBase, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { ImagePlus, Trash2 } from 'lucide-react';
import { isSectionImageLink, MAX_MENU_IMAGE_LENGTH, readSectionImage, SECTION_PHOTOS, sectionImageUrl, sectionPhoto, type SectionImage } from './sectionImages';
import type { MenuProduct } from './menuContent';

export default function SectionImagePicker({ open, name, image, products, otherImageLength = 0, onChange, onClose }: {
    open: boolean; name: string; image?: SectionImage; products: MenuProduct[]; otherImageLength?: number;
    onChange: (image?: SectionImage) => void; onClose: () => void;
}) {
    const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
    const [imageLink, setImageLink] = useState('');
    const [linkState, setLinkState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
    const validLink = isSectionImageLink(imageLink.trim());
    const choose = (next?: SectionImage) => {
        if (next && next.url.length + otherImageLength > MAX_MENU_IMAGE_LENGTH) { setError('The menu has too many large photos. Remove another uploaded photo or choose a library image.'); return; }
        onChange(next); setError(''); setImageLink(''); setLinkState('idle'); onClose();
    };
    const upload = async (file?: File) => {
        if (!file) return; setError(''); setBusy(true);
        try { choose(await readSectionImage(file)); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to read this image.'); } finally { setBusy(false); }
    };
    return <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
        <DialogTitle>Section image · {name}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">Paste an image link from your browser, upload your restaurant’s own photo or choose a web photo below. This photo belongs to the section and moves with it.</Typography>
            {image && <Box component="img" src={sectionImageUrl(image.url)} referrerPolicy="no-referrer" alt={image.alt} sx={{ width: '100%', height: 190, objectFit: 'cover', borderRadius: 3 }} />}
            {image && <TextField label="Image description" size="small" value={image.alt} slotProps={{ htmlInput: { maxLength: 160 } }} onChange={event => onChange({ ...image, alt: event.target.value })} onBlur={() => { if (!image.alt.trim()) onChange({ ...image, alt: `${name} section photo`.slice(0, 160) }); }} />}
            <Button component="label" variant="contained" startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <ImagePlus size={18} />} disabled={busy}>{busy ? 'Preparing image…' : 'Upload section image'}<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></Button>
            <TextField label="Image link" placeholder="https://…" value={imageLink} disabled={busy} error={Boolean(imageLink.trim()) && !validLink} helperText="In your browser, right-click a photo and choose Copy image address. Paste its direct HTTPS image link here." onChange={event => { setImageLink(event.target.value); setLinkState('loading'); }} slotProps={{ htmlInput: { maxLength: 2048 } }} />
            {validLink && <Box component="img" key={imageLink.trim()} src={imageLink.trim()} referrerPolicy="no-referrer" alt={`Linked photo preview for ${name}`} onLoad={() => setLinkState('ready')} onError={() => setLinkState('failed')} sx={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 2, display: linkState === 'failed' ? 'none' : 'block' }} />}
            {validLink && linkState === 'failed' && <Alert severity="error">This link could not load as an image. Copy the photo’s image address, or try a different image link.</Alert>}
            <Button variant="outlined" disabled={busy || !validLink || linkState !== 'ready'} onClick={() => choose({ url: imageLink.trim(), alt: `${name} section photo`.slice(0, 160) })}>{validLink && linkState === 'loading' ? 'Loading linked image…' : 'Use image link'}</Button>
            {error && <Alert severity="error">{error}</Alert>}
            {products.some(product => product.imageUrl?.startsWith('data:image/')) && <><Typography fontWeight={700}>Photos from this section’s inventory</Typography><Stack direction="row" gap={1} flexWrap="wrap">{products.filter(product => product.imageUrl?.startsWith('data:image/') && product.imageUrl.length <= 200_000).map(product => <ButtonBase key={product.id} disabled={busy} onClick={() => choose({ url: product.imageUrl!, alt: product.name.slice(0, 160) })} sx={{ width: 130, display: 'block', textAlign: 'left' }}><Box component="img" src={product.imageUrl} alt="" sx={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 2 }} /><Typography variant="caption">{product.name}</Typography></ButtonBase>)}</Stack></>}
            <Typography fontWeight={700}>Web photo suggestions</Typography>
            <Typography variant="caption" color="text.secondary">Photos found online. View the source or replace a suggestion with your preferred image link.</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5 }}>{SECTION_PHOTOS.map(photo => <Box key={photo.key}><ButtonBase disabled={busy} aria-label={`Use ${photo.name} section image`} onClick={() => choose(sectionPhoto(photo.key))} sx={{ display: 'block', width: '100%', textAlign: 'left', border: 1, borderColor: 'divider', p: .75, borderRadius: 3 }}><Box component="img" src={photo.url} referrerPolicy="no-referrer" alt={photo.alt} sx={{ width: '100%', height: 115, objectFit: 'cover', borderRadius: 2 }} /><Typography variant="body2" fontWeight={700} sx={{ p: .75 }}>{photo.name}</Typography></ButtonBase><Typography component="a" href={photo.source} target="_blank" rel="noopener noreferrer" variant="caption" sx={{ display: 'block', mt: .75, color: 'primary.main' }}>{photo.author} · Pexels</Typography></Box>)}</Box>
        </Stack></DialogContent><DialogActions>{image && <Button color="error" startIcon={<Trash2 size={16} />} disabled={busy} onClick={() => choose()}>Remove image</Button>}<Button disabled={busy} onClick={() => { setError(''); onClose(); }}>Done</Button></DialogActions>
    </Dialog>;
}
