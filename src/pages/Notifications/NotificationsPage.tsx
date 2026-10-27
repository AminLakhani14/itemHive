import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { notificationTarget } from '../../lib/notifications';
import { isAxiosError } from 'axios';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Grid,
    Stack,
    Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { Bell, CalendarClock, CircleDollarSign, ClipboardList, History, Package2, RefreshCw } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import type { RootState } from '../../store';
import { buildNotifications, type InstallmentNotificationPlan, type NotificationItem } from '../../lib/notifications';
import { hasScreenAccess } from '../../lib/screenPermissions';
import { useWorkflowNotifications } from '../../lib/workflowNotifications';

const iconByCategory = {
    installment: CalendarClock,
    order: ClipboardList,
    stock: Package2,
    transaction: History,
    billing: CircleDollarSign,
    payroll: CircleDollarSign,
    expense: ClipboardList,
    finance: CircleDollarSign,
};

const colorBySeverity = {
    warning: 'warning.main',
    success: 'success.main',
    info: 'info.main',
} as const;

const NotificationsPage: React.FC = () => {
    const theme = useTheme();
    const navigate = useNavigate();
    const { orders } = useSelector((state: RootState) => state.orders);
    const { transactions } = useSelector((state: RootState) => state.transactions);
    const { products } = useSelector((state: RootState) => state.inventory);
    const { notifications } = useSelector((state: RootState) => state.settings);
    const { app } = useSelector((state: RootState) => state.settings);
    const user = useSelector((state: RootState) => state.auth.user);
    const workflow = useWorkflowNotifications();
    const canInstallments = hasScreenAccess(user, 'notifications') && hasScreenAccess(user, 'installments') && (user?.role === 'super_admin' || !!(app.installmentsEnabled && user?.installmentAccess));
    const [installmentPlans, setInstallmentPlans] = useState<InstallmentNotificationPlan[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('all');
    const installmentGeneration = React.useRef(0);
    const cancelInstallmentRequests = useCallback(() => { installmentGeneration.current++; }, []);

    const loadInstallmentPlans = useCallback(async () => {
        const generation = ++installmentGeneration.current;
        setInstallmentPlans([]);
        if (!canInstallments) { setLoading(false); setError(''); return; }
        setLoading(true);
        setError('');
        try {
            const response = await api.get('/installments');
            if (generation === installmentGeneration.current) setInstallmentPlans(response.data || []);
        } catch (fetchError: unknown) {
            if (generation === installmentGeneration.current) setError(isAxiosError(fetchError) ? fetchError.response?.data?.message || 'Unable to load installment notifications.' : 'Unable to load installment notifications.');
        } finally {
            if (generation === installmentGeneration.current) setLoading(false);
        }
    }, [canInstallments]);

    useEffect(() => {
        loadInstallmentPlans();
        const refresh = () => loadInstallmentPlans();
        window.addEventListener('itemhive-installments-updated', refresh);
        window.addEventListener('itemhive-workspace-changed', refresh);
        return () => { cancelInstallmentRequests(); window.removeEventListener('itemhive-installments-updated', refresh); window.removeEventListener('itemhive-workspace-changed', refresh); };
    }, [loadInstallmentPlans, user?.id, user?.businessId, cancelInstallmentRequests]);

    const allNotifications = useMemo(
        () =>
            [...workflow.items, ...buildNotifications({
                installmentPlans,
                orders: hasScreenAccess(user, 'notifications') && hasScreenAccess(user, 'orders') ? orders : [],
                transactions: hasScreenAccess(user, 'notifications') && hasScreenAccess(user, 'transactions') ? transactions : [],
                products: hasScreenAccess(user, 'notifications') && hasScreenAccess(user, 'inventory') ? products : [],
                orderUpdatesEnabled: notifications.orderUpdates,
                lowStockAlertsEnabled: notifications.lowStockAlerts,
            })].sort((a, b) => Number(Boolean(b.requiresAction)) - Number(Boolean(a.requiresAction)) || b.sortTime - a.sortTime),
        [installmentPlans, notifications.lowStockAlerts, notifications.orderUpdates, orders, products, transactions, workflow.items, user]
    );

    const summary = useMemo(
        () => ({
            total: allNotifications.length,
            action: allNotifications.filter((item) => item.requiresAction).length,
            payroll: allNotifications.filter((item) => item.category === 'payroll').length,
            finance: allNotifications.filter((item) => ['expense', 'finance'].includes(item.category)).length,
        }),
        [allNotifications]
    );
    const visibleNotifications = allNotifications.filter(n => filter === 'all' || (filter === 'action' ? n.requiresAction : filter === 'unread' ? !workflow.read.includes(n.id) : n.category === filter));

    return (
        <Box>
            <Card
                sx={{
                    borderRadius: 4,
                    mb: 3,
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: alpha(theme.palette.primary.main, 0.18),
                    background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.12)} 0%, ${alpha(theme.palette.info.main, 0.08)} 45%, ${alpha(theme.palette.background.paper, 1)} 100%)`,
                }}
            >
                <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
                        <Box>
                            <Typography variant="h4" fontWeight={800} gutterBottom>
                                Notifications Center
                            </Typography>
                            <Typography color="text.secondary" sx={{ maxWidth: 720 }}>
                                Check approvals, payments and business updates. Items that need action appear first.
                            </Typography>
                        </Box>
                        <Button variant="contained" startIcon={<RefreshCw size={16} />} onClick={() => { void loadInstallmentPlans(); void workflow.refresh(); }} disabled={loading || workflow.loading}>
                            Refresh
                        </Button>
                    </Stack>
                </CardContent>
            </Card>

            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, md: 3 }}>
                    <Card sx={{ borderRadius: 3 }}>
                        <CardContent>
                            <Typography variant="overline" color="text.secondary">Total Notifications</Typography>
                            <Typography variant="h4" fontWeight={800}>{summary.total}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <Card sx={{ borderRadius: 3 }}>
                        <CardContent>
                            <Typography variant="overline" color="text.secondary">Needs action</Typography>
                            <Typography variant="h4" fontWeight={800} color="warning.main">{summary.action}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <Card sx={{ borderRadius: 3 }}>
                        <CardContent>
                            <Typography variant="overline" color="text.secondary">Payroll</Typography>
                            <Typography variant="h4" fontWeight={800}>{summary.payroll}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <Card sx={{ borderRadius: 3 }}>
                        <CardContent>
                            <Typography variant="overline" color="text.secondary">Expenses & finance</Typography>
                            <Typography variant="h4" fontWeight={800}>{summary.finance}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {error && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            {workflow.error && <Alert severity="error" sx={{ mb: 3 }} action={<Button onClick={() => void workflow.refresh()}>Retry</Button>}>{workflow.error}</Alert>}
            <Card sx={{ borderRadius: 4 }}>
                <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mb: 2 }}>
                        <Box>
                            <Typography variant="h6" fontWeight={800}>All Notifications</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Pending work first. Recent updates cover the last 30 days.
                            </Typography>
                        </Box>
                        {(loading || workflow.loading) && <CircularProgress size={20} />}
                        <Button size="small" disabled={!allNotifications.some(n => !workflow.read.includes(n.id))} onClick={() => workflow.markRead(allNotifications.map(n => n.id))}>Mark all read</Button>
                    </Stack>
                    <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1} sx={{ mb: 2 }}>
                        {([['all', 'All'], ['action', 'Needs action'], ['unread', 'Unread'], ['payroll', 'Payroll'], ['expense', 'Expenses'], ['finance', 'Finance']] as const).map(([value, label]) => <Chip key={value} label={label} color={filter === value ? 'primary' : 'default'} variant={filter === value ? 'filled' : 'outlined'} onClick={() => setFilter(value)} />)}
                    </Stack>

                    {visibleNotifications.length === 0 ? (
                        <Box
                            sx={{
                                py: 6,
                                px: 3,
                                textAlign: 'center',
                                borderRadius: 3,
                                bgcolor: alpha(theme.palette.primary.main, 0.04),
                                border: '1px dashed',
                                borderColor: alpha(theme.palette.primary.main, 0.18),
                            }}
                        >
                            <Bell size={28} color={theme.palette.text.secondary} />
                            <Typography variant="h6" fontWeight={700} sx={{ mt: 1.5 }}>
                                {loading || workflow.loading ? 'Loading notifications...' : 'No notifications here'}
                            </Typography>
                            <Typography color="text.secondary">
                                Approval requests, decisions and payment updates will appear here when they are available.
                            </Typography>
                        </Box>
                    ) : (
                        <Stack spacing={1.5}>
                            {visibleNotifications.map((notification: NotificationItem) => {
                                const Icon = iconByCategory[notification.category];
                                return (
                                    <Card
                                        key={notification.id}
                                        variant="outlined"
                                        sx={{
                                            borderRadius: 3,
                                            borderColor: alpha(theme.palette.divider, 0.6),
                                            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                            '&:hover': {
                                                transform: 'translateY(-2px)',
                                                boxShadow: theme.shadows[3],
                                            },
                                        }}
                                    >
                                        <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                                            <Box
                                                sx={{
                                                    width: 44,
                                                    height: 44,
                                                    borderRadius: 2.5,
                                                    display: 'grid',
                                                    placeItems: 'center',
                                                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                                                    color: colorBySeverity[notification.severity],
                                                    flexShrink: 0,
                                                }}
                                            >
                                                <Icon size={20} />
                                            </Box>
                                            <Box sx={{ flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" sx={{ mb: 0.5 }}>
                                                    <Typography variant="subtitle1" fontWeight={workflow.read.includes(notification.id) ? 500 : 800}>
                                                        {notification.title}
                                                    </Typography>
                                                    <Chip
                                                        size="small"
                                                        color={notification.requiresAction ? 'warning' : 'default'}
                                                        label={notification.requiresAction ? 'Needs action' : notification.category}
                                                        sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, textTransform: 'capitalize' }}
                                                    />
                                                </Stack>
                                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                                    {notification.detail}
                                                </Typography>
                                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {notification.time}
                                                    </Typography>
                                                    {notification.path && (
                                                        <Button size="small" onClick={() => { workflow.markRead([notification.id]); navigate(notificationTarget(notification)!); }}>
                                                            Open
                                                        </Button>
                                                    )}
                                                </Stack>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </Stack>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
};

export default NotificationsPage;
