import { useRef, useState } from 'react';
import { Alert, Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, Grid, Paper, Stack, Typography } from '@mui/material';
import { Check, Copy, Download, ExternalLink, QrCode, Trash2 } from 'lucide-react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';

type TableQr = { _id: string; tableName?: string; token: string };
type Props<T extends TableQr> = { tables: T[]; publishedMenuName?: string; menuUrl: (token: string) => string; onCreate?: () => void; onDelete: (table: T) => void };

const tableLabel = (table: TableQr) => table.tableName || 'Table';
const byTableName = (a: TableQr, b: TableQr) => tableLabel(a).localeCompare(tableLabel(b), undefined, { numeric: true, sensitivity: 'base' });

// Adds the table name under the code so the PNG can be printed and placed on the table as-is.
const downloadQr = (canvas: HTMLCanvasElement, name: string) => {
    const caption = Math.round(canvas.width * 0.16);
    const sheet = document.createElement('canvas');
    sheet.width = canvas.width;
    sheet.height = canvas.height + caption;
    const ctx = sheet.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    ctx.drawImage(canvas, 0, 0);
    ctx.fillStyle = '#111827';
    ctx.font = `700 ${Math.round(canvas.width * 0.075)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, sheet.width / 2, canvas.height + caption * 0.35, sheet.width * 0.9);
    const link = document.createElement('a');
    link.href = sheet.toDataURL('image/png');
    link.download = `${name.replace(/[^\w-]+/g, '-')}-QR.png`;
    link.click();
};

export default function TableQrSection<T extends TableQr>({ tables, publishedMenuName, menuUrl, onCreate, onDelete }: Props<T>) {
    const [selected, setSelected] = useState<T | null>(null);
    const [copied, setCopied] = useState(false);
    const printCanvas = useRef<HTMLCanvasElement>(null);
    const sorted = [...tables].sort(byTableName);
    const open = (table: T) => { setCopied(false); setSelected(table); };
    const copy = async (table: T) => { await navigator.clipboard.writeText(menuUrl(table.token)); setCopied(true); };

    return <Box sx={{ mt: 5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1.5} sx={{ mb: 2 }}>
            <Box>
                <Typography variant="h5" fontWeight={900}>Table QR Codes</Typography>
                <Typography variant="body2" color="text.secondary">Each table has its own QR code, so orders arrive under the right table. Tap a code to open it.</Typography>
            </Box>
            {onCreate && <Button variant="outlined" startIcon={<QrCode size={18} />} onClick={onCreate} sx={{ flexShrink: 0 }}>Create Table QR</Button>}
        </Stack>
        {tables.length > 0 && !publishedMenuName && <Alert severity="warning" sx={{ mb: 2 }}>No menu is published yet. Publish a menu so these QR codes open it for customers.</Alert>}
        <Grid container spacing={2}>{sorted.map(table => <Grid key={table._id} size={{ xs: 6, sm: 4, md: 3, xl: 2 }}>
            <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden', height: '100%' }}>
                <ButtonBase onClick={() => open(table)} aria-label={`Open ${tableLabel(table)} QR code`} sx={{ width: '100%', height: '100%', p: 2, display: 'flex', flexDirection: 'column', gap: 1.25, '&:hover': { bgcolor: 'action.hover' } }}>
                    <Box sx={{ bgcolor: '#fff', p: 1, borderRadius: 2, lineHeight: 0 }}><QRCodeSVG value={menuUrl(table.token)} size={112} marginSize={1} title={`${tableLabel(table)} QR code`} /></Box>
                    <Typography fontWeight={900} textAlign="center" sx={{ wordBreak: 'break-word' }}>{tableLabel(table)}</Typography>
                </ButtonBase>
            </Paper>
        </Grid>)}</Grid>
        {!tables.length && <Typography color="text.secondary">No table QR codes yet. Create one for each table so customers can order from their seat.</Typography>}

        <Dialog open={!!selected} onClose={() => setSelected(null)} fullWidth maxWidth="xs">
            {selected && <>
                <DialogTitle>{tableLabel(selected)} QR Code</DialogTitle>
                <DialogContent>
                    <Stack alignItems="center" spacing={1.5} sx={{ pt: .5 }}>
                        <Box sx={{ bgcolor: '#fff', p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', lineHeight: 0 }}><QRCodeSVG value={menuUrl(selected.token)} size={240} marginSize={1} title={`${tableLabel(selected)} QR code`} /></Box>
                        <Typography variant="h6" fontWeight={900}>{tableLabel(selected)}</Typography>
                        <Typography variant="body2" color="text.secondary" textAlign="center">{publishedMenuName ? <>Opens <strong>{publishedMenuName}</strong>. Orders from this code are sent as {tableLabel(selected)}.</> : 'No menu is published yet, so this code will not open a menu.'}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all', textAlign: 'center' }}>{menuUrl(selected.token)}</Typography>
                    </Stack>
                    <QRCodeCanvas ref={printCanvas} value={menuUrl(selected.token)} size={512} marginSize={4} style={{ display: 'none' }} />
                </DialogContent>
                <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 3, pb: 2 }}>
                    <Button color="error" startIcon={<Trash2 size={16} />} onClick={() => { setSelected(null); onDelete(selected); }} sx={{ mr: 'auto' }}>Delete</Button>
                    <Button startIcon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copy(selected)}>{copied ? 'Copied' : 'Copy link'}</Button>
                    <Button startIcon={<ExternalLink size={16} />} onClick={() => window.open(menuUrl(selected.token), '_blank', 'noopener,noreferrer')}>Open</Button>
                    <Button variant="contained" startIcon={<Download size={16} />} onClick={() => printCanvas.current && downloadQr(printCanvas.current, tableLabel(selected))}>Download</Button>
                </DialogActions>
            </>}
        </Dialog>
    </Box>;
}
