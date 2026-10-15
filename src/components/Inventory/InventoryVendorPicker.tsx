import React from 'react';
import { Autocomplete, Box, Button, TextField, Typography } from '@mui/material';
import api from '../../api/axios';
import type { RequestVendor } from '../../lib/inventoryRequestExports';

export default function InventoryVendorPicker({ value, onChange, disabled, includeArchived = false, required = false }: {
    value: RequestVendor | null; onChange: (vendor: RequestVendor | null) => void; disabled?: boolean; includeArchived?: boolean; required?: boolean;
}) {
    const [query, setQuery] = React.useState('');
    const [options, setOptions] = React.useState<RequestVendor[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [retry, setRetry] = React.useState(0);
    React.useEffect(() => {
        const reset = () => { setQuery(''); setOptions([]); setError(''); setRetry(value => value + 1); };
        window.addEventListener('itemhive-workspace-changed', reset);
        return () => window.removeEventListener('itemhive-workspace-changed', reset);
    }, []);
    React.useEffect(() => {
        let active = true;
        const timer = setTimeout(() => {
            setLoading(true); setError('');
            api.get<{ vendors: RequestVendor[] }>('/inventory-requests/vendor-directory', { params: { q: query, page: 0, pageSize: 25, includeArchived } })
                .then(({ data }) => { if (active) setOptions(data.vendors); })
                .catch(() => { if (active) setError('Unable to search vendors.'); })
                .finally(() => { if (active) setLoading(false); });
        }, 250);
        return () => { active = false; clearTimeout(timer); };
    }, [query, includeArchived, retry]);
    const choices = value && !options.some(vendor => vendor.id === value.id) ? [value, ...options] : options;
    return <Box>
        <Autocomplete size="small" disabled={disabled} options={choices} value={value} loading={loading} filterOptions={values => values} isOptionEqualToValue={(option, selected) => option.id === selected.id} getOptionLabel={vendor => vendor.name} onInputChange={(_, text, reason) => { if (reason === 'input') setQuery(text); if (reason === 'clear') setQuery(''); }} onChange={(_, vendor) => { onChange(vendor); setQuery(''); }} noOptionsText="No vendors found. Add vendors from the Vendors screen." renderOption={(props, vendor) => <li {...props} key={vendor.id}><Box><Typography variant="body2">{vendor.name}{vendor.archived ? ' (Archived)' : ''}</Typography><Typography variant="caption" color="text.secondary">{[vendor.phone, vendor.cnic].filter(Boolean).join(' / ')}</Typography></Box></li>} renderInput={params => <TextField {...params} label={includeArchived ? 'Filter by vendor' : 'Vendor'} required={required} error={Boolean(error)} helperText={error || 'Search by name, phone or CNIC.'} />} />
        {error && <Button size="small" onClick={() => setRetry(current => current + 1)}>Retry vendor search</Button>}
    </Box>;
}
