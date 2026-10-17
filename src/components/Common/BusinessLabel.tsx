import { Stack, Tooltip } from '@mui/material';
import { Info } from 'lucide-react';

export default function BusinessLabel() {
    return <Stack direction="row" spacing={0.5} alignItems="center">
        <span>Business</span>
        <Tooltip title="To edit or delete a business, go to Settings → Business Management." arrow>
            <Info size={16} aria-label="Business management information" />
        </Tooltip>
    </Stack>;
}
