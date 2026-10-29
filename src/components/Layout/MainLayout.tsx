import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import ModernLoader from '../Common/ModernLoader';
import WorkflowApiLoader from '../Common/WorkflowApiLoader';

import React, { useState, useEffect } from 'react';
import { Box, CssBaseline } from '@mui/material';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import { Outlet } from 'react-router-dom';
import ScrollToTopFab from '../Common/ScrollToTopFab';

const MainLayout: React.FC = () => {
    const [initiallyLoading, setInitiallyLoading] = useState(true);
    const [initialRequestStarted, setInitialRequestStarted] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const { isSidebarCollapsed } = useSelector((state: RootState) => state.theme);
    const { loading: productsLoading } = useSelector((state: RootState) => state.inventory);
    const { loading: transactionsLoading } = useSelector((state: RootState) => state.transactions);
    const { loading: settingsLoading } = useSelector((state: RootState) => state.settings);
    const branchSwitchCount = useSelector((state: RootState) => state.branch.switchCount);

    const drawerWidth = 260;
    const collapsedWidth = 80;
    const currentWidth = isSidebarCollapsed ? collapsedWidth : drawerWidth;

    const apiLoading = productsLoading || transactionsLoading || settingsLoading;

    // Keep the branded full-page loader through the first post-login data
    // bootstrap. Later requests only cover the page content.
    if (initiallyLoading) {
        if (apiLoading && !initialRequestStarted) setInitialRequestStarted(true);
        else if (!apiLoading && initialRequestStarted) setInitiallyLoading(false);
    }

    // No bootstrap request seen: the page doesn't use these slices (e.g. Attendance),
    // or they finished while the lazy route chunk was still downloading.
    useEffect(() => {
        if (!initiallyLoading || initialRequestStarted || apiLoading) return;
        const timer = window.setTimeout(() => setInitiallyLoading(false), 300);
        return () => window.clearTimeout(timer);
    }, [apiLoading, initialRequestStarted, initiallyLoading]);

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
            <CssBaseline />
            {/* One consistent app-wide loader for initial data and API refreshes. */}
            <WorkflowApiLoader initiallyLoading={initiallyLoading} />
            <Navbar onMenuClick={handleDrawerToggle} />
            <Sidebar mobileOpen={mobileOpen} onDrawerToggle={handleDrawerToggle} />
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    p: { xs: 1.5, sm: 2, md: 3 },
                    width: { sm: `calc(100% - ${currentWidth}px)` },
                    // ml: { sm: `${currentWidth}px` },
                    mt: { xs: '56px', sm: '64px' },
                    overflowX: 'hidden',
                    transition: (theme) => theme.transitions.create(['width', 'margin'], {
                        easing: theme.transitions.easing.sharp,
                        duration: theme.transitions.duration.enteringScreen,
                    }),
                    position: 'relative',
                }}
            >
                {/* Remount the page after a branch switch, so it loads the new branch's data. */}
                <Outlet key={branchSwitchCount} />
                {!initiallyLoading && apiLoading && <ModernLoader fullPage={false} />}
            </Box>
            <ScrollToTopFab />
        </Box>
    );
};

export default MainLayout;
