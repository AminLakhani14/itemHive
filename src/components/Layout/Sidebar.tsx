import React from 'react';
import {
    Box,
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Toolbar,
    Typography,
    Divider,
    alpha,
    IconButton,
    useTheme
} from '@mui/material';
import {
    LayoutDashboard,
    Package,
    History,
    BarChart3,
    Monitor as TerminalIcon,
    ClipboardList,
    FileClock,
    ChartNoAxesCombined,
    WalletCards,
    CalendarClock,
    Users,
    Contact,
    ReceiptText,
    QrCode,
    UserPlus,
    ClipboardCheck,
    ShieldCheck,
    Scale,
    IdCard,
    ScanFace,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { toggleSidebar } from '../../features/theme/themeSlice';
import { hasScreenAccess, type ScreenPermission } from '../../lib/screenPermissions';
import { payrollScreens, financeScreens, personalScreens } from '../../lib/workflowScreens';
import { useLogoPlate } from '../../lib/logoVisibility';

const drawerWidth = 260;
const collapsedWidth = 80;

interface SidebarProps {
    mobileOpen: boolean;
    onDrawerToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onDrawerToggle }) => {
    const theme = useTheme();
    const dispatch = useDispatch();
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useSelector((state: RootState) => state.auth);
    const sidebarFontColor = useSelector((state: RootState) => {
        const preview = state.themePreview.value;
        return (preview && preview.userId === state.auth.user?.id
            ? preview.appearance.sidebarFontColor
            : state.auth.user?.appearance?.sidebarFontColor) || '';
    });
    const sidebarColor = useSelector((state: RootState) => {
        const preview = state.themePreview.value;
        return (preview && preview.userId === state.auth.user?.id
            ? preview.appearance.sidebarColor
            : state.auth.user?.appearance?.sidebarColor) || '';
    });
    const logo = useSelector((state: RootState) => {
        const preview = state.themePreview.value;
        return (preview && preview.userId === state.auth.user?.id
            ? preview.appearance.logo
            : state.auth.user?.appearance?.logo) || '/favicon.png';
    });
    const { isSidebarCollapsed } = useSelector((state: RootState) => state.theme);
    const { app } = useSelector((state: RootState) => state.settings);
    const hasCustomLogo = logo !== '/favicon.png';
    const logoPlate = useLogoPlate(logo, sidebarColor || theme.palette.background.paper, [theme.palette.background.default]);
    const currentWidth = isSidebarCollapsed ? collapsedWidth : drawerWidth;
    const currentRole = user?.role || 'user';
    const canAccessInstallments = user?.role === 'super_admin' || Boolean(app?.installmentsEnabled && user?.installmentAccess);

    const menuItems: Array<{ text: string; icon: React.ReactNode; path: string; roles: string[]; permission?: ScreenPermission; permissions?: ScreenPermission[]; requiresInstallmentAccess?: boolean; requiresDigitalMenuAccess?: boolean; requiresSignupApproval?: boolean }> = [
        { text: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/', roles: ['super_admin', 'admin', 'user'], permission: 'dashboard' },
        { text: 'POS Terminal', icon: <TerminalIcon size={20} />, path: '/pos', roles: ['super_admin', 'admin', 'user'], permission: 'pos' },
        { text: 'Shift Management', icon: <ChartNoAxesCombined size={20} />, path: '/pos-reports', roles: ['super_admin', 'admin', 'user'], permission: 'pos' },
        { text: 'Order Drafts', icon: <FileClock size={20} />, path: '/order-drafts', roles: ['super_admin', 'admin', 'user'], permission: 'pos' },
        { text: 'Inventory', icon: <Package size={20} />, path: '/inventory', roles: ['super_admin', 'admin', 'user'], permission: 'inventory' },
        { text: 'Product Units', icon: <Scale size={20} />, path: '/inventory/units', roles: ['super_admin', 'admin', 'user'], permission: 'inventory_units' },
        { text: 'Inventory Requests', icon: <ClipboardCheck size={20} />, path: '/inventory/requests', roles: ['super_admin', 'admin', 'user'], permission: 'inventory_requests' },
        { text: 'Order Desk', icon: <ClipboardList size={20} />, path: '/orders', roles: ['super_admin', 'admin', 'user'], permission: 'orders' },
        { text: 'Digital Menus', icon: <QrCode size={20} />, path: '/digital-menus', roles: ['super_admin', 'admin', 'user'], permission: 'digital_menus', requiresDigitalMenuAccess: true },
        { text: 'Transactions', icon: <History size={20} />, path: '/transactions', roles: ['super_admin', 'admin', 'user'], permission: 'transactions' },
        { text: 'Customers', icon: <Contact size={20} />, path: '/customers', roles: ['super_admin', 'admin', 'user'], permission: 'customers' },
        { text: 'Customer Records', icon: <ReceiptText size={20} />, path: '/customer-records', roles: ['super_admin', 'admin', 'user'], permission: 'customer_records' },
        { text: 'Credit Customers', icon: <WalletCards size={20} />, path: '/credits', roles: ['super_admin', 'admin', 'user'], permission: 'credits' },
        { text: 'Installments', icon: <CalendarClock size={20} />, path: '/installments', roles: ['super_admin', 'admin', 'user'], permission: 'installments', requiresInstallmentAccess: true },
        { text: 'Employees', icon: <IdCard size={20} />, path: '/employees', roles: ['super_admin', 'admin'], permission: 'employees' },
        { text: 'Payroll', icon: <WalletCards size={20} />, path: '/payroll', roles: ['super_admin', 'admin'], permissions: payrollScreens.flatMap(s => s.permissions) },
        { text: 'My Workspace', icon: <ReceiptText size={20} />, path: '/my', roles: ['super_admin', 'admin', 'user'], permissions: personalScreens.flatMap(s => s.permissions) },
        { text: 'Finance', icon: <WalletCards size={20} />, path: '/finance', roles: ['super_admin', 'admin', 'user'], permissions: financeScreens.flatMap(s => s.permissions) },
        { text: 'Attendance', icon: <ScanFace size={20} />, path: '/attendance', roles: ['super_admin', 'admin', 'user'], permission: 'attendance' },
        { text: 'Reports', icon: <BarChart3 size={20} />, path: '/reports', roles: ['super_admin', 'admin'], permission: 'reports' },
        { text: 'Team', icon: <Users size={20} />, path: '/team', roles: ['super_admin', 'admin'], permission: 'team' },
        { text: 'Permissions', icon: <ShieldCheck size={20} />, path: '/permission-management', roles: ['super_admin'] },
        { text: 'Signup Requests', icon: <UserPlus size={20} />, path: '/signup-requests', roles: ['super_admin'], requiresSignupApproval: true },
    ];

    const drawer = (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <Toolbar sx={{
                px: isSidebarCollapsed ? 2 : 2.5,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
                minHeight: '80px !important'
            }}>
                {!isSidebarCollapsed && <Box
                    component="img"
                    src={logo}
                    alt="Logo"
                    sx={{ width: hasCustomLogo ? '100%' : 32, height: hasCustomLogo ? 64 : 32, maxWidth: '100%', objectFit: 'contain', flexShrink: 0, ...(logoPlate && { bgcolor: logoPlate, borderRadius: 1.5, p: 0.75 }) }}
                />}
                {!isSidebarCollapsed && !hasCustomLogo && (
                    <Typography
                        variant="h6"
                        fontWeight={900}
                        color="primary.main"
                        noWrap
                        sx={{
                            fontSize: '1.4rem',
                            letterSpacing: -0.5,
                            background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.primary.light})`,
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: sidebarFontColor || 'transparent',
                        }}
                    >
                        ItemHive
                    </Typography>
                )}
            </Toolbar>

            <Box sx={{
                position: 'absolute',
                right: -15,
                top: 75,
                zIndex: 10,
                display: { xs: 'none', sm: 'block' }
            }}>
                <IconButton
                    onClick={() => dispatch(toggleSidebar())}
                    sx={{
                        width: 30,
                        height: 30,
                        bgcolor: sidebarColor || 'background.paper',
                        border: '1px solid',
                        borderColor: 'divider',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                        '&:hover': {
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            transform: 'scale(1.1)',
                        },
                        transition: 'all 0.2s',
                        // The button sits on the sidebar color, so it uses the sidebar's text color to stay visible.
                        color: sidebarFontColor || 'text.secondary',
                        p: 0,
                    }}
                >
                    {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </IconButton>
            </Box>

            <Box sx={{ p: isSidebarCollapsed ? 2 : 3, textAlign: isSidebarCollapsed ? 'center' : 'left' }}>

            </Box>
            <Box
                sx={{
                    flexGrow: 1,
                    overflowY: 'auto',
                    px: 2,
                    pb: 1.5,
                    '&::-webkit-scrollbar': { width: 6 },
                    // The global light track would show as a strip on dark sidebars.
                    '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
                    '&::-webkit-scrollbar-thumb': {
                        backgroundColor: alpha(theme.palette.primary.main, 0.35),
                        borderRadius: 8,
                    },
                }}
            >
                <List sx={{ px: 0 }}>
                    {menuItems
                        .filter(item => item.roles.includes(currentRole)
                            && (!item.permission || hasScreenAccess(user, item.permission))
                            && (!item.permissions || item.permissions.some(p => hasScreenAccess(user, p)))
                            && (!item.requiresInstallmentAccess || canAccessInstallments)
                            && (!item.requiresDigitalMenuAccess || currentRole === 'super_admin' || user?.digitalMenuAccess !== 'none')
                            && (!item.requiresSignupApproval || !app?.autoRegistrationEnabled))
                        .map((item) => {
                            const isActive = location.pathname === item.path || (['/employees', '/digital-menus', '/payroll', '/finance', '/my'].includes(item.path) && location.pathname.startsWith(`${item.path}/`));
                            return (
                                <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
                                    <ListItemButton
                                        onClick={() => {
                                            navigate(item.path);
                                            if (mobileOpen) onDrawerToggle();
                                        }}
                                        sx={{
                                            p: isSidebarCollapsed ? 1.5 : 2,
                                            justifyContent: isSidebarCollapsed ? 'center' : 'initial',
                                            borderRadius: 2,
                                            backgroundColor: isActive ? 'primary.main' : 'transparent',
                                            color: sidebarFontColor || (isActive ? 'primary.contrastText' : 'text.primary'),
                                            '&:hover': {
                                                backgroundColor: isActive ? 'primary.dark' : (theme) => alpha(theme.palette.primary.main, 0.1),
                                                color: sidebarFontColor || (isActive ? 'primary.contrastText' : 'primary.main'),
                                                '& .MuiListItemIcon-root': {
                                                    color: sidebarFontColor || (isActive ? 'primary.contrastText' : 'primary.main'),
                                                }
                                            },
                                        }}
                                    >
                                        <ListItemIcon
                                            sx={{
                                                minWidth: isSidebarCollapsed ? 0 : 40,
                                                mr: isSidebarCollapsed ? 0 : 0,
                                                justifyContent: 'center',
                                                color: sidebarFontColor || (isActive ? 'primary.contrastText' : 'text.secondary')
                                            }}
                                        >
                                            {item.icon}
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={item.text}
                                            sx={{ opacity: isSidebarCollapsed ? 0 : 1, width: isSidebarCollapsed ? 0 : 'auto', m: 0 }}
                                            primaryTypographyProps={{
                                                fontSize: '0.9rem',
                                                fontWeight: isActive ? 700 : 600
                                            }}
                                        />
                                    </ListItemButton>
                                </ListItem>
                            );
                        })}
                </List>
            </Box>
            {!isSidebarCollapsed && <Box sx={{ mt: 'auto', p: 2 }}>
                <Divider sx={{ mb: isSidebarCollapsed ? 2 : 1.5 }} />
                <Typography variant="caption" component="p" noWrap sx={{ textAlign: 'center', color: sidebarFontColor || 'text.secondary', opacity: 0.8 }}>
                    Powered by <Box component="span" sx={{ fontWeight: 800 }}>ItemHive</Box>
                </Typography>
            </Box>}
        </Box>
    );

    return (
        <Box
            component="nav"
            sx={{
                width: { sm: currentWidth },
                flexShrink: { sm: 0 },
                transition: (theme) => theme.transitions.create('width', {
                    easing: theme.transitions.easing.sharp,
                    duration: theme.transitions.duration.enteringScreen,
                }),
            }}
        >
            <Drawer
                variant="temporary"
                open={mobileOpen}
                onClose={onDrawerToggle}
                ModalProps={{ keepMounted: true }}
                sx={{
                    display: { xs: 'block', sm: 'none' },
                    '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, bgcolor: sidebarColor || 'background.paper', borderRadius: 0 },
                }}
            >
                {drawer}
            </Drawer>
            <Drawer
                variant="permanent"
                sx={{
                    display: { xs: 'none', sm: 'block' },
                    '& .MuiDrawer-paper': {
                        boxSizing: 'border-box',
                        width: currentWidth,
                        bgcolor: sidebarColor || 'background.paper',
                        // The theme rounds every Paper; the full-height nav must stay square so no page shows at its corners.
                        borderRadius: 0,
                        borderRight: '1px solid',
                        borderColor: 'divider',
                        transition: (theme) => theme.transitions.create('width', {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.enteringScreen,
                        }),
                        overflow: 'visible'
                    },
                }}
                open
            >
                {drawer}
            </Drawer>
        </Box>
    );
};

export default Sidebar;
