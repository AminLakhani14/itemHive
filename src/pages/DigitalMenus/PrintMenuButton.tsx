import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { Printer } from 'lucide-react';
import { MenuPageContent } from './MenuPageContent';
import { menuPageCount, type MenuBlock, type MenuProduct } from './menuContent';
import { menuDecoration, menuPageDimensions, type MenuDesign } from './menuTemplates';
import type { MenuDeal } from './aiMenu';
import MenuDealsSection from './MenuDealsSection';

type Props = { content: MenuBlock[]; products: MenuProduct[]; design: MenuDesign; pageCount?: number; disabled?: boolean; deals?: MenuDeal[] };

const printStyles = `
@page { size: A4 portrait; margin: 0; }
@media print {
    html, body { width: 210mm !important; height: auto !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; display: block !important; }
    body > *:not(.menu-print-dialog) { display: none !important; }
    .menu-print-dialog { position: static !important; overflow: visible !important; }
    .menu-print-dialog .MuiBackdrop-root, .menu-print-dialog .menu-print-controls { display: none !important; }
    .menu-print-dialog .MuiDialog-container { display: block !important; height: auto !important; }
    .menu-print-dialog .MuiDialog-paper { display: block !important; position: static !important; margin: 0 !important; padding: 0 !important; width: 210mm !important; max-width: none !important; height: auto !important; max-height: none !important; overflow: visible !important; border-radius: 0 !important; box-shadow: none !important; }
    .menu-print-dialog .MuiDialogContent-root { display: block !important; padding: 0 !important; overflow: visible !important; }
    .menu-print-page-frame { margin: 0 !important; padding: 0 !important; width: 210mm !important; height: 297mm !important; overflow: visible !important; break-after: page; page-break-after: always; break-inside: avoid; }
    .menu-print-page-frame:last-child { break-after: auto; page-break-after: auto; }
    .menu-print-paper-wrap { width: 210mm !important; height: 297mm !important; margin: 0 !important; }
    .menu-print-page { width: 210mm !important; height: 297mm !important; transform: none !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
    .menu-print-dialog, .menu-print-dialog * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

function A4MenuPage({ content, products, design, page, deals = [] }: Props & { page: number }) {
    const frame = useRef<HTMLDivElement>(null);
    const body = useRef<HTMLDivElement>(null);
    const [scales, setScales] = useState({ view: 1, content: 1 });
    const dimensions = menuPageDimensions({ ...design, pageSize: 'a4', orientation: 'portrait' });
    useEffect(() => {
        const container = frame.current;
        const menu = body.current;
        if (!container || !menu) return;
        const measure = () => setScales({ view: Math.min(1, container.clientWidth / dimensions.width), content: Math.min(1, (dimensions.height - 66) / Math.max(1, menu.scrollHeight)) });
        const observer = new ResizeObserver(measure);
        observer.observe(container);
        observer.observe(menu);
        measure();
        return () => observer.disconnect();
    }, [dimensions.width, dimensions.height]);
    return <Box ref={frame} className="menu-print-page-frame" sx={{ width: '100%', mb: 3 }}>
        <Typography className="menu-print-controls" variant="body2" color="text.secondary" sx={{ mb: 1, textAlign: 'center' }}>Page {page} - A4 (210 x 297 mm)</Typography>
        {scales.content < .99 && <Alert className="menu-print-controls" severity="info" sx={{ mb: 1 }}>Page {page} is scaled to {Math.floor(scales.content * 100)}% to fit A4. Move items to another menu page to print larger text.</Alert>}
        <Box className="menu-print-paper-wrap" sx={{ width: dimensions.width * scales.view, height: dimensions.height * scales.view, mx: 'auto', position: 'relative' }}>
            <Box className="menu-print-page" data-menu-print-page={page} data-width-mm="210" data-height-mm="297" sx={{ width: dimensions.width, height: dimensions.height, p: '32px', boxSizing: 'border-box', bgcolor: design.backgroundColor, color: design.textColor, transform: `scale(${scales.view})`, transformOrigin: 'top left', overflow: 'hidden', boxShadow: '0 2px 12px #00000020', ...menuDecoration(design) }}>
                <Box ref={body} data-menu-print-content sx={{ transform: `scale(${scales.content})`, transformOrigin: 'top center' }}><MenuPageContent content={content} products={products} design={design} page={page} print /><MenuDealsSection deals={deals} products={products} design={design} /></Box>
            </Box>
        </Box>
    </Box>;
}

export default function PrintMenuButton({ content, products, design, pageCount = 1, disabled = false, deals = [] }: Props) {
    const [open, setOpen] = useState(false);
    const count = menuPageCount(content, pageCount);
    return <>
        <Button variant="outlined" startIcon={<Printer size={18} />} disabled={disabled} onClick={() => setOpen(true)}>Print</Button>
        <Dialog className="menu-print-dialog" open={open} onClose={() => setOpen(false)} fullWidth maxWidth="lg" scroll="paper">
            {open && <style>{printStyles}</style>}
            <DialogTitle className="menu-print-controls">A4 print preview</DialogTitle>
            <DialogContent sx={{ bgcolor: '#f1f3f5', py: 3 }}>
                <Typography className="menu-print-controls" variant="body2" color="text.secondary" sx={{ mb: 2 }}>All {count} menu {count === 1 ? 'page' : 'pages'} will print on A4 paper, exactly as shown on your menu.</Typography>
                {open && Array.from({ length: count }, (_, index) => <A4MenuPage key={index} content={content} products={products} design={design} page={index + 1} deals={index === count - 1 ? deals : []} />)}
            </DialogContent>
            <DialogActions className="menu-print-controls"><Button onClick={() => setOpen(false)}>Close</Button><Button variant="contained" startIcon={<Printer size={18} />} onClick={() => window.print()}>Print A4</Button></DialogActions>
        </Dialog>
    </>;
}
