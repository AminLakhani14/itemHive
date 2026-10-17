import React from 'react';
import {
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    Box,
    Avatar,
    Menu,
    MenuItem,
    Tooltip,
    Badge,
    Button,
    TextField,
    Chip
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
    Menu as MenuIcon,
    Bell as NotificationsIcon,
    UserCircle2,
    Settings,
    Palette,
    LogOut,
    Sparkles,
    ChevronRight,
    Building2,
    Pin
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { logout } from '../../features/auth/authSlice';
import { fetchProducts, resetInventory } from '../../features/inventory/inventorySlice';
import { resetTransactions } from '../../features/transactions/transactionSlice';
import { BRANCH_STORAGE_KEY, resetBranches } from '../../features/branch/branchSlice';
import BranchSwitcher from './BranchSwitcher';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { buildNotifications, type InstallmentNotificationPlan, type NotificationItem } from '../../lib/notifications';
import type { AppDispatch } from '../../store';
import { hasInstallmentAccess, hasScreenAccess } from '../../lib/screenPermissions';
import { useLogoPlate } from '../../lib/logoVisibility';

interface NavbarProps {
    onMenuClick: () => void;
}

interface WorkspaceOption {
    id: string;
    name: string;
    email: string;
    role: string;
    businessId: string;
    businessName?: string;
}

const formatRoleLabel = (role?: string) =>
    role === 'super_admin' ? 'Super Admin' : role === 'admin' ? 'Administrator' : 'Team User';

const Navbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
    const dispatch = useDispatch<AppDispatch>();
    const navigate = useNavigate();
    const location = useLocation();
    const theme = useTheme();
    const { user } = useSelector((state: RootState) => state.auth);
    const navbarFontColor = useSelector((state: RootState) => {
        const preview = state.themePreview.value;
        return (preview && preview.userId === state.auth.user?.id
            ? preview.appearance.navbarFontColor
            : state.auth.user?.appearance?.navbarFontColor) || '';
    });
    const navbarColor = useSelector((state: RootState) => {
        const preview = state.themePreview.value;
        return (preview && preview.userId === state.auth.user?.id
            ? preview.appearance.navbarColor
            : state.auth.user?.appearance?.navbarColor) || '';
    });
    const logo = useSelector((state: RootState) => {
        const preview = state.themePreview.value;
        return (preview && preview.userId === state.auth.user?.id
            ? preview.appearance.logo
            : state.auth.user?.appearance?.logo) || '/favicon.png';
    });
    const logoPlate = useLogoPlate(logo, navbarColor || theme.palette.background.paper, [theme.palette.background.default]);
    const { isSidebarCollapsed } = useSelector((state: RootState) => state.theme);
    const { transactions } = useSelector((state: RootState) => state.transactions);
    const { orders } = useSelector((state: RootState) => state.orders);
    const { products } = useSelector((state: RootState) => state.inventory);
    const { notifications, app } = useSelector((state: RootState) => state.settings);
    const canAccessInstallments = hasInstallmentAccess(user, app?.installmentsEnabled)
        && hasScreenAccess(user, 'notifications');
    const canAccessNotes = hasScreenAccess(user, 'notes');
    const canAccessNotifications = hasScreenAccess(user, 'notifications');
    const canAccessSettings = hasScreenAccess(user, 'settings');
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const [notifAnchorEl, setNotifAnchorEl] = React.useState<null | HTMLElement>(null);
    const [installmentPlans, setInstallmentPlans] = React.useState<InstallmentNotificationPlan[]>([]);
    const [monthlyPaymentAlerts, setMonthlyPaymentAlerts] = React.useState<Array<{ businessId: string; businessName: string }>>([]);
    const [workspaceOptions, setWorkspaceOptions] = React.useState<WorkspaceOption[]>([]);
    const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState(() => localStorage.getItem('itemhive-workspace-id') || '');
    const [selectedWorkspaceUserId, setSelectedWorkspaceUserId] = React.useState(() => localStorage.getItem('itemhive-workspace-user-id') || '');
    const roleLabel = formatRoleLabel(user?.role);

    const drawerWidth = 260;
    const collapsedWidth = 80;
    const currentWidth = isSidebarCollapsed ? collapsedWidth : drawerWidth;

    const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleNotifOpen = (event: React.MouseEvent<HTMLElement>) => {
        setNotifAnchorEl(event.currentTarget);
    };

    const handleNotifClose = () => {
        setNotifAnchorEl(null);
    };

    React.useEffect(() => {
        const loadInstallmentNotifications = async () => {
            if (!canAccessInstallments) {
                setInstallmentPlans([]);
                return;
            }
            try {
                const response = await api.get('/installments');
                setInstallmentPlans((response.data || []) as InstallmentNotificationPlan[]);
            } catch {
                setInstallmentPlans([]);
            }
        };

        loadInstallmentNotifications();
        window.addEventListener('itemhive-installments-updated', loadInstallmentNotifications);
        window.addEventListener('itemhive-branch-changed', loadInstallmentNotifications);
        return () => {
            window.removeEventListener('itemhive-installments-updated', loadInstallmentNotifications);
            window.removeEventListener('itemhive-branch-changed', loadInstallmentNotifications);
        };
    }, [canAccessInstallments, location.pathname]);

    React.useEffect(() => {
        const loadMonthlyPaymentAlerts = async () => {
            try {
                const response = await api.get('/users/monthly-payment-alerts');
                setMonthlyPaymentAlerts(response.data || []);
            } catch {
                setMonthlyPaymentAlerts([]);
            }
        };
        loadMonthlyPaymentAlerts();
        window.addEventListener('itemhive-team-updated', loadMonthlyPaymentAlerts);
        return () => window.removeEventListener('itemhive-team-updated', loadMonthlyPaymentAlerts);
    }, [location.pathname]);

    React.useEffect(() => {
        const loadWorkspaceOptions = async () => {
            if (user?.role !== 'super_admin') {
                setWorkspaceOptions([]);
                return;
            }

            try {
                const response = await api.get('/users', { params: { page: 1, limit: 100 } });
                const users = Array.isArray(response.data) ? response.data : response.data.users || [];
                setWorkspaceOptions(users.filter((entry: WorkspaceOption) => Boolean(entry.businessId)));
            } catch {
                setWorkspaceOptions([]);
            }
        };

        loadWorkspaceOptions();
        window.addEventListener('itemhive-team-updated', loadWorkspaceOptions);
        return () => window.removeEventListener('itemhive-team-updated', loadWorkspaceOptions);
    }, [user?.role]);

    const selectedWorkspace = React.useMemo(
        () => workspaceOptions.find((option) => option.id === selectedWorkspaceUserId && option.businessId === selectedWorkspaceId)
            || workspaceOptions.find((option) => option.businessId === selectedWorkspaceId),
        [selectedWorkspaceId, selectedWorkspaceUserId, workspaceOptions]
    );

    const handleWorkspaceChange = (userId: string) => {
        const option = workspaceOptions.find((entry) => entry.id === userId);
        const businessId = option?.businessId || '';
        // Another workspace has its own branches; it opens in its main branch.
        localStorage.removeItem(BRANCH_STORAGE_KEY);
        setSelectedWorkspaceUserId(option?.id || '');
        setSelectedWorkspaceId(businessId);
        if (businessId) {
            localStorage.setItem('itemhive-workspace-id', businessId);
            localStorage.setItem('itemhive-workspace-user-id', option!.id);
        } else {
            localStorage.removeItem('itemhive-workspace-id');
            localStorage.removeItem('itemhive-workspace-user-id');
        }
        // Remove the previous workspace immediately; do not leave another
        // client's inventory visible while the new tenant request is pending.
        dispatch(resetInventory());
        dispatch(resetTransactions());
        window.dispatchEvent(new Event('itemhive-workspace-changed'));
        dispatch(fetchProducts({ force: true }));
    };

    const allNotifications = React.useMemo(
        () =>
            [
                ...monthlyPaymentAlerts.map((alert) => ({
                    id: `monthly-payment-${alert.businessId}`,
                    title: 'Monthly Payment Overdue',
                    detail: `${alert.businessName} has not completed its monthly payment.`,
                    time: 'Payment overdue',
                    path: '/team',
                    category: 'billing' as const,
                    severity: 'warning' as const,
                    sortTime: Date.now(),
                })),
                ...buildNotifications({
                installmentPlans,
                orders,
                transactions,
                products,
                orderUpdatesEnabled: notifications.orderUpdates,
                lowStockAlertsEnabled: notifications.lowStockAlerts,
                }),
            ],
        [installmentPlans, monthlyPaymentAlerts, notifications.lowStockAlerts, notifications.orderUpdates, orders, products, transactions]
    );

    const recentNotifications = React.useMemo(() => allNotifications.slice(0, 6), [allNotifications]);
    const hasConfigurableNotificationsEnabled = notifications.orderUpdates || notifications.lowStockAlerts;

    const handleLogout = () => {
        localStorage.removeItem(BRANCH_STORAGE_KEY);
        dispatch(resetBranches());
        dispatch(logout());
        navigate('/login');
        handleClose();
    };

    const handleNavigateTo = (path: string) => {
        navigate(path);
        handleClose();
    };

    const isActivePath = (path: string) => location.pathname === path;
    const buildActionItemSx = (isDanger = false, active = false) => ({
        borderRadius: 2,
        mx: 1,
        my: 0.4,
        px: 1.25,
        py: 1,
        minHeight: 42,
        fontWeight: 700,
        color: isDanger ? 'error.main' : 'text.primary',
        border: '1px solid',
        borderColor: active
            ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.45 : 0.26)
            : 'transparent',
        background: active
            ? `linear-gradient(100deg, ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.24 : 0.14)} 0%, ${alpha(theme.palette.secondary.main, theme.palette.mode === 'dark' ? 0.15 : 0.08)} 100%)`
            : 'transparent',
        transition: 'all 180ms ease',
        '& .menu-action-icon': {
            transition: 'transform 180ms ease, color 180ms ease',
        },
        '& .menu-action-arrow': {
            transition: 'transform 180ms ease, opacity 180ms ease',
            opacity: active ? 1 : 0.35,
            color: isDanger ? 'error.main' : 'text.secondary',
        },
        '&:hover': {
            borderColor: isDanger
                ? alpha(theme.palette.error.main, 0.35)
                : alpha(theme.palette.primary.main, 0.28),
            background: isDanger
                ? alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.2 : 0.08)
                : `linear-gradient(100deg, ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.28 : 0.16)} 0%, ${alpha(theme.palette.secondary.main, theme.palette.mode === 'dark' ? 0.18 : 0.1)} 100%)`,
            transform: 'translateX(3px)',
            '& .menu-action-icon': {
                transform: 'scale(1.08)',
                color: isDanger ? theme.palette.error.main : theme.palette.primary.main,
            },
            '& .menu-action-arrow': {
                opacity: 1,
                transform: 'translateX(2px)',
                color: isDanger ? theme.palette.error.main : theme.palette.primary.main,
            },
        },
    });

    return (
        <AppBar
            position="fixed"
            sx={{
                width: { sm: `calc(100% - ${currentWidth}px)` },
                ml: { sm: `${currentWidth}px` },
                backgroundColor: (theme) => navbarColor || alpha(theme.palette.background.paper, 0.8),
                backdropFilter: 'blur(12px)',
                transition: (theme) => theme.transitions.create(['width', 'margin'], {
                    easing: theme.transitions.easing.sharp,
                    duration: theme.transitions.duration.enteringScreen,
                }),
                borderBottom: '1px solid',
                borderColor: 'divider',
                color: navbarFontColor || 'text.primary',
                boxShadow: 'none',
                borderRadius: 0,
            }}
        >
            <Toolbar>
                <IconButton
                    color="inherit"
                    aria-label="open drawer"
                    edge="start"
                    onClick={onMenuClick}
                    sx={{ mr: 2, display: { sm: 'none' } }}
                >
                    <MenuIcon size={20} />
                </IconButton>

                <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
                    <Box
                        sx={{
                            display: { xs: 'flex', sm: isSidebarCollapsed ? 'flex' : 'none' },
                            alignItems: 'center',
                            gap: 1.5
                        }}
                    >
                        <Box
                            component="img"
                            src={logo}
                            alt="Logo"
                            sx={{ width: logo !== '/favicon.png' ? { xs: 140, sm: 116 } : 28, height: logo !== '/favicon.png' ? { xs: 48, sm: 38 } : 28, maxWidth: '100%', objectFit: 'contain', ...(logoPlate && { bgcolor: logoPlate, borderRadius: 1.5, p: 0.5 }) }}
                        />
                        {logo === '/favicon.png' && (
                        <Typography
                            variant="h6"
                            className={navbarFontColor ? undefined : 'gradient-text'}
                            sx={{
                                color: navbarFontColor || undefined,
                                fontWeight: 800,
                                letterSpacing: -1,
                                fontSize: '1.2rem'
                            }}
                        >
                            ItemHive
                        </Typography>
                        )}
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <BranchSwitcher fontColor={navbarFontColor} />
                    {user?.role === 'super_admin' && (
                        <Box
                            sx={{
                                display: { xs: 'none', lg: 'flex' },
                                alignItems: 'center',
                                gap: 1,
                                px: 1,
                                py: 0.6,
                                borderRadius: 999,
                                border: '1px solid',
                                borderColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.34 : 0.18),
                                bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.05),
                                boxShadow: theme.palette.mode === 'dark'
                                    ? `inset 0 1px 0 ${alpha('#fff', 0.04)}`
                                    : `0 10px 28px -22px ${alpha(theme.palette.primary.dark, 0.45)}`,
                            }}
                        >
                            <Building2 size={17} color={theme.palette.primary.main} />
                            <TextField
                                select
                                size="small"
                                value={selectedWorkspace?.id || ''}
                                onChange={(event) => handleWorkspaceChange(event.target.value)}
                                variant="standard"
                                InputProps={{ disableUnderline: true }}
                                SelectProps={{
                                    displayEmpty: true,
                                    renderValue: (value) => {
                                        const option = workspaceOptions.find((entry) => entry.id === value);
                                        return (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                                                <Typography variant="caption" sx={{ fontWeight: 900, color: navbarFontColor || 'text.secondary' }}>
                                                    Viewing
                                                </Typography>
                                                <Typography
                                                    variant="body2"
                                                    title={option ? `${option.name} · ${option.email} · ${option.businessName || 'Workspace'}` : 'Own workspace'}
                                                    sx={{
                                                        fontWeight: 900,
                                                        maxWidth: 160,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {option ? `${option.name} · ${option.businessName || 'Workspace'}` : 'Own workspace'}
                                                </Typography>
                                            </Box>
                                        );
                                    },
                                }}
                                sx={{
                                    minWidth: 230,
                                    '& .MuiInputBase-root, & .MuiSelect-icon': { color: navbarFontColor || 'text.primary' },
                                    '& .MuiInputBase-root': {
                                        fontWeight: 800,
                                        fontSize: 14,
                                    },
                                }}
                            >
                                <MenuItem value="">
                                    <Box sx={{ py: 0.3 }}>
                                        <Typography variant="body2" fontWeight={900}>Own workspace</Typography>
                                        <Typography variant="caption" color="text.secondary">Default super admin view</Typography>
                                    </Box>
                                </MenuItem>
                                {workspaceOptions.map((option) => (
                                    <MenuItem key={option.id} value={option.id}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, width: '100%' }}>
                                            <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontSize: 12, fontWeight: 900 }}>
                                                {option.name.charAt(0).toUpperCase()}
                                            </Avatar>
                                            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                                <Typography variant="body2" fontWeight={900} noWrap>{option.businessName || option.name}</Typography>
                                                <Typography variant="caption" color="text.secondary" noWrap>{option.name} - {option.email}</Typography>
                                            </Box>
                                            <Chip size="small" label={formatRoleLabel(option.role)} sx={{ height: 22, fontWeight: 800 }} />
                                        </Box>
                                    </MenuItem>
                                ))}
                            </TextField>
                            {selectedWorkspace && (
                                <Chip
                                    size="small"
                                    label={formatRoleLabel(selectedWorkspace.role)}
                                    sx={{
                                        height: 24,
                                        fontWeight: 900,
                                        bgcolor: alpha(theme.palette.primary.main, 0.12),
                                        color: 'primary.main',
                                    }}
                                />
                            )}
                        </Box>
                    )}

                    {canAccessNotes && (
                        <Tooltip title="Sticky Notes">
                            <IconButton
                                color={isActivePath('/notes') ? 'primary' : 'inherit'}
                                onClick={() => navigate('/notes')}
                                aria-label="Open sticky notes"
                            >
                                <Pin size={20} />
                            </IconButton>
                        </Tooltip>
                    )}

                    {canAccessNotifications && (
                        <IconButton color="inherit" onClick={handleNotifOpen}>
                            <Badge badgeContent={recentNotifications.length} color="secondary">
                                <NotificationsIcon size={20} />
                            </Badge>
                        </IconButton>
                    )}

                    <Tooltip title="Profile settings">
                        <IconButton onClick={handleMenu} sx={{ p: 0.5, ml: 1 }}>
                            <Avatar
                                src={user?.photoUrl}
                                alt={user?.name}
                                sx={{
                                    width: 35,
                                    height: 35,
                                    bgcolor: 'primary.main',
                                    fontSize: '0.9rem',
                                    fontWeight: 600
                                }}
                            >
                                {user?.name?.charAt(0).toUpperCase()}
                            </Avatar>
                        </IconButton>
                    </Tooltip>

                    <Menu
                        id="menu-appbar"
                        anchorEl={anchorEl}
                        anchorOrigin={{
                            vertical: 'bottom',
                            horizontal: 'right',
                        }}
                        keepMounted
                        transformOrigin={{
                            vertical: 'top',
                            horizontal: 'right',
                        }}
                        open={Boolean(anchorEl)}
                        onClose={handleClose}
                        PaperProps={{
                            elevation: 0,
                            sx: {
                                mt: 1,
                                width: 250,
                                overflow: 'visible',
                                borderRadius: 3,
                                border: '1px solid',
                                borderColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.35 : 0.16),
                                background: `linear-gradient(160deg, ${alpha(theme.palette.background.paper, 0.98)} 0%, ${alpha(theme.palette.background.paper, 0.92)} 100%)`,
                                backdropFilter: 'blur(12px)',
                                boxShadow: theme.palette.mode === 'dark'
                                    ? `0 22px 44px -24px ${alpha('#000', 0.9)}`
                                    : `0 18px 40px -22px ${alpha(theme.palette.primary.dark, 0.36)}`,
                            },
                        }}
                    >
                        <Box
                            sx={{
                                px: 1.2,
                                pt: 1.2,
                                pb: 0.8,
                            }}
                        >
                            <Box
                                sx={{
                                    px: 1.4,
                                    py: 1.15,
                                    borderRadius: 2.2,
                                    border: '1px solid',
                                    borderColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.4 : 0.2),
                                    bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.14 : 0.06),
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1.1,
                                }}
                            >
                                <Sparkles size={16} color={theme.palette.primary.main} />
                                <Box>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.25 }}>
                                        {user?.name}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 0.2 }}>
                                        {roleLabel}
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>
                        <MenuItem onClick={() => handleNavigateTo('/profile')} sx={buildActionItemSx(false, isActivePath('/profile'))}>
                            <UserCircle2 size={18} className="menu-action-icon" />
                            <Box sx={{ flexGrow: 1, ml: 1 }}>Profile</Box>
                            <ChevronRight size={16} className="menu-action-arrow" />
                        </MenuItem>
                        {/* Team users wear their business's theme, so there is nothing for them to set. */}
                        {!user?.themeManaged && (
                            <MenuItem onClick={() => handleNavigateTo('/theme-settings')} sx={buildActionItemSx(false, isActivePath('/theme-settings'))}>
                                <Palette size={18} className="menu-action-icon" />
                                <Box sx={{ flexGrow: 1, ml: 1 }}>Theme Settings</Box>
                                <ChevronRight size={16} />
                            </MenuItem>
                        )}
                        {canAccessSettings && (
                            <MenuItem onClick={() => handleNavigateTo('/settings')} sx={buildActionItemSx(false, isActivePath('/settings'))}>
                                <Settings size={18} className="menu-action-icon" />
                                <Box sx={{ flexGrow: 1, ml: 1 }}>Settings</Box>
                                <ChevronRight size={16} className="menu-action-arrow" />
                            </MenuItem>
                        )}
                        <MenuItem onClick={handleLogout} sx={buildActionItemSx(true, false)}>
                            <LogOut size={18} className="menu-action-icon" />
                            <Box sx={{ flexGrow: 1, ml: 1 }}>Logout</Box>
                            <ChevronRight size={16} className="menu-action-arrow" />
                        </MenuItem>
                    </Menu>

                    <Menu
                        id="menu-notifications"
                        anchorEl={notifAnchorEl}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                        open={Boolean(notifAnchorEl)}
                        onClose={handleNotifClose}
                        PaperProps={{ sx: { width: { xs: 'calc(100vw - 32px)', sm: 320 }, p: 0.5 } }}
                    >
                        <Box sx={{ px: 2, py: 1 }}>
                            <Typography variant="subtitle2">Notifications</Typography>
                            <Typography variant="caption" color="text.secondary">
                                Latest order and stock updates
                            </Typography>
                        </Box>
                        {!hasConfigurableNotificationsEnabled && recentNotifications.length === 0 ? (
                            <Box sx={{ px: 2, py: 2, color: 'text.secondary' }}>
                                Notifications are turned off in Settings.
                            </Box>
                        ) : recentNotifications.length === 0 ? (
                            <Box sx={{ px: 2, py: 2, color: 'text.secondary' }}>
                                No notifications yet.
                            </Box>
                        ) : (
                            recentNotifications.map((n: NotificationItem) => (
                                <MenuItem
                                    key={n.id}
                                    onClick={() => {
                                        handleNotifClose();
                                        if (n.path) {
                                            navigate(n.path);
                                        }
                                    }}
                                    sx={{ alignItems: 'flex-start', gap: 1 }}
                                >
                                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', mt: 0.8 }} />
                                    <Box>
                                        <Typography variant="body2" fontWeight={700}>{n.title}</Typography>
                                        <Typography variant="caption" color="text.secondary">{n.detail}</Typography>
                                        <Typography variant="caption" color="text.secondary" display="block">{n.time}</Typography>
                                    </Box>
                                </MenuItem>
                            ))
                        )}
                        <Box sx={{ px: 2, py: 1 }}>
                            <Button
                                fullWidth
                                variant="text"
                                onClick={() => {
                                    handleNotifClose();
                                    navigate('/notifications');
                                }}
                            >
                                Show all notifications
                            </Button>
                        </Box>
                    </Menu>
                </Box>
            </Toolbar>
        </AppBar>
    );
};

export default Navbar;
