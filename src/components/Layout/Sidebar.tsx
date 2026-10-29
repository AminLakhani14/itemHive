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
    Tooltip,
    alpha,
    IconButton,
    useMediaQuery,
    useTheme
} from '@mui/material';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { toggleSidebar } from '../../features/theme/themeSlice';
import { getDigitalMenuAccess, hasInstallmentAccess, hasScreenAccess } from '../../lib/screenPermissions';
import { useLogoPlate } from '../../lib/logoVisibility';

import { NAV_MODULES, NAV_SECTIONS } from '../../lib/navigation';

const drawerWidth = 260;
const collapsedWidth = 80;

function readFavorites(key: string): string[] {
    try {
        const saved: unknown = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(saved) ? [...new Set(saved.filter((path): path is string => typeof path === 'string'))] : [];
    } catch {
        return [];
    }
}

interface SidebarProps {
    mobileOpen: boolean;
    onDrawerToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onDrawerToggle }) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const dispatch = useDispatch();
    const location = useLocation();
    const { user } = useSelector((state: RootState) => state.auth);
    const favoritesKey = `itemhive-nav-favorites:${user?.id || 'guest'}`;
    const [savedFavorites, setSavedFavorites] = React.useState(() => ({ key: favoritesKey, paths: readFavorites(favoritesKey) }));
    const favorites = savedFavorites.key === favoritesKey ? savedFavorites.paths : readFavorites(favoritesKey);
    const toggleFavorite = (path: string) => {
        setSavedFavorites(previous => {
            const paths = previous.key === favoritesKey ? previous.paths : readFavorites(favoritesKey);
            const next = paths.includes(path) ? paths.filter(saved => saved !== path) : [...paths, path];
            try { localStorage.setItem(favoritesKey, JSON.stringify(next)); } catch { /* Favorites still work when browser storage is unavailable. */ }
            return { key: favoritesKey, paths: next };
        });
    };
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
            : state.auth.user?.appearance?.logo) || '/OZOR-transparent.webp';
    });
    const { isSidebarCollapsed } = useSelector((state: RootState) => state.theme);
    const compact = isSidebarCollapsed && !isMobile;
    const { app } = useSelector((state: RootState) => state.settings);
    const logoPlate = useLogoPlate(logo, sidebarColor || theme.palette.background.paper, [theme.palette.background.default]);
    const currentWidth = isSidebarCollapsed ? collapsedWidth : drawerWidth;
    const currentRole = user?.role || 'user';
    const canAccessInstallments = hasInstallmentAccess(user, app?.installmentsEnabled);

    const visibleItems = NAV_MODULES.filter(item => item.roles.includes(currentRole)
        && (!item.permission || hasScreenAccess(user, item.permission))
        && (!item.permissions || item.permissions.some(p => hasScreenAccess(user, p)))
        && (!item.requiresInstallmentAccess || canAccessInstallments)
        && (!item.requiresDigitalMenuAccess || getDigitalMenuAccess(user) !== 'none')
        && (!item.requiresSignupApproval || !app?.autoRegistrationEnabled));
    const sections = NAV_SECTIONS.map(section => ({
        title: section.title,
        items: section.paths.flatMap(path => {
            const item = visibleItems.find(item => item.path === path);
            if (!item) return [];
            if (!item.children) return [item];
            return item.children
                .filter(screen => screen.permissions.some(permission => hasScreenAccess(user, permission)))
                .map(screen => ({ ...item, text: screen.title, path: screen.path, children: undefined }));
        }),
    })).filter(section => section.items.length > 0);

    const favoriteItems = favorites.flatMap(path => {
        const item = sections.flatMap(section => section.items).find(item => item.path === path);
        return item ? [item] : [];
    });
    const displaySections = [
        ...sections.filter(section => !section.title),
        { title: 'Favorites', items: favoriteItems },
        ...sections.filter(section => section.title),
    ];

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
                    alt="Ozor"
                    sx={{ width: '100%', height: 64, maxWidth: '100%', objectFit: 'contain', flexShrink: 0, ...(logoPlate && { bgcolor: logoPlate, borderRadius: 1.5, p: 0.75 }) }}
                />}

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
                {displaySections.map((section, index) => <Box key={section.title || 'home'} component="section" aria-label={section.title || 'Home'}>
                    {section.title && (compact
                        ? <Divider sx={{ my: 1.5 }} />
                        : <Typography component="h2" sx={{ px: 1.5, pt: index ? 2 : 1, pb: 0.75, m: 0, fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: sidebarFontColor || 'text.secondary', opacity: 0.75 }}>{section.title}</Typography>)}
                    {section.title === 'Favorites' && !section.items.length && !compact && <Typography sx={{ px: 1.5, pb: 1, fontSize: '0.75rem', color: sidebarFontColor || 'text.secondary' }}>Star a screen to add it here.</Typography>}
                    <List aria-label={section.title || 'Home'} disablePadding>
                        {section.items.map(item => {
                            const isActive = location.pathname === item.path || (['/employees', '/digital-menus'].includes(item.path) && location.pathname.startsWith(`${item.path}/`));
                            const isFavorite = favorites.includes(item.path);
                            const favoriteLabel = `${isFavorite ? 'Remove' : 'Add'} ${item.text} ${isFavorite ? 'from' : 'to'} favorites`;
                            return <ListItem key={item.path} disablePadding sx={{ mb: 0.5, position: 'relative' }}>
                                <Tooltip title={compact ? item.text : ''} placement="right">
                                    <ListItemButton component={Link} to={item.path} aria-label={item.text} aria-current={isActive ? 'page' : undefined}
                                        onClick={() => { if (mobileOpen) onDrawerToggle(); }}
                                        sx={{
                                            pl: compact ? 1.5 : 1.25, pr: compact ? 1.5 : 4.5, py: 1,
                                            justifyContent: compact ? 'center' : 'initial', borderRadius: 2,
                                            bgcolor: isActive ? 'primary.main' : 'transparent',
                                            color: isActive ? 'primary.contrastText' : (sidebarFontColor || 'text.primary'),
                                            '&:hover': { bgcolor: isActive ? 'primary.dark' : alpha(theme.palette.primary.main, 0.1) },
                                        }}>
                                        <ListItemIcon sx={{ minWidth: compact ? 0 : 34, justifyContent: 'center', color: isActive ? 'primary.contrastText' : (sidebarFontColor || 'text.secondary') }}>{item.icon}</ListItemIcon>
                                        {!compact && <ListItemText primary={item.text} sx={{ m: 0 }} primaryTypographyProps={{ fontSize: '0.84rem', lineHeight: 1.4, fontWeight: isActive ? 700 : 500 }} />}
                                    </ListItemButton>
                                </Tooltip>
                                <Tooltip title={favoriteLabel} placement="right">
                                    <IconButton size="small" aria-label={favoriteLabel} aria-pressed={isFavorite}
                                        onClick={() => toggleFavorite(item.path)}
                                        sx={{ position: 'absolute', right: compact ? -5 : 4, top: compact ? -3 : '50%', transform: compact ? undefined : 'translateY(-50%)', p: compact ? 0.25 : 0.6, color: isActive ? 'primary.contrastText' : (isFavorite ? 'warning.main' : (sidebarFontColor || 'text.secondary')), bgcolor: compact ? (sidebarColor || 'background.paper') : 'transparent', '&:hover': { bgcolor: isActive ? alpha(theme.palette.primary.contrastText, 0.15) : 'action.hover' } }}>
                                        <Star size={compact ? 12 : 16} fill={isFavorite ? 'currentColor' : 'none'} />
                                    </IconButton>
                                </Tooltip>
                            </ListItem>;
                        })}
                    </List>
                </Box>)}
            </Box>
            {!compact && <Box sx={{ mt: 'auto', p: 2 }}>
                <Divider sx={{ mb: compact ? 2 : 1.5 }} />
                <Typography variant="caption" component="p" noWrap sx={{ textAlign: 'center', color: sidebarFontColor || 'text.secondary', opacity: 0.8 }}>
                    Powered by <Box component="span" sx={{ fontWeight: 800 }}>Ozor</Box>
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
