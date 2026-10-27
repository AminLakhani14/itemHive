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
    Collapse,
    Tooltip,
    alpha,
    IconButton,
    useMediaQuery,
    useTheme
} from '@mui/material';
import { ChevronLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { toggleSidebar } from '../../features/theme/themeSlice';
import { getDigitalMenuAccess, hasInstallmentAccess, hasScreenAccess } from '../../lib/screenPermissions';
import { workflowGroups } from '../../lib/workflowScreens';
import { useLogoPlate } from '../../lib/logoVisibility';

import { NAV_MODULES } from '../../lib/navigation';

const drawerWidth = 260;
const collapsedWidth = 80;

interface SidebarProps {
    mobileOpen: boolean;
    onDrawerToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onDrawerToggle }) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
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
    const compact = isSidebarCollapsed && !isMobile;
    const activeGroup = workflowGroups.find(g => g.screens.some(s => s.path === location.pathname))?.path;
    const [expanded, setExpanded] = React.useState<Record<string, boolean>>(() => activeGroup ? { [activeGroup]: true } : {});
    React.useEffect(() => {
        if (activeGroup) setExpanded(previous => ({ ...previous, [activeGroup]: true }));
    }, [activeGroup, location.pathname]);
    const { app } = useSelector((state: RootState) => state.settings);
    const hasCustomLogo = logo !== '/favicon.png';
    const logoPlate = useLogoPlate(logo, sidebarColor || theme.palette.background.paper, [theme.palette.background.default]);
    const currentWidth = isSidebarCollapsed ? collapsedWidth : drawerWidth;
    const currentRole = user?.role || 'user';
    const canAccessInstallments = hasInstallmentAccess(user, app?.installmentsEnabled);

    const menuItems = NAV_MODULES;

    const drawer = (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <Toolbar sx={{
                px: compact ? 2 : 2.5,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                justifyContent: compact ? 'center' : 'flex-start',
                minHeight: '80px !important'
            }}>
                {!compact && <Box
                    component="img"
                    src={logo}
                    alt="Logo"
                    sx={{ width: hasCustomLogo ? '100%' : 32, height: hasCustomLogo ? 64 : 32, maxWidth: '100%', objectFit: 'contain', flexShrink: 0, ...(logoPlate && { bgcolor: logoPlate, borderRadius: 1.5, p: 0.75 }) }}
                />}
                {!compact && !hasCustomLogo && (
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
                    aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
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
                    {compact ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </IconButton>
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
                            && (!item.requiresDigitalMenuAccess || getDigitalMenuAccess(user) !== 'none')
                            && (!item.requiresSignupApproval || !app?.autoRegistrationEnabled))
                        .map((item) => {
                            const children = item.children?.filter(screen => screen.permissions.some(permission => hasScreenAccess(user, permission)));
                            const isActive = children ? children.some(screen => screen.path === location.pathname) : location.pathname === item.path || (['/employees', '/digital-menus'].includes(item.path) && location.pathname.startsWith(`${item.path}/`));
                            const isExpanded = !!expanded[item.path] && !compact;
                            return (
                                <ListItem key={item.text} disablePadding sx={{ mb: 0.5, display: 'block' }}>
                                    <Tooltip title={compact ? item.text : ''} placement="right">
                                    <ListItemButton
                                        aria-label={item.text}
                                        aria-expanded={children ? isExpanded : undefined}
                                        aria-controls={children ? 'nav-' + item.path.slice(1) : undefined}
                                        aria-current={!children && isActive ? 'page' : undefined}
                                        onClick={() => {
                                            if (children) {
                                                if (compact) dispatch(toggleSidebar());
                                                setExpanded(previous => ({ ...previous, [item.path]: compact || !previous[item.path] }));
                                                return;
                                            }
                                            navigate(item.path);
                                            if (mobileOpen) onDrawerToggle();
                                        }}
                                        sx={{
                                            p: compact ? 1.5 : 1.25,
                                            justifyContent: compact ? 'center' : 'initial',
                                            borderRadius: 2,
                                            backgroundColor: isActive ? 'primary.main' : 'transparent',
                                            color: isActive ? 'primary.contrastText' : (sidebarFontColor || 'text.primary'),
                                            '&:hover': {
                                                backgroundColor: isActive ? 'primary.dark' : (theme) => alpha(theme.palette.primary.main, 0.1),
                                                color: isActive ? 'primary.contrastText' : (sidebarFontColor || 'primary.main'),
                                                '& .MuiListItemIcon-root': {
                                                    color: isActive ? 'primary.contrastText' : (sidebarFontColor || 'primary.main'),
                                                }
                                            },
                                        }}
                                    >
                                        <ListItemIcon
                                            sx={{
                                                minWidth: compact ? 0 : 40,
                                                mr: compact ? 0 : 0,
                                                justifyContent: 'center',
                                                color: isActive ? 'primary.contrastText' : (sidebarFontColor || 'text.secondary')
                                            }}
                                        >
                                            {item.icon}
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={item.text}
                                            sx={{ opacity: compact ? 0 : 1, width: compact ? 0 : 'auto', m: 0 }}
                                            primaryTypographyProps={{
                                                fontSize: '0.9rem',
                                                fontWeight: isActive ? 700 : 600
                                            }}
                                        />
                                        {children && !compact && <ChevronDown size={17} style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : undefined }} />}
                                    </ListItemButton>
                                    </Tooltip>
                                    {children && <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                        <List id={'nav-' + item.path.slice(1)} aria-label={item.text + ' screens'} disablePadding sx={{ ml: 2.25, mt: 0.5, pl: 1, borderLeft: '1px solid', borderColor: 'divider' }}>
                                            {children.map(screen => {
                                                const selected = location.pathname === screen.path;
                                                return <ListItem key={screen.path} disablePadding>
                                                    <ListItemButton component={Link} to={screen.path} selected={selected} aria-current={selected ? 'page' : undefined}
                                                        onClick={() => { if (mobileOpen) onDrawerToggle(); }}
                                                        sx={{ px: 1.25, py: 0.85, mb: 0.25, borderRadius: 1.5, color: sidebarFontColor || (selected ? 'primary.main' : 'text.secondary'), '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.12) }, '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) } }}>
                                                        <ListItemText primary={screen.title} sx={{ m: 0 }} primaryTypographyProps={{ fontSize: '0.82rem', lineHeight: 1.4, fontWeight: selected ? 700 : 500 }} />
                                                    </ListItemButton>
                                                </ListItem>;
                                            })}
                                        </List>
                                    </Collapse>}
                                </ListItem>
                            );
                        })}
                </List>
            </Box>
            {!compact && <Box sx={{ mt: 'auto', p: 2 }}>
                <Divider sx={{ mb: compact ? 2 : 1.5 }} />
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
