import React from 'react';
import axios from 'axios';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    List,
    ListItemButton,
    ListItemText,
    Paper,
    Snackbar,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { CheckCheck, Search, ShieldCheck, ShieldOff } from 'lucide-react';
import api from '../../api/axios';
import type { User } from '../../features/auth/authSlice';
import {
    ALL_ADMIN_SCREEN_KEYS,
    type ScreenPermission,
} from '../../lib/screenPermissions';
import ScreenPermissionPicker from '../../components/Common/ScreenPermissionPicker';

interface ApiErrorResponse {
    message?: string;
    details?: string;
}

const getErrorMessage = (error: unknown) => {
    if (!axios.isAxiosError<ApiErrorResponse>(error)) return 'Unable to update permissions right now.';
    return error.response?.data?.message || error.response?.data?.details || 'Unable to update permissions right now.';
};

const PermissionManagementPage: React.FC = () => {
    const [admins, setAdmins] = React.useState<User[]>([]);
    const [selectedAdminId, setSelectedAdminId] = React.useState('');
    const [selectedPermissions, setSelectedPermissions] = React.useState<ScreenPermission[]>([]);
    const [search, setSearch] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');
    const [success, setSuccess] = React.useState('');

    const selectedAdmin = admins.find((admin) => admin.id === selectedAdminId);

    const chooseAdmin = React.useCallback((admin: User) => {
        setSelectedAdminId(admin.id);
        setSelectedPermissions(admin.screenPermissions == null ? [...ALL_ADMIN_SCREEN_KEYS]
            : [...new Set<ScreenPermission>([
                ...admin.screenPermissions,
                ...((admin.screenPermissionsVersion ?? 1) < 2 ? ['expenses', 'my_payroll'] as const : []),
                ...((admin.screenPermissionsVersion ?? 1) < 3 ? ['organization'] as const : []),
            ])]);
        setError('');
    }, []);

    React.useEffect(() => {
        const loadAdmins = async () => {
            setLoading(true);
            setError('');
            try {
                const response = await api.get<User[]>('/users/admin-permissions');
                const nextAdmins = response.data || [];
                setAdmins(nextAdmins);
                if (nextAdmins.length) chooseAdmin(nextAdmins[0]);
            } catch (requestError) {
                setError(getErrorMessage(requestError));
            } finally {
                setLoading(false);
            }
        };
        loadAdmins();
    }, [chooseAdmin]);

    const filteredAdmins = admins.filter((admin) =>
        `${admin.name} ${admin.email} ${admin.businessName || ''}`.toLowerCase().includes(search.trim().toLowerCase())
    );

    const savePermissions = async () => {
        if (!selectedAdmin) return;
        setSaving(true);
        setError('');
        try {
            const response = await api.patch<{ user: User }>(`/users/${selectedAdmin.id}/permissions`, {
                screenPermissions: selectedPermissions,
            });
            const updatedUser = response.data.user;
            setAdmins((current) => current.map((admin) => admin.id === updatedUser.id ? { ...admin, ...updatedUser } : admin));
            setSuccess(`Permissions saved for ${selectedAdmin.name}.`);
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box>
            <Snackbar open={Boolean(success)} autoHideDuration={2800} onClose={() => setSuccess('')} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
                <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>
            </Snackbar>

            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
                <Box>
                    <Stack direction="row" spacing={1.2} alignItems="center">
                        <ShieldCheck size={30} />
                        <Typography variant="h4" fontWeight={900}>Permission Management</Typography>
                    </Stack>
                    <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                        Choose exactly which screens each Admin can open. Super Admin access is never restricted.
                    </Typography>
                </Box>
                {selectedAdmin && (
                    <Button variant="contained" onClick={savePermissions} disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <ShieldCheck size={17} />}>
                        {saving ? 'Saving...' : 'Save Permissions'}
                    </Button>
                )}
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 0.34fr) minmax(0, 1fr)' }, gap: 2.5 }}>
                <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
                    <Box sx={{ p: 2 }}>
                        <Typography fontWeight={900}>Admin accounts</Typography>
                        <TextField
                            fullWidth
                            size="small"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search Admin or business"
                            sx={{ mt: 1.5 }}
                            InputProps={{ startAdornment: <Search size={17} style={{ marginRight: 8 }} /> }}
                        />
                    </Box>
                    <Divider />
                    {loading ? (
                        <Box sx={{ py: 7, textAlign: 'center' }}><CircularProgress size={28} /></Box>
                    ) : (
                        <List disablePadding sx={{ maxHeight: 560, overflowY: 'auto' }}>
                            {filteredAdmins.map((admin) => (
                                <ListItemButton key={admin.id} selected={admin.id === selectedAdminId} onClick={() => chooseAdmin(admin)} sx={{ px: 2, py: 1.4 }}>
                                    <ListItemText
                                        primary={admin.name}
                                        secondary={`${admin.email}${admin.businessName ? ` · ${admin.businessName}` : ''}`}
                                        primaryTypographyProps={{ fontWeight: 800 }}
                                        secondaryTypographyProps={{ noWrap: true }}
                                    />
                                    <Chip
                                        size="small"
                                        color={admin.screenPermissions == null ? 'default' : 'primary'}
                                        label={admin.screenPermissions == null ? 'Full' : admin.screenPermissions.length}
                                    />
                                </ListItemButton>
                            ))}
                            {!filteredAdmins.length && (
                                <Box sx={{ px: 2, py: 5, textAlign: 'center', color: 'text.secondary' }}>
                                    No Admin accounts found.
                                </Box>
                            )}
                        </List>
                    )}
                </Paper>

                <Paper variant="outlined" sx={{ borderRadius: 3, p: { xs: 2, md: 3 } }}>
                    {!selectedAdmin ? (
                        <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 320, color: 'text.secondary' }}>
                            <ShieldOff size={38} />
                            <Typography sx={{ mt: 1 }}>Select an Admin to manage access.</Typography>
                        </Stack>
                    ) : (
                        <>
                            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.5} alignItems={{ sm: 'center' }}>
                                <Box>
                                    <Typography variant="h6" fontWeight={900}>{selectedAdmin.name}</Typography>
                                    <Typography variant="body2" color="text.secondary">{selectedAdmin.email} · {selectedAdmin.businessName || 'No business assigned'}</Typography>
                                </Box>
                                <Stack direction="row" spacing={1}>
                                    <Button size="small" startIcon={<CheckCheck size={16} />} onClick={() => setSelectedPermissions([...ALL_ADMIN_SCREEN_KEYS])}>Allow all</Button>
                                    <Button size="small" color="inherit" startIcon={<ShieldOff size={16} />} onClick={() => setSelectedPermissions([])}>Clear all</Button>
                                </Stack>
                            </Stack>
                            <Alert severity="info" sx={{ my: 2.5 }}>
                                Selected screens take priority over separate account access settings. Unselected screens are denied in direct routes and protected API requests.
                            </Alert>
                            <ScreenPermissionPicker value={selectedPermissions} onChange={setSelectedPermissions} disabled={saving} />
                        </>
                    )}
                </Paper>
            </Box>
        </Box>
    );
};

export default PermissionManagementPage;

