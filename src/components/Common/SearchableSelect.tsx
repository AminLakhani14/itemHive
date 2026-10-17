import React from 'react';
import { Box, ButtonBase, FormControl, FormHelperText, InputAdornment, MenuItem, MenuList, Popover, TextField, Typography } from '@mui/material';
import { ChevronDown, Search } from 'lucide-react';

export interface SelectOption { value: string; label: string }

interface SearchableSelectProps {
    label: string;
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
    disabled?: boolean;
    required?: boolean;
    helperText?: string;
}

// Keep the selected location on a button. The only editable input is a search
// box in a portaled menu, outside the client form and its autofill context.
export default function SearchableSelect({ label, value, options, onChange, disabled, required, helperText }: SearchableSelectProps) {
    const id = React.useId();
    const [anchor, setAnchor] = React.useState<HTMLButtonElement | null>(null);
    const [query, setQuery] = React.useState('');
    const listRef = React.useRef<HTMLUListElement>(null);
    const selected = options.find((option) => option.value === value);
    const open = Boolean(anchor);
    const filtered = React.useMemo(() => {
        const search = query.trim().toLocaleLowerCase();
        return search ? options.filter((option) => option.label.toLocaleLowerCase().includes(search)) : options;
    }, [options, query]);
    const visible = filtered.slice(0, 100);
    const showMenu = (button: HTMLButtonElement) => { setQuery(''); setAnchor(button); };

    return <FormControl fullWidth disabled={disabled} required={required}>
        <Box sx={{ position: 'relative' }}>
            <Box id={`${id}-label`} component="span" sx={{
                position: 'absolute', pointerEvents: 'none', zIndex: 1,
                left: 14, top: selected || open ? -9 : 10,
                px: selected || open ? 0.5 : 0,
                bgcolor: selected || open ? 'background.paper' : 'transparent',
                fontSize: selected || open ? '0.75rem' : '1rem',
                color: disabled ? 'text.disabled' : open ? 'primary.main' : 'text.secondary',
            }}>{label}{required ? ' *' : ''}</Box>
            <ButtonBase component="button" type="button" role="combobox" disabled={disabled}
                aria-labelledby={`${id}-label${selected ? ` ${id}-value` : ''}`}
                aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? `${id}-options` : undefined}
                aria-required={required} aria-describedby={helperText ? `${id}-helper` : undefined}
                onClick={(event) => showMenu(event.currentTarget)}
                onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); showMenu(event.currentTarget); } }}
                sx={{
                    width: '100%', minHeight: 40, px: 1.75, py: 1, borderRadius: 1,
                    justifyContent: 'space-between', textAlign: 'left', gap: 1,
                    bgcolor: 'action.hover', border: '1px solid',
                    borderColor: open ? 'primary.main' : 'divider',
                    outline: open ? '1px solid' : undefined, outlineColor: 'primary.main',
                    '&:hover': { borderColor: 'text.primary' },
                    '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' },
                }}>
                <Box id={`${id}-value`} component="span" sx={{ minHeight: 22, color: disabled ? 'text.disabled' : 'text.primary' }}>{selected?.label || '\u00a0'}</Box>
                <ChevronDown size={16} aria-hidden style={{ flexShrink: 0 }} />
            </ButtonBase>
        </Box>
        {helperText && <FormHelperText id={`${id}-helper`}>{helperText}</FormHelperText>}
        <Popover open={open} anchorEl={anchor} onClose={() => setAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{ paper: { sx: { mt: 0.5, width: anchor?.clientWidth || 320, maxWidth: 'calc(100vw - 32px)', borderRadius: 2 } } }}>
            <Box sx={{ p: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
                <TextField autoFocus fullWidth size="small" type="search" value={query}
                    placeholder="Type to search…" autoComplete="off"
                    inputProps={{ 'aria-label': 'Search options', autoComplete: 'off', autoCorrect: 'off', autoCapitalize: 'none', spellCheck: false, 'data-lpignore': 'true', 'data-1p-ignore': 'true', 'data-form-type': 'other' }}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); listRef.current?.querySelector<HTMLElement>('[role="option"]')?.focus(); } }}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} />
            </Box>
            <MenuList ref={listRef} id={`${id}-options`} role="listbox" aria-label={label} sx={{ maxHeight: 280, overflowY: 'auto', py: 0.5 }}>
                {visible.map((option) => <MenuItem key={option.value} role="option" selected={option.value === value} aria-selected={option.value === value}
                    onClick={() => { onChange(option.value); setAnchor(null); }}>{option.label}</MenuItem>)}
            </MenuList>
            {!visible.length && <Typography color="text.secondary" variant="body2" sx={{ px: 2, pb: 2 }}>No matching options.</Typography>}
            {filtered.length > visible.length && <Typography color="text.secondary" variant="caption" sx={{ display: 'block', px: 2, py: 1 }}>Type to narrow down {filtered.length.toLocaleString()} results.</Typography>}
        </Popover>
    </FormControl>;
}
