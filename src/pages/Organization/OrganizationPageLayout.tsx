import type { PropsWithChildren, ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

export default function OrganizationPageLayout({ children, icon, title, description, action }: PropsWithChildren<{ icon: ReactNode; title: string; description: string; action?: ReactNode }>) {
    return <Box>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2} sx={{ mb: 3 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ width: 46, height: 46, borderRadius: 2.5, bgcolor: 'action.selected', color: 'primary.main', display: 'grid', placeItems: 'center' }}>{icon}</Box>
                <Box>
                    <Typography variant="h4" fontWeight={900}>{title}</Typography>
                    <Typography color="text.secondary">{description}</Typography>
                </Box>
            </Stack>
            {action}
        </Stack>
        {children}
    </Box>;
}
