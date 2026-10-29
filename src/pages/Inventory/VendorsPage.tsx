import React from 'react';
import { Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material';
import { Archive, History, Pencil, Plus, RotateCcw, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import type { RequestVendor } from '../../lib/inventoryRequestExports';

const fresh = (): RequestVendor => ({ id: '', name: '', phone: '', cnic: '', address: '', version: 0 });
export default function VendorsPage() {
    const [vendors, setVendors] = React.useState<RequestVendor[]>([]);
    const [total, setTotal] = React.useState(0);
    const [page, setPage] = React.useState(0);
    const [pageSize, setPageSize] = React.useState(25);
    const [query, setQuery] = React.useState('');
    const [search, setSearch] = React.useState('');
    const [includeArchived, setIncludeArchived] = React.useState(false);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [notice, setNotice] = React.useState('');
    const [editing, setEditing] = React.useState<RequestVendor | null>(null);
    const [saveError, setSaveError] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [refresh, setRefresh] = React.useState(0);
    React.useEffect(() => { const timer = setTimeout(() => { setSearch(query); setPage(0); }, 300); return () => clearTimeout(timer); }, [query]);
    React.useEffect(() => {
        let active = true;
        setLoading(true); setError('');
        api.get<{ vendors: RequestVendor[]; total: number }>('/inventory-requests/vendor-directory', { params: { page, pageSize, q: search, includeArchived } })
            .then(({ data }) => { if (active) { setVendors(data.vendors); setTotal(data.total); } })
            .catch(() => { if (active) setError('Unable to load vendors. Please retry.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [page, pageSize, search, includeArchived, refresh]);
    React.useEffect(() => {
        const reset = () => { setEditing(null); setVendors([]); setPage(0); setQuery(''); setSearch(''); setNotice(''); setRefresh(value => value + 1); };
        window.addEventListener('itemhive-workspace-changed', reset);
        return () => window.removeEventListener('itemhive-workspace-changed', reset);
    }, []);
    const persist = async (vendor: RequestVendor) => {
        const body = { name: vendor.name.trim(), phone: vendor.phone, cnic: vendor.cnic || '', address: vendor.address, version: vendor.version || 0, archived: vendor.archived || false };
        if (vendor.id) await api.put(`/inventory-requests/vendor-directory/${encodeURIComponent(vendor.id)}`, body);
        else await api.post('/inventory-requests/vendor-directory', body);
    };
    const save = async (event: React.FormEvent) => {
        event.preventDefault(); if (!editing) return;
        setSaving(true); setSaveError('');
        try { await persist(editing); setEditing(null); setNotice('Vendor saved.'); setRefresh(value => value + 1); }
        catch (failure) { const data = (failure as { response?: { data?: { message?: string; details?: string } } }).response?.data; setSaveError(data?.details || data?.message || 'Unable to save vendor.'); }
        finally { setSaving(false); }
    };
    const archive = async (vendor: RequestVendor) => {
        setSaving(true); setError('');
        try { await persist({ ...vendor, archived: !vendor.archived }); setNotice(vendor.archived ? 'Vendor restored.' : 'Vendor archived. Previous orders remain in Vendor History.'); setPage(0); setRefresh(value => value + 1); }
        catch (failure) { setError((failure as { response?: { data?: { message?: string } } }).response?.data?.message || 'Unable to update vendor.'); }
        finally { setSaving(false); }
    };
    return <Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} sx={{ mb: 3 }}><Box><Typography variant="h4" fontWeight={800}>Vendors</Typography><Typography variant="body2" color="text.secondary">Manage vendor contact details for your inventory orders.</Typography></Box><Button variant="contained" startIcon={<Plus size={18} />} onClick={() => { setSaveError(''); setEditing(fresh()); }}>Add Vendor</Button></Stack>
        {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
        {error && <Alert severity="error" action={<Button onClick={() => setRefresh(value => value + 1)}>Retry</Button>} sx={{ mb: 2 }}>{error}</Alert>}
        <Card sx={{ borderRadius: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} justifyContent="space-between" sx={{ p: 2.5 }}><TextField size="small" label="Search name, phone, CNIC or address" value={query} onChange={event => setQuery(event.target.value)} sx={{ flex: 1, maxWidth: 500 }} /><FormControlLabel control={<Switch checked={includeArchived} onChange={(_, value) => { setIncludeArchived(value); setPage(0); }} />} label="Include archived" /></Stack>
            {loading ? <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={30} /></Box> : <TableContainer><Table sx={{ minWidth: 760 }}><TableHead><TableRow>{['Vendor', 'Contact number', 'CNIC', 'Address / Details', 'Actions'].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
                {vendors.map(vendor => <TableRow key={vendor.id}><TableCell><Typography fontWeight={700}>{vendor.name}</Typography>{vendor.archived && <Chip size="small" label="Archived" />}</TableCell><TableCell>{vendor.phone || '-'}</TableCell><TableCell>{vendor.cnic || '-'}</TableCell><TableCell sx={{ maxWidth: 300, overflowWrap: 'anywhere' }}>{vendor.address || '-'}</TableCell><TableCell><Stack direction="row" useFlexGap flexWrap="wrap" gap={0.5}>
                    <Button size="small" startIcon={<Pencil size={15} />} disabled={saving} onClick={() => { setSaveError(''); setEditing(vendor); }}>Edit</Button>
                    <Button size="small" component={Link} to={`/vendor-history?vendorId=${encodeURIComponent(vendor.id)}&vendorName=${encodeURIComponent(vendor.name)}`} startIcon={<History size={15} />}>History</Button>
                    <Button size="small" color={vendor.archived ? 'primary' : 'warning'} startIcon={vendor.archived ? <RotateCcw size={15} /> : <Archive size={15} />} disabled={saving} onClick={() => void archive(vendor)}>{vendor.archived ? 'Restore' : 'Archive'}</Button>
                </Stack></TableCell></TableRow>)}
                {!vendors.length && <TableRow><TableCell colSpan={5}><Typography align="center" color="text.secondary" sx={{ py: 3 }}>No vendors found. Add a vendor or adjust your search.</Typography></TableCell></TableRow>}
            </TableBody></Table></TableContainer>}
            <TablePagination component="div" count={total} page={page} rowsPerPage={pageSize} rowsPerPageOptions={[10, 25, 50, 100]} onPageChange={(_, value) => setPage(value)} onRowsPerPageChange={event => { setPageSize(Number(event.target.value)); setPage(0); }} />
        </Card>
        <Dialog open={Boolean(editing)} fullWidth maxWidth="sm" onClose={() => { if (!saving) setEditing(null); }}><Box component="form" onSubmit={save}>
            <DialogTitle>{editing?.id ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle><DialogContent dividers><Stack spacing={2}>
                {saveError && <Alert severity="error">{saveError}</Alert>}
                <Grid container spacing={2}>{(['name', 'phone', 'cnic', 'address'] as const).map(field => <Grid key={field} size={{ xs: 12, sm: field === 'name' || field === 'address' ? 12 : 6 }}><TextField fullWidth required={field === 'name'} disabled={saving} label={{ name: 'Vendor name', phone: 'Contact number', cnic: 'CNIC (optional)', address: 'Address / Details' }[field]} value={editing?.[field] || ''} onChange={event => setEditing(current => current ? { ...current, [field]: event.target.value } : null)} slotProps={{ htmlInput: { maxLength: { name: 120, phone: 60, cnic: 15, address: 500 }[field], ...(field === 'cnic' ? { pattern: '(\\d{13}|\\d{5}-\\d{7}-\\d)' } : {}) } }} placeholder={field === 'cnic' ? '12345-1234567-1' : undefined} /></Grid>)}</Grid>
            </Stack></DialogContent><DialogActions><Button disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" variant="contained" disabled={saving} startIcon={<Save size={16} />}>{saving ? 'Saving...' : 'Save Vendor'}</Button></DialogActions>
        </Box></Dialog>
    </Box>;
}
