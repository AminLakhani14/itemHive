import { Box, Button, Checkbox, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { MENU_STYLE_KEYS, type MenuStyle, type MenuStyleKey } from './aiMenu';

const labels: Record<MenuStyleKey, string> = { visualStyle: 'Menu design', sectionColumns: 'Section columns', backgroundColor: 'Background color', textColor: 'Text color', accentColor: 'Heading & accent color', headerColor: 'Customer menu header', surfaceColor: 'Section & customer cards', fontStyle: 'Heading font', decoration: 'Decoration' };
const modernStyles = [{ id: 'cards', name: 'Modern Cards', description: 'Photo panels & price badges' }, { id: 'minimal', name: 'Minimal', description: 'Open space & clean typography' }, { id: 'editorial', name: 'Editorial', description: 'Section photos & bold headings' }] as const;
export default function MenuStyleEditor({ value, onChange, selectedKeys, onSelect, disabled = false, allowedKeys = [...MENU_STYLE_KEYS] }: {
    value: MenuStyle; onChange: (value: Partial<MenuStyle>) => void; disabled?: boolean;
    selectedKeys?: MenuStyleKey[]; onSelect?: (key: MenuStyleKey, selected: boolean) => void;
    allowedKeys?: MenuStyleKey[];
}) {
    return <Grid container spacing={1.5}>
        <Grid size={12}><Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
            {modernStyles.map(item => <Button key={item.id} variant={value.visualStyle === item.id ? 'contained' : 'outlined'} disabled={disabled} aria-pressed={value.visualStyle === item.id} onClick={() => {
                onChange({ visualStyle: item.id, sectionColumns: 2, fontStyle: 'sans', decoration: item.id === 'cards' ? 'glow' : 'none' });
                for (const key of ['visualStyle', 'sectionColumns', 'fontStyle', 'decoration'] as const) onSelect?.(key, true);
            }} sx={{ flex: 1, py: 1.5, justifyContent: 'start', textAlign: 'left' }}><Box><Typography fontWeight={700}>{item.name}</Typography><Typography variant="caption" sx={{ opacity: .8 }}>{item.description}</Typography></Box></Button>)}
        </Stack></Grid>
        {allowedKeys.map(key => <Grid key={key} size={{ xs: 12, sm: 6 }}><Stack direction="row" alignItems="center" gap={1}>
            {onSelect && <Checkbox checked={selectedKeys?.includes(key) ?? false} disabled={disabled} inputProps={{ 'aria-label': `Apply suggested ${labels[key].toLowerCase()}` }} onChange={event => onSelect(key, event.target.checked)} />}
            <TextField fullWidth size="small" label={labels[key]} disabled={disabled || (selectedKeys !== undefined && !selectedKeys.includes(key))} value={value[key] ?? (key === 'visualStyle' ? 'classic' : key === 'sectionColumns' ? 1 : 'none')}
                type={key.endsWith('Color') ? 'color' : undefined} select={!key.endsWith('Color')}
                onChange={event => onChange({ [key]: key === 'sectionColumns' ? Number(event.target.value) : event.target.value })}
                slotProps={key.endsWith('Color') ? { htmlInput: { style: { height: 32, padding: 6 } }, inputLabel: { shrink: true } } : undefined}>
                {key === 'fontStyle' && [<MenuItem key="sans" value="sans">Modern</MenuItem>, <MenuItem key="serif" value="serif">Classic</MenuItem>]}
                {key === 'visualStyle' && [...modernStyles.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>), <MenuItem key="classic" value="classic">Classic list</MenuItem>]}
                {key === 'sectionColumns' && [1, 2, 3].map(columns => <MenuItem key={columns} value={columns}>{columns} {columns === 1 ? 'column' : 'columns'}</MenuItem>)}
                {key === 'decoration' && [<MenuItem key="glow" value="glow">Soft accent glow</MenuItem>, <MenuItem key="none" value="none">None</MenuItem>, <MenuItem key="border" value="border">Simple border</MenuItem>, <MenuItem key="corners" value="corners">Corner accents</MenuItem>, <MenuItem key="dots" value="dots">Subtle dots</MenuItem>]}
            </TextField>
        </Stack>{key.endsWith('Color') && <Box sx={{ pl: onSelect ? 6 : 0 }}><Typography variant="caption" color="text.secondary">{value[key]}</Typography></Box>}</Grid>)}
    </Grid>;
}
