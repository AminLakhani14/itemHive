import type { PropsWithChildren } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';

export default function FormSection({ number, title, description, children }: PropsWithChildren<{ number: string; title: string; description: string }>) {
    return <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Stack direction="row" spacing={1.5} sx={{ p: { xs: 2, sm: 3 }, pb: 2 }} alignItems="flex-start">
            <Box sx={{ width: 34, height: 34, flexShrink: 0, borderRadius: 2, bgcolor: 'action.selected', color: 'primary.main', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{number}</Box>
            <Box><Typography variant="h6" fontWeight={800}>{title}</Typography><Typography variant="body2" color="text.secondary">{description}</Typography></Box>
        </Stack>
        <Divider />
        <Box sx={{ p: { xs: 2, sm: 3 } }}>{children}</Box>
    </Paper>;
}
