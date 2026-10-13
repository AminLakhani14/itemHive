import type { ReactNode } from 'react';
import { Box, IconButton, InputBase, Stack, Typography, alpha } from '@mui/material';
import { Trash2 } from 'lucide-react';
import type { MenuDeal } from './aiMenu';
import type { MenuProduct } from './menuContent';
import { menuBlockStyle, menuItemStyle, menuPriceStyle, modernMenu } from './menuAppearance';
import { menuFont, type MenuDesign } from './menuTemplates';

type Props = {
    deals: MenuDeal[]; products: MenuProduct[]; design: MenuDesign;
    editableDealIds?: string[]; disabled?: boolean;
    onChange?: (id: string, update: Partial<Pick<MenuDeal, 'name' | 'dealPrice'>>) => void;
    onRemove?: (id: string) => void;
    renderDeal?: (deal: MenuDeal) => ReactNode;
};

export default function MenuDealsSection({ deals, products, design, editableDealIds = [], disabled = false, onChange, onRemove, renderDeal }: Props) {
    if (!deals.length) return null;
    return <Box component="section" data-menu-deals sx={{ ...menuBlockStyle({ type: 'section' }, design), mt: 3, color: design.textColor }}>
        <Typography component="h2" sx={{ mb: 1, color: design.accentColor, fontSize: 28, fontWeight: 800, lineHeight: 1.25, fontFamily: menuFont(design) }}>Deals / combos</Typography>
        {!modernMenu(design) && <Stack direction="row" justifyContent="space-between" sx={{ opacity: .85, pr: onRemove ? '28px' : 0 }}><Typography sx={{ fontSize: 11, fontWeight: 700 }}>Combo</Typography><Typography sx={{ fontSize: 11, fontWeight: 700 }}>Price (Rs.)</Typography></Stack>}
        {deals.map(deal => {
            if (renderDeal) return <Box key={deal.id} data-menu-deal={deal.id}>{renderDeal(deal)}</Box>;
            const editable = editableDealIds.includes(deal.id) && !!onChange;
            const invalidPrice = !Number.isFinite(deal.dealPrice * 100) || deal.dealPrice < 0;
            return <Box key={deal.id} data-menu-deal={deal.id} sx={{ ...menuItemStyle(design), py: modernMenu(design) ? 1.5 : .75 }}>
                <Stack direction="row" alignItems="center" gap={1}>
                    {editable ? <InputBase fullWidth value={deal.name} disabled={disabled} onChange={event => onChange?.(deal.id, { name: event.target.value })} inputProps={{ 'aria-label': `Combo name for ${deal.name}`, maxLength: 100 }} sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: deal.name.trim() ? design.textColor : 'error.main', '& input': { p: '2px 0' } }} /> : <Typography sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{deal.name}</Typography>}
                    {editable ? <InputBase type="number" value={Number.isNaN(deal.dealPrice) ? '' : deal.dealPrice} disabled={disabled} onChange={event => onChange?.(deal.id, { dealPrice: event.target.value.trim() ? Number(event.target.value) : NaN })} onBlur={() => { if (!invalidPrice) onChange?.(deal.id, { dealPrice: Math.round(deal.dealPrice * 100) / 100 }); }} inputProps={{ 'aria-label': `Combo price for ${deal.name}`, min: 0, step: .01 }} sx={{ ...menuPriceStyle(design), width: 90, flexShrink: 0, fontSize: 14, color: invalidPrice ? 'error.main' : design.textColor, borderBottom: modernMenu(design) ? 'none' : '1px dashed', borderColor: alpha(design.textColor, .3), '& input': { p: '2px 0', textAlign: 'right', MozAppearance: 'textfield' }, '& input::-webkit-inner-spin-button, & input::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 } }} /> : <Typography sx={menuPriceStyle(design)}>Rs. {deal.dealPrice.toLocaleString('en-PK', { maximumFractionDigits: 2 })}</Typography>}
                    {onRemove && <Box sx={{ width: 20, flexShrink: 0 }}>{editable && <IconButton size="small" aria-label={`Remove combo ${deal.name}`} disabled={disabled} onClick={() => onRemove(deal.id)} sx={{ p: .3, color: design.textColor }}><Trash2 size={14} /></IconButton>}</Box>}
                </Stack>
                <Typography sx={{ fontSize: 12, lineHeight: 1.4, opacity: .75, overflowWrap: 'anywhere' }}>{deal.productIds.map(id => products.find(product => product.id === id)?.name || 'Unavailable item').join(' + ')}</Typography>
            </Box>;
        })}
    </Box>;
}
